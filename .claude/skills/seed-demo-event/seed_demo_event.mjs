#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// seed_demo_event.mjs — Demo tournament generator + lifecycle driver
// ─────────────────────────────────────────────────────────────────────────────
//
// Creates a fully-populated demo event through the REAL API (not direct SQL),
// then walks it through the event status machine one phase at a time so a human
// can review each phase in the web / admin apps.
//
//   Draft → Registration → Active → Scoring → Completed
//
// Each phase adds the data that belongs to that phase:
//   setup (Draft) ....... org+admin, event, course, custom colors, sponsors,
//                         hole challenges, entry fee / free-agent config
//   → Registration ...... 10–15 teams (2–4 players each) + public donations
//   → Active ............ team check-ins + first 6 holes scored (live board)
//   → Scoring ........... remaining holes scored + hole-challenge results
//   → Completed ......... final donations; round closed
//
// All rows are created under a throwaway org (unique slug/email per run), so a
// run never collides with real data and can simply be ignored or cancelled.
//
// USAGE:
//   node seed_demo_event.mjs setup            # create everything, leave in Draft
//   node seed_demo_event.mjs advance          # move to the next phase
//   node seed_demo_event.mjs status           # print current phase + review URLs
//   node seed_demo_event.mjs reset            # cancel event + forget local state
//
// ENV OVERRIDES:
//   API_BASE   (default http://localhost:5000)
//   WEB_BASE   (default http://localhost:3000)
//   TEAM_COUNT (default 12, clamped to 10–15)
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE      = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(HERE, '.state.json');

const API_BASE = (process.env.API_BASE || 'http://localhost:5000').replace(/\/$/, '');
const WEB_BASE = (process.env.WEB_BASE || 'http://localhost:3000').replace(/\/$/, '');
const TEAM_COUNT = Math.min(15, Math.max(10, parseInt(process.env.TEAM_COUNT || '12', 10)));

// Phases in lifecycle order. setup lands on Draft; advance steps through the rest.
const PHASE_ORDER = ['Draft', 'Registration', 'Active', 'Scoring', 'Completed'];

// ── DEMO CONTENT ─────────────────────────────────────────────────────────────

// Custom "Terracotta" palette — deliberately NOT the default eco-green, so the
// branding override is obvious on the public page. primary-on-surface passes WCAG.
const THEME = {
  primary:   '#2d2a4a', // deep indigo — header / nav
  action:    '#e07a5f', // terracotta — CTAs, links
  accent:    '#81b29a', // sage — secondary
  highlight: '#f2cc8f', // sand — callouts
  surface:   '#f4f1de', // cream — page background
};

// Realistic par-72 layout for 18 holes.
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 5, 4, 3, 4, 4, 3, 5, 4];

// logoUrl is required by the API and must be an absolute URL. We use distinct
// placeholder images so each sponsor renders visibly different on the page.
const SPONSORS = [
  { name: 'Summit Financial Group',  tier: 'Title',  color: '2d2a4a', tagline: 'Investing in our community.',       donationAmountCents: 500000, placements: { landingPage: true, leaderboard: true, emailHeader: true } },
  { name: 'Evergreen Landscaping',   tier: 'Gold',   color: '2a9d8f', tagline: 'Greener fairways, greener futures.', donationAmountCents: 250000, placements: { landingPage: true, leaderboard: true } },
  { name: 'Harbor Point Brewing Co.',tier: 'Silver', color: 'e76f51', tagline: 'Crafted on the coast.',             donationAmountCents: 100000, placements: { landingPage: true } },
  { name: 'Crestview Dental',        tier: 'Bronze', color: '457b9d', tagline: 'Smiles all around.',                donationAmountCents:  50000, placements: { landingPage: true } },
  { name: 'Apex Auto Group',         tier: 'Hole',   color: 'e63946', tagline: 'Drive away happy.',                 donationAmountCents:  75000, placements: { landingPage: true, holeNumbers: [3] } },
  { name: 'Lakeside Realty',         tier: 'Hole',   color: '264653', tagline: 'Home is where the green is.',       donationAmountCents:  75000, placements: { landingPage: true, holeNumbers: [9] } },
];

// Build a placeholder logo URL from a sponsor's initials and brand color.
function sponsorLogo(s) {
  const initials = s.name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();
  return `https://placehold.co/160x80/${s.color}/ffffff.png?text=${initials}`;
}

