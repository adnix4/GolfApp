#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// seed_league_season.mjs — League-play seed generator + season driver
// ─────────────────────────────────────────────────────────────────────────────
//
// The league analogue of seed_demo_event.mjs. Creates a fully-populated league
// season through the REAL API (not direct SQL), then plays it ONE ROUND AT A
// TIME so a human can review the standings, handicaps, and skins evolving after
// each round in the admin app.
//
// Unlike a tournament event (a single Draft→…→Completed status machine), a league
// season is driven by the ROUND status machine, repeated per round:
//
//   create round (Scheduled) → save pairings (Open) → open scoring (Scoring)
//   → submit every member's 18 holes → close round (Closed)
//
// Closing a round is where the engines fire: handicaps recalculate, standings
// update, and skins resolve. Reviewing AFTER EACH round is the whole point —
// watch indexes drift and the leaderboard reshuffle.
//
//   setup .......... org+admin, league (Stableford · Club handicap), season,
//                    3 flights, ~18 members spread across handicaps. No rounds yet.
//   round (xN) ..... play & close the next round (pairings → scoring → close
//                    with a skins pot). Repeat until the season's rounds are done.
//   status ......... current standings (top), rounds played, member handicaps,
//                    last round's skins, review URLs.
//   reset .......... forget local state so a new run can start clean.
//
// Rounds use the API's simplified no-course model (par 4, per-hole stroke index =
// hole number), so the seeder is fully self-contained — no course/event needed.
//
// USAGE:
//   node seed_league_season.mjs setup
//   node seed_league_season.mjs round      # play + close one round; review; repeat
//   node seed_league_season.mjs status
//   node seed_league_season.mjs reset
//
// ENV OVERRIDES:
//   API_BASE     (default http://localhost:5000)
//   ADMIN_BASE   (default http://localhost:8081 — Expo web admin app)
//   MEMBER_COUNT (default 18, clamped to 8–40)
//   TOTAL_ROUNDS (default 4,  clamped to 1–10)
//   SKINS_POT    (default 200 — cents per hole per player; 0 disables skins)
//   LEAGUE_FORMAT(default Stableford — Stableford|Stroke|Match|Quota)
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE       = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(HERE, '.state.json');

const API_BASE     = (process.env.API_BASE   || 'http://localhost:5000').replace(/\/$/, '');
const ADMIN_BASE   = (process.env.ADMIN_BASE || 'http://localhost:8081').replace(/\/$/, '');
const MEMBER_COUNT = Math.min(40, Math.max(8,  parseInt(process.env.MEMBER_COUNT || '18', 10)));
const TOTAL_ROUNDS = Math.min(10, Math.max(1,  parseInt(process.env.TOTAL_ROUNDS || '4', 10)));
const SKINS_POT    = Math.max(0, parseInt(process.env.SKINS_POT || '200', 10));
const LEAGUE_FORMAT = process.env.LEAGUE_FORMAT || 'Stableford';

const HOLES = 18;

// ── DEMO CONTENT ─────────────────────────────────────────────────────────────

// Flights by handicap band. Members are assigned to the band their index falls in.
const FLIGHTS = [
  { name: 'A Flight (0–9)',   minHandicap: 0,    maxHandicap: 9.9 },
  { name: 'B Flight (10–18)', minHandicap: 10,   maxHandicap: 18.9 },
  { name: 'C Flight (19+)',   minHandicap: 19,   maxHandicap: 54 },
];

const FIRST = ['James','Maria','Robert','Lisa','Michael','Sarah','David','Emily','Daniel','Jessica','Matthew','Ashley','Chris','Amanda','Josh','Megan','Andrew','Steph','Kevin','Rachel','Brian','Nicole','Ryan','Heather','Justin','Amber','Brandon','Sam','Tyler','Brittany','Gary','Paula','Hank','Olivia','Pedro','Quinn','Rosa','Victor','Wendy','Xavier'];
const LAST  = ['Anderson','Johnson','Smith','Williams','Brown','Jones','Garcia','Davis','Miller','Wilson','Moore','Taylor','Thomas','Jackson','White','Harris','Martin','Thompson','Martinez','Robinson'];

// ── HTTP HELPERS ─────────────────────────────────────────────────────────────