// Challenges reference sponsors by name (resolved to ids after sponsors created).
const CHALLENGES = [
  { holeNumber: 3,    challengeType: 'ClosestToPin', description: 'Closest to the Pin',  prizeDescription: '$100 gift card',  sponsorName: 'Apex Auto Group',       donationAmountCents: 10000 },
  { holeNumber: 5,    challengeType: 'LongestDrive', description: 'Longest Drive',       prizeDescription: 'New driver',      sponsorName: 'Evergreen Landscaping', donationAmountCents: 0 },
  { holeNumber: 9,    challengeType: 'Putting',      description: 'Putting Contest',     prizeDescription: 'Putter',          sponsorName: 'Lakeside Realty',       donationAmountCents: 0 },
  { holeNumber: null, challengeType: 'HoleInOne',    description: 'Hole-in-One — any par 3', prizeDescription: 'New car!',    sponsorName: 'Summit Financial Group',donationAmountCents: 0 },
];

// Auction items. Left OPEN throughout the demo — closing/awarding/buy-now would
// trigger a Stripe charge (ChargeWinnerAsync), which 500s with no STRIPE key.
// Competitive items get an escalating bid war; the donation item gets pledges.
const AUCTION_ITEMS = [
  { title: 'Weekend Golf Getaway for Four',        auctionType: 'Silent',         startingBidCents: 10000, bidIncrementCents: 2500, fairMarketValueCents:  80000, description: 'Two nights at a championship resort with golf for four.' },
  { title: 'Signed Major Championship Flag',       auctionType: 'Silent',         startingBidCents:  5000, bidIncrementCents: 1000, fairMarketValueCents:  40000, description: 'Pin flag autographed by a tour professional.' },
  { title: 'Private Chef Dinner for Eight',        auctionType: 'Silent',         startingBidCents: 20000, bidIncrementCents: 5000, fairMarketValueCents: 150000, description: 'An in-home five-course dinner prepared by a local chef.' },
  { title: 'Premium Whiskey Tasting Experience',   auctionType: 'Silent',         startingBidCents:  7500, bidIncrementCents: 2500, fairMarketValueCents:  30000, description: 'Guided tasting of rare whiskeys for six guests.' },
  { title: 'Fund-a-Need: Junior Golf Scholarships',auctionType: 'DonationSilent', startingBidCents:  2500, minimumBidCents: 2500, donationDenominations: [2500, 5000, 10000, 25000], goalCents: 500000, fairMarketValueCents: 0, description: 'Every dollar funds equipment and lessons for a junior golfer.' },
];

const TEAM_NAMES = [
  'The Bogey Brothers', 'Fairway Frenzy', 'Mulligan Militia', 'Birdie Hunters',
  'Sand Trap Snipers', 'Eagle Eyes', 'Putt Pirates', 'Grip It & Sip It',
  'The Shankapotamus', 'Tee-rific Trio', 'Par-tee Animals', 'Rough Riders',
  'Slice of Life', 'Green Machine', 'Albatross Alliance',
];

const FIRST = ['James','Maria','Robert','Lisa','Michael','Sarah','David','Emily','Daniel','Jessica','Matthew','Ashley','Chris','Amanda','Josh','Megan','Andrew','Steph','Kevin','Rachel','Brian','Nicole','Ryan','Heather','Justin','Amber','Brandon','Sam','Tyler','Brittany'];
const LAST  = ['Anderson','Johnson','Smith','Williams','Brown','Jones','Garcia','Davis','Miller','Wilson','Moore','Taylor','Thomas','Jackson','White','Harris','Martin','Thompson','Martinez','Robinson'];

const DONORS = [
  ['Patricia Reed', 2500], ['George Hall', 5000], ['Linda Foster', 10000],
  ['Walter Price', 25000], ['Donna Bryant', 7500], ['Frank Coleman', 50000],
];

// ── HTTP HELPERS ─────────────────────────────────────────────────────────────

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
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
    // Any cheap unauthenticated route; 404 still proves the server is reachable.
    await fetch(`${API_BASE}/api/v1/pub/events/__ping__`);
  } catch {
    fail(`Cannot reach the API at ${API_BASE}.\n` +
         `Start it first:  cd apps/api && dotnet run`);
  }
}

// ── STATE ────────────────────────────────────────────────────────────────────

function loadState() {
  if (!existsSync(STATE_FILE)) {
    fail('No demo event found. Run "setup" first.');
  }
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

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

function reviewBlock(state, phase) {
  const { slug, code } = { slug: state.org.slug, code: state.event.code };
  log('\n──────────────────────────────────────────────────────────');
  log(`  PHASE: ${phase}`);
  log('──────────────────────────────────────────────────────────');
  log(`  Event code : ${code}`);
  log(`  Org slug   : ${slug}`);
  log(`  Public page    : ${WEB_BASE}/e/${slug}/${code}`);
  log(`  Live leaderboard: ${WEB_BASE}/e/${slug}/${code}/scores`);
  log(`  Admin login    : ${state.org.email}  /  ${state.org.password}`);
  log('──────────────────────────────────────────────────────────\n');
}

// ── SETUP (Draft) ────────────────────────────────────────────────────────────

async function setup() {
  await assertApiUp();
  if (existsSync(STATE_FILE)) {
    fail('A demo event already exists. Run "reset" before creating a new one.');
  }

  const runId = Date.now().toString(36);
  const org = {
    email:    `demo.${runId}@example.com`,
    password: 'DemoPass123!',
    slug:     `demo-${runId}`,
    name:     'Birdies for Charity Foundation',
  };

  log(`\n▶ Registering demo organizer + org (${org.slug})…`);
  const auth = await api('POST', '/api/v1/auth/register', {
    body: {
      email: org.email, password: org.password,
      displayName: 'Demo Organizer', orgName: org.name,
      orgSlug: org.slug, is501c3: true,
    },
  });
  const token = auth.accessToken;
  org.id = auth.org.id;

  log('▶ Creating event (Scramble · Shotgun · 18 holes)…');
  const startAt = new Date(Date.now() + 14 * 864e5).toISOString();
  const evt = await api('POST', '/api/v1/events', {
    token,
    body: { name: 'Spring Charity Scramble', format: 'Scramble', startType: 'Shotgun', holes: 18, startAt },
  });

  log('▶ Configuring free agents + capacity…');
  // NOTE: entryFeeCents is intentionally NOT set here. With a fee configured,
  // team registration creates a Stripe PaymentIntent, which 500s when
  // STRIPE_SECRET_KEY is unset (local dev). We set the fee AFTER teams register
  // (no new PaymentIntents) and mark teams paid directly — see doRegistration.
  await api('PATCH', `/api/v1/events/${evt.id}`, {
    token,
    body: { config: { freeAgentEnabled: true, maxTeams: 20 } },
  });

  log('▶ Attaching course (par 72)…');
  await api('POST', `/api/v1/events/${evt.id}/course`, {
    token,
    body: {
      name: 'Pinehurst Pines Golf Club', address: '100 Fairway Dr',
      city: 'Asheville', state: 'NC', zip: '28801',
      holes: PARS.map((par, i) => ({ holeNumber: i + 1, par, handicapIndex: i + 1 })),
    },
  });

  log('▶ Applying custom branding colors…');
  await api('PATCH', `/api/v1/events/${evt.id}/branding`, {
    token,
    body: {
      themeJson: JSON.stringify(THEME),
      missionStatement: 'Every swing supports youth golf scholarships in our community. Thank you for playing!',
      is501c3: true,
    },
  });

  log('▶ Adding sponsors…');
  const sponsors = [];
  for (const s of SPONSORS) {
    const created = await api('POST', `/api/v1/events/${evt.id}/sponsors`, {
      token,
      body: {
        name: s.name, tier: s.tier, tagline: s.tagline,
        logoUrl: sponsorLogo(s),
        donationAmountCents: s.donationAmountCents, placements: s.placements,
        websiteUrl: `https://example.com/${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      },
    });
    sponsors.push({ id: created.id, name: created.name });
  }

  log('▶ Adding hole challenges…');
  const challenges = [];
  for (const c of CHALLENGES) {
    const sponsorId = sponsors.find(s => s.name === c.sponsorName)?.id ?? null;
    const created = await api('POST', `/api/v1/events/${evt.id}/challenges`, {
      token,
      body: {
        holeNumber: c.holeNumber, challengeType: c.challengeType,
        description: c.description, prizeDescription: c.prizeDescription,
        sponsorId, donationAmountCents: c.donationAmountCents,
      },
    });
    challenges.push({ id: created.id, type: c.challengeType });
  }

  log('▶ Adding auction items…');
  const closesAt = new Date(Date.now() + 2 * 864e5).toISOString(); // +2 days: stays Open during the demo
  const auction = [];
  for (let i = 0; i < AUCTION_ITEMS.length; i++) {
    const a = AUCTION_ITEMS[i];
    const created = await api('POST', `/api/v1/events/${evt.id}/auction/items`, {
      token,
      body: { ...a, closesAt, displayOrder: i },
    });
    auction.push({
      id: created.id, title: created.title, auctionType: created.auctionType,
      startingBidCents: created.startingBidCents, bidIncrementCents: created.bidIncrementCents,
      minimumBidCents: created.minimumBidCents,
    });
  }

  const state = {
    runId, org,
    event: { id: evt.id, code: evt.eventCode },
    sponsors, challenges, auction,
    teams: [],
    apiBase: API_BASE, webBase: WEB_BASE,
    createdAt: new Date().toISOString(),
  };
  saveState(state);

  log('\n✔ Setup complete — event is in Draft.');
  log(`  ${sponsors.length} sponsors, ${challenges.length} challenges, ${auction.length} auction items, custom colors, par-72 course.`);
  reviewBlock(state, 'Draft');
  log('NOTE: a Draft event is NOT public yet — review it in the admin dashboard');
  log('      (test-mode join by code). It becomes public at the Registration phase.');
  log('\nNext:  node seed_demo_event.mjs advance   → opens Registration\n');
}

// ── PHASE SIDE-EFFECTS ───────────────────────────────────────────────────────

function rand(n) { return Math.floor(Math.random() * n); }

async function doRegistration(state, token) {
  log(`▶ Registering ${TEAM_COUNT} teams (2–4 players each)…`);
  let pIdx = 0;
  for (let t = 0; t < TEAM_COUNT; t++) {
    const size = 2 + rand(3); // 2–4
    const players = Array.from({ length: size }, () => {
      const first = FIRST[pIdx % FIRST.length];
      const last  = LAST[(pIdx * 7) % LAST.length];
      pIdx++;
      return {
        firstName: first, lastName: last,
        email: `player.${pIdx}.${state.runId}@example.com`,
        handicapIndex: Number((Math.random() * 28).toFixed(1)),
      };
    });
    const res = await api('POST', `/api/v1/events/${state.event.id}/register/team`, {
      body: { teamName: TEAM_NAMES[t], players },
    });
    state.teams.push({ id: res.team.id, name: res.team.name });
  }

  // Now that all teams exist, turn on the entry fee and mark most teams paid.
  // Done post-registration so no Stripe PaymentIntent is ever created.
  log('▶ Enabling entry fee + marking teams paid…');
  await api('PATCH', `/api/v1/events/${state.event.id}`, {
    token, body: { config: { entryFeeCents: 15000 } },
  });
  const paid = Math.ceil(state.teams.length * 0.75);
  for (let i = 0; i < paid; i++) {
    await api('POST', `/api/v1/events/${state.event.id}/teams/${state.teams[i].id}/fee-paid`, { token });
  }

  log('▶ Recording public donations…');
  for (const [name, cents] of DONORS) {
    await api('POST', `/api/v1/pub/events/${state.event.code}/donate`, {
      body: { donorName: name, donorEmail: `${name.split(' ')[0].toLowerCase()}.${state.runId}@example.com`, amountCents: cents },
    });
  }
  saveState(state);
  log(`  ${state.teams.length} teams registered, ${paid} fee-paid, ${DONORS.length} donations recorded.`);
}

async function doActive(state, token) {
  // Check-in requires the event to already be Active (done before this runs).
  const checkIn = Math.ceil(state.teams.length * 0.8);
  log(`▶ Checking in ${checkIn}/${state.teams.length} teams…`);
  for (let i = 0; i < checkIn; i++) {
    await api('POST', `/api/v1/events/${state.event.id}/teams/${state.teams[i].id}/check-in`, { token });
  }
  const mobileTeam   = state.teams[0];
  const conflictTeam = state.teams[1];

  log('▶ Admin-scoring front holes 1–6 (every team except the mobile-scored one)…');
  await scoreHoles(state, token, 1, 6, [mobileTeam.id]);

  log(`▶ Mobile sync: "${mobileTeam.name}" posts holes 1–6 from the app (Source=MobileSync)…`);
  const mobileScores = [];
  for (let h = 1; h <= 6; h++) mobileScores.push({ holeNumber: h, grossScore: scrambleGross(h) });
  const r1 = await mobileSync(state, mobileTeam.id, `phone-${mobileTeam.id.slice(0, 8)}`, mobileScores);

  // Deliberate conflict: the admin already entered hole 3 for conflictTeam; the
  // mobile app now syncs a DIFFERENT value from a different device → the server
  // flags that score IsConflicted (and drops it from the live leaderboard until
  // an admin resolves it).
  log(`▶ Mobile sync: deliberate conflict for "${conflictTeam.name}" on hole 3…`);
  const card = await api('GET', `/api/v1/events/${state.event.id}/teams/${conflictTeam.id}/scorecard`, { token });
  const adminGross    = card.holes.find(h => h.holeNumber === 3)?.grossScore ?? PARS[2];
  const mobileGross   = adminGross + 3 <= 12 ? adminGross + 3 : adminGross - 3;
  await mobileSync(state, conflictTeam.id, 'phone-conflict-9f2a', [{ holeNumber: 3, grossScore: mobileGross }]);
  state.conflict = { team: conflictTeam.name, hole: 3, adminGross, mobileGross };
  saveState(state);

  await doAuctionBids(state, token);
  log(`  Front 6 scored (${r1.accepted} via mobile sync), 1 deliberate conflict ` +
      `(${conflictTeam.name} h3: admin ${adminGross} vs mobile ${mobileGross}), auction bids posted.`);
}

// Bidding requires CheckedIn players (no Stripe payment method locally) and Open
// items. We check in a pool of players, then run an escalating bid war on the
// silent items and a round of pledges on the donation item. Items stay Open.
async function doAuctionBids(state, token) {
  if (!state.auction || state.auction.length === 0) return;

  log('▶ Checking in players + placing auction bids…');
  const teams = await api('GET', `/api/v1/events/${state.event.id}/teams`, { token });
  const candidatePlayers = teams
    .filter(t => t.checkInStatus === 'CheckedIn' || t.checkInStatus === 'Complete')
    .flatMap(t => t.players.map(p => p.id));

  const bidders = [];
  for (const pid of candidatePlayers) {
    if (bidders.length >= 12) break;
    try {
      await api('POST', `/api/v1/events/${state.event.id}/players/${pid}/check-in`, { token });
      bidders.push(pid);
    } catch { /* skip any player that can't be checked in */ }
  }
  if (bidders.length < 2) { log('  (not enough eligible players to bid — skipped)'); return; }

  let b = 0; // rotating bidder index → distinct consecutive bidders, drives outbid history
  let bidCount = 0;
  for (const item of state.auction) {
    if (item.auctionType.startsWith('Donation')) {
      const denoms = [2500, 5000, 10000, 25000, 5000];
      for (const amountCents of denoms) {
        await api('POST', `/api/v1/auction/items/${item.id}/pledge`, {
          body: { playerId: bidders[b++ % bidders.length], amountCents },
        });
        bidCount++;
      }
    } else {
      for (let k = 0; k < 4; k++) {
        await api('POST', `/api/v1/auction/items/${item.id}/bid`, {
          body: { playerId: bidders[b++ % bidders.length], amountCents: item.startingBidCents + k * item.bidIncrementCents },
        });
        bidCount++;
      }
    }
  }
  log(`  ${bidders.length} players checked in, ${bidCount} bids/pledges across ${state.auction.length} items.`);
}

async function doScoring(state, token) {
  log('▶ Scoring remaining holes 7–18…');
  await scoreHoles(state, token, 7, 18);

  log('▶ Recording hole-challenge results…');
  for (const ch of state.challenges) {
    const sample = state.teams.slice(0, 4);
    for (const team of sample) {
      const value =
        ch.type === 'ClosestToPin' ? Number((3 + Math.random() * 35).toFixed(1)) :
        ch.type === 'LongestDrive' ? Number((180 + Math.random() * 110).toFixed(1)) :
        ch.type === 'Putting'      ? 1 + rand(3) :
        null; // HoleInOne — recorded without a measured value
      await api('POST', `/api/v1/events/${state.event.id}/challenges/${ch.id}/results`, {
        token,
        body: { teamId: team.id, resultValue: value, resultNotes: 'Demo result' },
      });
    }
  }
  log('  All holes scored; challenge results in.');
}

async function doCompleted(state) {
  log('▶ Recording final round-day donations…');
  await api('POST', `/api/v1/pub/events/${state.event.code}/donate`, {
    body: { donorName: 'Anonymous Patron', donorEmail: `patron.${state.runId}@example.com`, amountCents: 100000 },
  });
  log('  Round closed — final leaderboard published.');
}

// Scramble score for one hole: mostly par / birdie, occasional bogey.
function scrambleGross(hole) {
  const par = PARS[hole - 1];
  const r = rand(10);
  const delta = r < 2 ? -1 : r < 8 ? 0 : 1;
  return Math.max(1, par + delta);
}

// Admin score entry (Source=AdminEntry). skipTeamIds lets a team be scored via
// the mobile path instead, so we can demonstrate both sources side by side.
async function scoreHoles(state, token, from, to, skipTeamIds = []) {
  const skip = new Set(skipTeamIds);
  for (const team of state.teams) {
    if (skip.has(team.id)) continue;
    for (let hole = from; hole <= to; hole++) {
      await api('POST', `/api/v1/events/${state.event.id}/scores`, {
        token,
        body: { teamId: team.id, holeNumber: hole, grossScore: scrambleGross(hole) },
      });
    }
  }
}

// Posts scores through the REAL mobile sync endpoint — same path the Expo app's
// backgroundSync uses. Writes Score rows with Source=MobileSync. No auth (the
// app has no user account; eventId + teamId + deviceId identify the batch).
async function mobileSync(state, teamId, deviceId, scores) {
  return api('POST', '/api/v1/sync/scores', {
    body: { eventId: state.event.id, teamId, deviceId, scores },
  });
}

const PHASE_ACTIONS = {
  Registration: doRegistration,
  Active:       doActive,
  Scoring:      doScoring,
  Completed:    doCompleted,
};

const PHASE_REVIEW = {
  Registration: 'Public landing page is now LIVE — open it to see custom colors, sponsors, mission, donation thermometer, and team registration.',
  Active:       'Event is day-of: teams checked in and the front-6 leaderboard is live. One team was scored through the MOBILE sync path (Source=MobileSync) and there is ONE deliberate mobile-vs-admin conflict to resolve on the admin scorecard. Auction has live bids too.',
  Scoring:      'All 18 holes scored — full leaderboard ranks every team; hole-challenge results recorded.',
  Completed:    'Final standings published; thank-you flow triggered. Review the completed leaderboard.',
};

// ── ADVANCE ──────────────────────────────────────────────────────────────────

async function advance() {
  await assertApiUp();
  const state = loadState();
  const token = await login(state);

  const evt = await api('GET', `/api/v1/events/${state.event.id}`, { token });
  const current = evt.status;
  const idx = PHASE_ORDER.indexOf(current);
  if (idx < 0) fail(`Event is in an unexpected status: ${current}.`);
  if (current === 'Completed') fail('Event is already Completed — nothing left to advance.');
  const next = PHASE_ORDER[idx + 1];

  log(`\n▶ Advancing ${current} → ${next}…`);
  await api('PATCH', `/api/v1/events/${state.event.id}`, { token, body: { status: next } });

  // Re-login defends against the 15-min token expiring during a long scoring loop.
  await PHASE_ACTIONS[next](state, await login(state));

  log(`\n✔ Now in ${next}.`);
  log(`  ${PHASE_REVIEW[next]}`);
  reviewBlock(state, next);
  if (next !== 'Completed') log('Next:  node seed_demo_event.mjs advance\n');
}

// ── STATUS ───────────────────────────────────────────────────────────────────

async function status() {
  await assertApiUp();
  const state = loadState();
  const token = await login(state);
  const evt = await api('GET', `/api/v1/events/${state.event.id}`, { token });
  log(`\nEvent "${evt.name}" — status: ${evt.status}`);
  log(`  Teams: ${evt.counts.teamsRegistered} · Players: ${evt.counts.playersRegistered} · ` +
      `Checked-in: ${evt.counts.teamsCheckedIn} · Holes scored: ${evt.counts.holesScored}`);
  try {
    const allScores = await api('GET', `/api/v1/events/${state.event.id}/scores`, { token });
    if (allScores.length) {
      const bySource = allScores.reduce((m, s) => { m[s.source] = (m[s.source] || 0) + 1; return m; }, {});
      const conflicts = allScores.filter(s => s.isConflicted).length;
      log(`  Scores by source: ${Object.entries(bySource).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
      log(`  Unresolved conflicts: ${conflicts}`);
      if (conflicts > 0) log('  → resolve from CLI: node seed_demo_event.mjs resolve-conflict [admin|mobile|<score>]');
    }
  } catch { /* score read is best-effort */ }
  try {
    const items = await api('GET', `/api/v1/events/${state.event.id}/auction/items`, { token });
    const live = items.filter(i => i.status === 'Open' || i.status === 'Extended');
    const topBid = Math.max(0, ...items.map(i => i.currentHighBidCents));
    log(`  Auction: ${items.length} items (${live.length} open) · top bid $${(topBid / 100).toFixed(2)}`);
  } catch { /* auction read is best-effort */ }
  reviewBlock(state, evt.status);
  if (evt.status !== 'Completed') log('Next:  node seed_demo_event.mjs advance\n');
}

// ── RESET ────────────────────────────────────────────────────────────────────

async function reset() {
  if (!existsSync(STATE_FILE)) { log('No demo event to reset.'); return; }
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  try {
    const token = await login(state);
    const evt = await api('GET', `/api/v1/events/${state.event.id}`, { token });
    if (!['Completed', 'Cancelled'].includes(evt.status)) {
      await api('PATCH', `/api/v1/events/${state.event.id}`, { token, body: { status: 'Cancelled' } });
      log(`✔ Event ${state.event.code} cancelled.`);
    }
  } catch (e) {
    log(`(could not cancel event via API: ${e.message})`);
  }
  rmSync(STATE_FILE);
  log('✔ Local demo state cleared.');
  log('NOTE: the throwaway org and its data remain in the DB (harmless). ' +
      'Cancelled/Draft events never appear in the public list.');
}

// ── RESOLVE CONFLICT ─────────────────────────────────────────────────────────

async function leaderboardByTeam(state, token) {
  const lb = await api('GET', `/api/v1/events/${state.event.id}/leaderboard`, { token });
  return Object.fromEntries(lb.map(e => [e.teamName, e]));
}

// Resolves every conflicted score (clears the flag and writes the accepted value),
// so you can watch the team rejoin the leaderboard. Accepts an optional argument:
//   admin   (default) → keep the admin value     mobile → take the mobile value
//   <number>          → accept that exact gross score
async function resolveConflict() {
  await assertApiUp();
  const state = loadState();
  const token = await login(state);
  const arg   = (process.argv[3] || 'admin').toLowerCase();

  const scores     = await api('GET', `/api/v1/events/${state.event.id}/scores`, { token });
  const conflicted = scores.filter(s => s.isConflicted);
  if (conflicted.length === 0) { log('\n✔ No conflicted scores to resolve.\n'); return; }

  const before = await leaderboardByTeam(state, token);

  for (const sc of conflicted) {
    const isSeeded = state.conflict && sc.teamName === state.conflict.team && sc.holeNumber === state.conflict.hole;
    let accepted;
    if (!Number.isNaN(Number(arg)))          accepted = Number(arg);
    else if (arg === 'mobile' && isSeeded)   accepted = state.conflict.mobileGross;
    else if (arg === 'admin'  && isSeeded)   accepted = state.conflict.adminGross;
    else                                     accepted = sc.grossScore; // keep the stored value

    await api('POST', `/api/v1/events/${state.event.id}/scores/${sc.id}/resolve`, {
      token, body: { acceptedScore: accepted, resolutionNote: `Resolved by demo seeder (${arg})` },
    });
    log(`✔ Resolved ${sc.teamName} hole ${sc.holeNumber} → accepted gross ${accepted}`);
  }

  const after = await leaderboardByTeam(state, token);
  for (const sc of conflicted) {
    log(`  ${sc.teamName}: holes complete ${before[sc.teamName]?.holesComplete} → ${after[sc.teamName]?.holesComplete}`);
  }

  if (state.conflict) { delete state.conflict; saveState(state); }
  log('\nThe resolved team has rejoined the live standings.');
  reviewBlock(state, '(conflicts resolved)');
}

// ── ENTRY ────────────────────────────────────────────────────────────────────

const cmd = process.argv[2];
const actions = { setup, advance, status, reset, 'resolve-conflict': resolveConflict };
if (!actions[cmd]) {
  log('Usage: node seed_demo_event.mjs <setup|advance|status|resolve-conflict|reset>');
  process.exit(cmd ? 1 : 0);
}
actions[cmd]().catch((e) => fail(e.message));