// `device` sets X-GFP-Device, which the API's global rate limiter uses as its
// per-device fairness key (600 req/min each). Without it every request shares
// one IP-keyed bucket, and a full round's ~324 score POSTs trip a 429 — pass a
// distinct id per simulated member, exactly like real scorer devices do.
async function api(method, path, { token, body, raw, device } = {}) {
  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(device ? { 'X-GFP-Device': device } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status !== 429 || attempt >= 3) break;
    // Sliding-window limiter: wait out the window (Retry-After when provided).
    const wait = Number(res.headers.get('retry-after')) || 15;
    log(`  …429 rate-limited, waiting ${wait}s (retry ${attempt + 1}/3)`);
    await new Promise(r => setTimeout(r, wait * 1000));
  }
  if (raw) return res;
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) {
    const msg = (data && (data.detail || data.title || data.error)) || text || res.statusText;
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
  }
  return data;
}

async function assertApiUp() {
  try {
    await fetch(`${API_BASE}/api/v1/pub/events/__ping__`);
  } catch {
    fail(`Cannot reach the API at ${API_BASE}.\n` +
         `Start it first:  cd apps/api && dotnet run`);
  }
}

// ── STATE ────────────────────────────────────────────────────────────────────

function loadState() {
  if (!existsSync(STATE_FILE)) fail('No league season found. Run "setup" first.');
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}
function saveState(state) { writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); }

// Access tokens live ~15 min, so re-login at the start of every command.
async function login(state) {
  const auth = await api('POST', '/api/v1/auth/login', {
    body: { email: state.org.email, password: state.org.password },
  });
  return auth.accessToken;
}

// ── OUTPUT ───────────────────────────────────────────────────────────────────

const log  = (...a) => console.log(...a);
const fail = (m) => { console.error(`\n✖ ${m}\n`); process.exit(1); };

function reviewBlock(state) {
  const base = `${ADMIN_BASE}/leagues/${state.league.id}/seasons/${state.season.id}`;
  log('\n──────────────────────────────────────────────────────────');
  log(`  LEAGUE: ${state.league.name}  ·  Season: ${state.season.name}`);
  log(`  Rounds played: ${state.roundsPlayed}/${state.totalRounds}  ·  Format: ${state.league.format}`);
  log('──────────────────────────────────────────────────────────');
  log(`  Admin login   : ${state.org.email}  /  ${state.org.password}`);
  log(`  Season (admin): ${base}`);
  log(`  Standings API : ${API_BASE}/api/v1/leagues/${state.league.id}/seasons/${state.season.id}/standings`);
  log('──────────────────────────────────────────────────────────\n');
}

function rand(n) { return Math.floor(Math.random() * n); }
const pad2 = (n) => String(n).padStart(2, '0');
function isoDate(daysFromNow) {
  const d = new Date(Date.now() + daysFromNow * 864e5);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// ── SETUP ────────────────────────────────────────────────────────────────────

async function setup() {
  await assertApiUp();
  if (existsSync(STATE_FILE)) fail('A league season already exists. Run "reset" before creating a new one.');

  const runId = Date.now().toString(36);
  const org = {
    email:    `league.${runId}@example.com`,
    password: 'DemoPass123!',
    slug:     `league-${runId}`,
    name:     'Pinehurst Mens League',
  };

  log(`\n▶ Registering organizer + org (${org.slug})…`);
  const auth = await api('POST', '/api/v1/auth/register', {
    body: {
      email: org.email, password: org.password,
      displayName: 'League Commissioner', orgName: org.name,
      orgSlug: org.slug, is501c3: false,
    },
  });
  const token = auth.accessToken;
  org.id = auth.org.id;

  log(`▶ Creating league (${LEAGUE_FORMAT} · Club handicap)…`);
  const league = await api('POST', '/api/v1/leagues', {
    token,
    body: {
      name: 'Thursday Night Mens League', format: LEAGUE_FORMAT,
      handicapSystem: 'Club', handicapCap: 36, maxFlights: FLIGHTS.length, duesCents: 5000,
    },
  });

  log('▶ Creating season…');
  const season = await api('POST', `/api/v1/leagues/${league.id}/seasons`, {
    token,
    body: {
      name: `${new Date().getUTCFullYear()} Season`, totalRounds: TOTAL_ROUNDS,
      startDate: isoDate(0), endDate: isoDate(TOTAL_ROUNDS * 7 + 7),
      roundsCounted: 0, standingMethod: 'TotalNet',
    },
  });

  log(`▶ Creating ${FLIGHTS.length} flights…`);
  const flights = [];
  for (const f of FLIGHTS) {
    const created = await api('POST', `/api/v1/leagues/${league.id}/seasons/${season.id}/flights`, {
      token, body: { name: f.name, minHandicap: f.minHandicap, maxHandicap: f.maxHandicap },
    });
    flights.push({ id: created.id, ...f });
  }

  log(`▶ Adding ${MEMBER_COUNT} members (spread across handicaps + flights)…`);
  const members = [];
  for (let i = 0; i < MEMBER_COUNT; i++) {
    // Spread handicaps 1..32 deterministically so flights all fill.
    const handicap = Number((1 + (i * 31) / Math.max(1, MEMBER_COUNT - 1)).toFixed(1));
    const flight = flights.find(f => handicap >= f.minHandicap && handicap <= f.maxHandicap) ?? flights[flights.length - 1];
    const first = FIRST[i % FIRST.length];
    const last  = LAST[(i * 7) % LAST.length];
    const created = await api('POST', `/api/v1/leagues/${league.id}/seasons/${season.id}/members`, {
      token,
      body: {
        firstName: first, lastName: last,
        email: `member.${i}.${runId}@example.com`,
        handicapIndex: handicap, flightId: flight.id, status: 'Active',
      },
    });
    members.push({ id: created.id, name: `${first} ${last}`, handicap, flightId: flight.id });
  }

  const state = {
    runId, org,
    league: { id: league.id, name: league.name, format: league.format },
    season: { id: season.id, name: season.name },
    flights, members,
    roundsPlayed: 0, totalRounds: TOTAL_ROUNDS, skinsPot: SKINS_POT,
    apiBase: API_BASE, adminBase: ADMIN_BASE,
    createdAt: new Date().toISOString(),
  };
  saveState(state);

  log('\n✔ Setup complete — league season created, no rounds played yet.');
  log(`  ${flights.length} flights, ${members.length} members. Season runs ${TOTAL_ROUNDS} rounds.`);
  reviewBlock(state);
  log('Review the roster + flights in the admin app, then:');
  log('  node seed_league_season.mjs round   → plays & closes round 1\n');
}

// ── PLAY ONE ROUND ─────────────────────────────────────────────────────────────

// Gross for one par-4 hole for a member: higher handicap → more strokes over par.
function grossForHole(handicap) {
  const par = 4;
  let strokes = par;
  if (Math.random() < handicap / HOLES) strokes += 1;        // a stroke roughly per handicap point
  if (Math.random() < handicap / 60)    strokes += 1;        // occasional double
  if (Math.random() < 0.08)             strokes -= 1;        // occasional birdie
  return Math.max(2, strokes);
}

async function playRound() {
  await assertApiUp();
  const state = loadState();
  if (state.roundsPlayed >= state.totalRounds) {
    fail(`All ${state.totalRounds} rounds have been played. Run "status" to review, or "reset" to start over.`);
  }
  let token = await login(state);

  const roundNum = state.roundsPlayed + 1;
  const L = state.league.id, S = state.season.id;
  const activeMembers = state.members; // all seeded members are Active

  log(`\n▶ Round ${roundNum}/${state.totalRounds}: creating round…`);
  const round = await api('POST', `/api/v1/leagues/${L}/seasons/${S}/rounds`, {
    token, body: { roundDate: isoDate(state.roundsPlayed * 7), notes: `Round ${roundNum}` },
  });
  const R = round.id;

  log('▶ Generating + locking pairings (round → Open)…');
  const groups = await api('POST', `/api/v1/leagues/${L}/seasons/${S}/rounds/${R}/generate-pairings?maxPerGroup=4`, { token });
  await api('PATCH', `/api/v1/leagues/${L}/seasons/${S}/rounds/${R}/pairings`, {
    token,
    body: {
      lock: true,
      groups: groups.map((g, i) => ({
        memberIds: g.memberIds,
        teeTime: `${pad2(8 + Math.floor(i / 6))}:${pad2((i % 6) * 10)}:00`,
        startingHole: (i % HOLES) + 1,
      })),
    },
  });

  log('▶ Opening scoring (round → Scoring)…');
  await api('POST', `/api/v1/leagues/${L}/seasons/${S}/rounds/${R}/open-scoring`, { token });

  log(`▶ Submitting ${activeMembers.length} members × ${HOLES} holes…`);
  let posted = 0;
  for (const m of activeMembers) {
    for (let hole = 1; hole <= HOLES; hole++) {
      await api('POST', `/api/v1/leagues/${L}/seasons/${S}/rounds/${R}/scores`, {
        token, device: `seed-${m.id}`,
        body: { memberId: m.id, holeNumber: hole, grossScore: grossForHole(m.handicap) },
      });
      posted++;
    }
    // Re-login defensively mid-loop so the 15-min token never expires on a long round.
    if (posted % 120 === 0) token = await login(state);
  }

  log(`▶ Closing round (skins pot ${state.skinsPot}¢/hole/player) — recalc handicaps, standings, skins…`);
  await api('POST', `/api/v1/leagues/${L}/seasons/${S}/rounds/${R}/close?skinsPotCentsPerHolePerPlayer=${state.skinsPot}`, { token });

  state.roundsPlayed = roundNum;
  state.lastRoundId = R;
  saveState(state);

  log(`\n✔ Round ${roundNum} closed — ${posted} scores entered.`);
  await printRoundReview(state, token, R);
  reviewBlock(state);
  if (state.roundsPlayed < state.totalRounds) {
    log(`Review the updated standings/handicaps/skins, then:`);
    log('  node seed_league_season.mjs round   → next round\n');
  } else {
    log('Season complete — all rounds played. Final standings are live.\n');
  }
}

// ── REVIEW HELPERS ─────────────────────────────────────────────────────────────

async function printRoundReview(state, token, roundId) {
  const L = state.league.id, S = state.season.id;
  try {
    const standings = await api('GET', `/api/v1/leagues/${L}/seasons/${S}/standings`, { token });
    log('\n  Standings (top 5):');
    for (const r of standings.slice(0, 5)) {
      const metric = state.league.format === 'Stroke'
        ? `net ${r.netStrokes}`
        : `${r.totalPoints} pts`;
      log(`    #${r.rank}  ${r.memberName.padEnd(22)} ${String(metric).padEnd(10)} HCP ${r.handicapIndex.toFixed(1)}  (${r.flightName})`);
    }
  } catch { /* best-effort */ }

  if (state.skinsPot > 0 && roundId) {
    try {
      const skins = await api('GET', `/api/v1/leagues/${L}/seasons/${S}/rounds/${roundId}/skins`, { token });
      const won = skins.filter(s => s.winnerMemberId);
      const carried = skins.filter(s => !s.winnerMemberId);
      log(`\n  Skins this round: ${won.length} won, ${carried.length} carried (tie).`);
      for (const s of won.slice(0, 5)) {
        log(`    Hole ${String(s.holeNumber).padStart(2)} → ${s.winnerName} ($${(s.potCents / 100).toFixed(2)}${s.carriedOverFromHole ? ', carried' : ''})`);
      }
    } catch { /* best-effort */ }
  }
}

// ── STATUS ─────────────────────────────────────────────────────────────────────

async function status() {
  await assertApiUp();
  const state = loadState();
  const token = await login(state);
  const L = state.league.id, S = state.season.id;

  log(`\nLeague "${state.league.name}" — season "${state.season.name}"`);
  log(`  Rounds played: ${state.roundsPlayed}/${state.totalRounds}  ·  Format: ${state.league.format}`);

  try {
    const members = await api('GET', `/api/v1/leagues/${L}/seasons/${S}/members`, { token });
    const sand = members.filter(m => m.isSandbagger).length;
    log(`  Members: ${members.length} active${sand ? ` · ${sand} flagged as possible sandbaggers` : ''}`);
  } catch { /* best-effort */ }

  await printRoundReview(state, token, state.lastRoundId);
  reviewBlock(state);
  if (state.roundsPlayed < state.totalRounds) log('Next:  node seed_league_season.mjs round\n');
}

// ── RESET ──────────────────────────────────────────────────────────────────────

async function reset() {
  if (!existsSync(STATE_FILE)) { log('No league season to reset.'); return; }
  rmSync(STATE_FILE);
  log('✔ Local league state cleared.');
  log('NOTE: there is no API to delete a league, so the throwaway org + league rows ' +
      'remain in the DB (harmless — a fresh "setup" makes a new throwaway org).');
}

// ── ENTRY ──────────────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const actions = { setup, round: playRound, status, reset };
if (!actions[cmd]) {
  log('Usage: node seed_league_season.mjs <setup|round|status|reset>');
  process.exit(cmd ? 1 : 0);
}
actions[cmd]().catch((e) => fail(e.message));
