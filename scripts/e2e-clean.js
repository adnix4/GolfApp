#!/usr/bin/env node
/**
 * End-to-end test against a CLEAN build.
 *
 * WHY THIS EXISTS
 * Every bug this session escaped the unit tests and CI, and was only visible by
 * driving the real thing:
 *   • a hook below an early return crashed the scorer (#56) — green in 551 tests
 *   • an SVG sponsor logo drew an empty frame on Android (#63) — fine on web
 *   • re-hosting those logos made every RELATIVE url 404 across admin and web,
 *     because almost nothing called resolveMediaUrl
 *   • the backfill never bumped SponsorsVersion, so devices kept the dead url
 * A clean build matters too: two of those only appeared after `rm -rf
 * node_modules`, and the MSB3021 build lock only appears when a stale API is
 * still running. This script starts from nothing and cleans up after itself.
 *
 * USAGE
 *   node scripts/e2e-clean.js              # full: clean, build, gates, drive
 *   node scripts/e2e-clean.js --fast       # skip the clean+reinstall
 *   node scripts/e2e-clean.js --keep       # leave services running at the end
 *
 * Exits non-zero on the first failed phase, with the failing output.
 */

const { execSync, spawn } = require('node:child_process');
const fs   = require('node:fs');
const path = require('node:path');
const os   = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const API  = 'http://localhost:5000/api/v1';
const WEB  = 'http://localhost:3000';
const LOG_DIR = path.join(os.tmpdir(), 'gfp-e2e');

const ARGS = process.argv.slice(2);
const FAST = ARGS.includes('--fast');
const KEEP = ARGS.includes('--keep');

const started = [];           // child processes we own and must stop
const results = [];
let phaseStart = Date.now();

// ── output ────────────────────────────────────────────────────────────────────
const c = { dim: s => `\x1b[2m${s}\x1b[0m`, ok: s => `\x1b[32m${s}\x1b[0m`,
            bad: s => `\x1b[31m${s}\x1b[0m`, hd: s => `\x1b[1m${s}\x1b[0m` };

function phase(name) {
  phaseStart = Date.now();
  process.stdout.write(`\n${c.hd('▶ ' + name)}\n`);
}
function pass(name, detail = '') {
  const ms = Date.now() - phaseStart;
  results.push({ name, ok: true, ms });
  console.log(`  ${c.ok('✓')} ${name} ${c.dim(`${(ms / 1000).toFixed(1)}s`)} ${detail}`);
}
function fail(name, err) {
  results.push({ name, ok: false, ms: Date.now() - phaseStart, err: String(err) });
  console.log(`  ${c.bad('✗')} ${name}\n${String(err).split('\n').slice(0, 25).map(l => '    ' + l).join('\n')}`);
  throw new Error(name);
}

// An exception that never went through fail() must still sink the run: api()
// and fetch() throw raw Errors, and a bare catch turned that into a green exit.
function record(name, err) {
  results.push({ name, ok: false, ms: Date.now() - phaseStart, err: String(err) });
  const detail = String(err).split('\n').slice(0, 25).map(l => '    ' + l).join('\n');
  console.log(`  ${c.bad('✗')} ${name}\n${detail}`);
}

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(label, check, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch { /* not up yet */ }
    await sleep(2000);
  }
  throw new Error(`timed out waiting for ${label} after ${timeoutMs / 1000}s`);
}

async function http(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function api(method, p, { body, token, expect = [200, 201, 204] } = {}) {
  const r = await http(API + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!expect.includes(r.status)) {
    throw new Error(`${method} ${p} -> ${r.status}\n${r.text.slice(0, 400)}`);
  }
  return r.json;
}

// ── service lifecycle ─────────────────────────────────────────────────────────
function startService(name, cmd, args, cwd, env = {}) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logPath = path.join(LOG_DIR, `${name}.log`);
  const out = fs.openSync(logPath, 'w');
  // One command string, not (cmd, args): Node 24 flags args + shell:true as
  // DEP0190. The args here are fixed literals, so nothing needs escaping.
  const child = spawn([cmd, ...args].join(' '), {
    cwd, env: { ...process.env, ...env }, stdio: ['ignore', out, out], shell: true, detached: false,
  });
  started.push({ name, child, logPath });
  return logPath;
}

function stopAll() {
  for (const { name, child } of started) {
    try {
      // Windows needs the tree killed; a bare kill leaves the real server
      // running and holding both its port and the .NET build lock, which is
      // exactly the MSB3021 failure this script exists to avoid.
      if (process.platform === 'win32') run(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' });
      else process.kill(-child.pid, 'SIGKILL');
      console.log(`  ${c.dim('stopped ' + name)}`);
    } catch { /* already gone */ }
  }
  started.length = 0;
}

// ── phases ────────────────────────────────────────────────────────────────────

async function phaseClean() {
  phase('Clean slate');
  try {
    // Fresh database: -v drops the volume, so migrations run from zero and no
    // leftover test event can make a broken query look like it works.
    run('docker compose -f infra/docker-compose.yml down -v', { stdio: 'ignore' });
    run('docker compose -f infra/docker-compose.yml up -d');
    pass('docker infra recreated');
  } catch (e) { fail('docker infra', e.stdout || e.message); }

  if (FAST) { console.log(`  ${c.dim('skipping reinstall (--fast)')}`); return; }

  try {
    fs.rmSync(path.join(ROOT, 'node_modules'), { recursive: true, force: true });
    run('npm ci --legacy-peer-deps');
    pass('npm ci from a removed node_modules');
  } catch (e) { fail('npm ci', e.stdout || e.message); }

  try {
    run('dotnet clean apps/api/WebAPI.csproj', { stdio: 'ignore' });
    pass('dotnet clean');
  } catch (e) { fail('dotnet clean', e.stdout || e.message); }
}

async function phaseGates() {
  phase('Static gates');
  // --force defeats the turbo cache: on a clean run these must actually
  // execute, or a 0.6s "pass" is just a replayed log from an earlier build.
  const f = FAST ? '' : ' -- --force';
  const gates = [
    ['lint',        'npm run lint' + f],
    ['type-check',  'npm run type-check' + f],
    ['js tests',    'npm test' + f],
    ['audit:prod',  'npm run audit:prod'],
    ['dotnet build','dotnet build apps/api/WebAPI.csproj'],
    ['api tests',   'dotnet test apps/api-tests/WebAPI.Tests.csproj'],
  ];
  for (const [name, cmd] of gates) {
    phaseStart = Date.now();
    try { const out = run(cmd); pass(name, summarise(name, out)); }
    catch (e) { fail(name, (e.stdout || '') + (e.stderr || '')); }
  }
}

function summarise(name, out) {
  // turbo and vitest colour their output, and the escapes sit between the label
  // and the number ("Tests \x1b[32m139 passed"), so strip them before matching.
  out = out.replace(/\x1b\[[0-9;]*m/g, '');
  if (/tests?/i.test(name)) {
    const dotnet = out.match(/Passed!\s+-\s+Failed:\s+\d+,\s+Passed:\s+(\d+)/);
    if (dotnet) return c.dim(`${dotnet[1]} passing`);
    const vitest = [...out.matchAll(/Tests\s+(\d+) passed/g)].reduce((a, m) => a + Number(m[1]), 0);
    if (vitest) return c.dim(`${vitest} passing`);
  }
  if (name === 'lint') {
    const warn = [...out.matchAll(/(\d+) problems? \((\d+) errors?, (\d+) warnings?\)/g)];
    const errs = warn.reduce((a, m) => a + Number(m[2]), 0);
    const wrns = warn.reduce((a, m) => a + Number(m[3]), 0);
    return c.dim(`${errs} errors, ${wrns} warnings`);
  }
  return '';
}

async function phaseBoot() {
  phase('Boot services');
  startService('api', 'dotnet', ['run', '--no-build', '--project', 'apps/api/WebAPI.csproj'], ROOT, {
    DATABASE_URL: 'postgres://gfp:gfp_local@localhost:5432/golf_fundraiser',
    ASPNETCORE_ENVIRONMENT: 'Development',
  });
  await waitFor('API', async () => (await http(`${API}/pub/events/ZZZZZZZZ`)).status === 404, 240_000);
  pass('API on :5000');

  startService('web', 'npm', ['run', 'dev'], path.join(ROOT, 'apps/web'));
  await waitFor('web', async () => (await http(WEB)).status === 200, 180_000);
  pass('web on :3000');
}

async function phaseTournament() {
  phase('Drive a tournament end to end');
  const stamp = Date.now();
  const ctx = {};

  const auth = await api('POST', '/auth/register', { body: {
    email: `e2e.${stamp}@example.com`, password: 'E2eVerify!2026#pw',
    displayName: 'E2E', orgName: `E2E Org ${stamp}`, orgSlug: `e2e-org-${stamp}`, is501c3: true,
  }});
  ctx.token = auth.accessToken;
  ctx.orgSlug = `e2e-org-${stamp}`;
  pass('organizer registered');

  const ev = await api('POST', '/events', { token: ctx.token, body: {
    name: `E2E ${stamp}`, format: 'Scramble', startType: 'Shotgun', holes: 18,
    startAt: new Date(Date.now() + 864e5).toISOString(), config: { maxTeams: 10 },
  }});
  ctx.eventId = ev.id; ctx.code = ev.eventCode;
  pass('event created', c.dim(ctx.code));

  await api('PATCH', `/events/${ctx.eventId}`, { token: ctx.token, body: { status: 'Registration' } });

  const PARS = [4,5,3,4,4,3,5,4,4, 4,3,5,4,4,3,4,5,4];
  await api('POST', `/events/${ctx.eventId}/course`, { token: ctx.token, body: {
    name: 'E2E National', address: '1 Fairway', city: 'Austin', state: 'TX', zip: '78701',
    holes: PARS.map((par, i) => ({ holeNumber: i + 1, par, handicapIndex: i + 1,
      yardageWhite: 300 + par * 40, yardageBlue: 330 + par * 40, yardageRed: 260 + par * 40 })),
  }});
  pass('course attached');

  const team = await api('POST', `/events/${ctx.eventId}/register/team`, { body: {
    teamName: 'E2E Team', maxPlayers: 4,
    players: ['Ava Stone', 'Ben Ortiz', 'Cleo Nakano', 'Dev Kaur'].map((n, i) => {
      const [firstName, lastName] = n.split(' ');
      return { firstName, lastName, email: `e2e.${i}.${stamp}@example.com`, handicapIndex: 8 + i };
    }),
  }});
  ctx.teamId = team.id ?? team.teamId ?? team.team?.id;
  pass('team registered');

  for (const status of ['Active', 'Scoring']) {
    await api('PATCH', `/events/${ctx.eventId}`, { token: ctx.token, body: { status } });
  }
  pass('status machine walked to Scoring');

  let join = await api('POST', `/events/${ctx.code}/join`, {
    body: { email: `e2e.0.${stamp}@example.com`, deviceId: `e2e-${stamp}` } });
  if (join.verificationRequired) {
    join = await api('POST', `/events/${ctx.code}/join`, {
      body: { email: `e2e.0.${stamp}@example.com`, deviceId: `e2e-${stamp}`, verificationCode: '999999' } });
  }
  if (!join.sessionToken) fail('join', 'no sessionToken returned');
  ctx.sessionToken = join.sessionToken; ctx.joinTeamId = join.team?.id;
  ctx.joinPlayerId = join.player?.id; ctx.stamp = stamp;
  pass('golfer joined', c.dim(`${join.team?.players?.length} players`));

  const gross = [3, 5, 3, 4, 3, 2, 5, 4, 4];   // -3 through 9
  const sync = await api('POST', '/sync/scores', { body: {
    eventId: ctx.eventId, teamId: ctx.joinTeamId ?? ctx.teamId,
    sessionToken: ctx.sessionToken, deviceId: `e2e-${stamp}`,
    scores: gross.map((g, i) => ({ holeNumber: i + 1, grossScore: g, putts: 2, clientTimestampMs: Date.now() + i })),
  }});
  if (sync.accepted !== 9 || sync.conflicts !== 0) fail('score sync', JSON.stringify(sync));
  pass('9 holes synced', c.dim('0 conflicts'));

  const lb = await api('GET', `/pub/events/${ctx.code}/leaderboard`);
  const row = (lb.standings ?? [])[0];
  if (!row || row.toPar !== -3 || row.grossTotal !== 33 || row.holesComplete !== 9) {
    fail('leaderboard', `expected -3/33/thru 9, got ${JSON.stringify(row)}`);
  }
  pass('public leaderboard agrees', c.dim('-3 · 33 · thru 9'));

  return ctx;
}

async function phaseLogos(ctx) {
  phase('Logo normalisation');

  // An SVG is the format React Native cannot decode; it must come back as PNG.
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50">' +
    '<rect width="100" height="50" fill="#1c1d1d"/></svg>');

  const sponsor = await api('POST', `/events/${ctx.eventId}/sponsors`, {
    token: ctx.token, body: { name: 'E2E Sponsor', tier: 'gold', placements: {} } });

  const form = new FormData();
  form.append('file', new Blob([svg], { type: 'image/svg+xml' }), 'logo.svg');
  const up = await fetch(`${API}/events/${ctx.eventId}/sponsors/${sponsor.id}/logo`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + ctx.token }, body: form });
  if (!up.ok) fail('svg upload', `${up.status} ${(await up.text()).slice(0, 300)}`);
  const saved = await up.json();
  const url = saved.logoUrl ?? saved.url;

  if (!url || !url.endsWith('.png')) fail('svg → png', `stored url is ${url}`);
  pass('uploaded SVG stored as .png');

  const fetched = await http(`http://localhost:5000${url}`);
  if (fetched.status !== 200) fail('logo fetch', `${fetched.status} for ${url}`);
  if (fetched.headers.get('content-type') !== 'image/png') {
    fail('logo content-type', fetched.headers.get('content-type'));
  }
  pass('served as image/png');

  // Root-relative is the whole point: clients must resolve it against the API,
  // and a url that is already absolute would hide a resolveMediaUrl regression.
  if (!url.startsWith('/uploads/')) fail('logo url shape', `expected /uploads/…, got ${url}`);
  pass('stored root-relative for resolveMediaUrl');
}

async function phaseWeb(ctx) {
  phase('Public web surface');
  const page = await http(`${WEB}/e/${ctx.orgSlug}/${ctx.code}/scores`);
  if (page.status !== 200) fail('scores page', `status ${page.status}`);
  if (!/E2E Team/.test(page.text)) fail('scores page', 'team name missing from server-rendered html');
  if (!/-3/.test(page.text)) fail('scores page', 'score missing from server-rendered html');
  pass('scores page renders the standings');
}

// Every request in this run comes from one address, which is exactly the shape
// of a golf venue: one NAT, one public IP, the whole field behind it. That makes
// this the only place the rate limiter can be tested — the API test project is
// pure unit tests with no host, so nothing there exercises a policy.
//
// The regression being guarded: /join used to be capped at 60 requests/minute
// per IP with email verification costing two calls, so a shotgun start spent
// minutes being rejected at the first tee. And any client without an
// X-GFP-Device header shared a single 600/min bucket, which a few dozen
// spectator browsers could exhaust between them.
async function phaseVenueNat(ctx) {
  phase('Venue NAT — a whole field behind one IP');

  // ── the arrival burst ────────────────────────────────────────────────────
  // Reuses the roster already registered by phaseTournament — by now the event
  // is in Scoring and won't accept new teams, which is itself the realistic
  // case: golfers arrive and join after the organizer has opened scoring.
  //
  // A distinct deviceId per request is what makes each of these a *first* join
  // for that device, i.e. the expensive two-call verification path a real field
  // walks through on the morning.
  const GOLFERS = 40;

  const joinStart = Date.now();
  const joins = await Promise.all(
    Array.from({ length: GOLFERS }, async (_, i) => {
      const email = `e2e.${i % 4}.${ctx.stamp}@example.com`;
      const r = await http(`${API}/events/${ctx.code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, deviceId: `nat-${ctx.stamp}-${i}`, verificationCode: '999999' }),
      });
      return r.status;
    }));
  const joinMs = Date.now() - joinStart;

  const joined429 = joins.filter(s => s === 429).length;
  if (joined429 > 0) {
    fail('join burst', `${joined429}/${GOLFERS} golfers rate-limited (429) joining from one IP`);
  }
  pass('40 concurrent joins, none rate-limited', c.dim(`${joinMs}ms`));

  // ── the anonymous spectator pool ─────────────────────────────────────────
  // No X-GFP-Device header anywhere here: this is the bucket web browsers and
  // TV boards fall into.
  const mixed = await Promise.all([
    ...Array.from({ length: 120 }, () => http(`${API}/pub/events/${ctx.code}/leaderboard`)),
    ...Array.from({ length: 60 },  () => http(`${API}/pub/events/${ctx.code}/status`)),
    ...Array.from({ length: 40 },  () => http(`${API}/pub/events/${ctx.code}`)),
  ]);
  const mixed429 = mixed.filter(r => r.status === 429).length;
  if (mixed429 > 0) {
    fail('spectator burst', `${mixed429}/${mixed.length} anonymous reads rate-limited (429)`);
  }
  pass('220 anonymous spectator reads, none rate-limited');

  // ── the organizer, on the same address ───────────────────────────────────
  // The identity-keyed bucket: staff traffic must not compete with the
  // anonymous pool it shares a NAT with. This only holds because the rate
  // limiter now runs after authentication.
  const staff = await Promise.all([
    ...Array.from({ length: 300 }, () => http(`${API}/pub/events/${ctx.code}/leaderboard`)),
    ...Array.from({ length: 60 }, () =>
      http(`${API}/events/${ctx.eventId}`, { headers: { Authorization: 'Bearer ' + ctx.token } })),
  ]);
  const staffCalls = staff.slice(300);
  const staff429   = staffCalls.filter(r => r.status === 429).length;
  if (staff429 > 0) {
    fail('organizer isolation',
      `${staff429}/60 authenticated organizer reads rate-limited while spectators loaded the same IP`);
  }
  pass('organizer never 429s behind a saturated venue IP');
}

// The join payload used to be built from a four-collection Include whose row
// count was holes × sponsors × players — ~13,000 rows to serve one golfer their
// own scorecard. Count the statements instead of trusting the shape.
async function phaseJoinCost(ctx) {
  phase('Join query cost');

  const logPath = started.find(s => s.name === 'api')?.logPath;
  if (!logPath || !fs.existsSync(logPath)) {
    record('join cost', 'api log not found — cannot count SQL statements');
    return;
  }

  const countStatements = () =>
    (fs.readFileSync(logPath, 'utf8').match(/Executed DbCommand/g) || []).length;

  const before = countStatements();
  const r = await http(`${API}/events/${ctx.code}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `e2e.1.${ctx.stamp}@example.com`,
      deviceId: `cost-${ctx.stamp}`,
      verificationCode: '999999',
    }),
  });
  if (r.status !== 200) { record('join cost', `join returned ${r.status}`); return; }

  await sleep(500);
  const used = countStatements() - before;

  // Narrow reads: event(+org,+course), player, team(+players), sponsors, holes,
  // plus the session-token write. A cartesian Include would show far fewer
  // statements but move orders of magnitude more rows, so the ceiling is a
  // regression guard on the OTHER direction — an N+1 creeping in.
  if (used > 15) fail('join cost', `${used} SQL statements for one join (expected ≤ 15)`);
  pass('join stays a handful of narrow reads', c.dim(`${used} statements`));
}

// Bidding is the one path that opens an explicit database transaction
// (SELECT … FOR UPDATE, to serialise simultaneous bids). Enabling connection
// retry made EF reject user-initiated transactions unless they run inside the
// execution strategy, and that failure only reproduces against real Postgres —
// the unit tests use the InMemory provider, which has no retrying strategy and
// will happily pass a broken build. So the transaction has to be driven here.
//
// Organizer registration, the other explicit transaction, is already exercised
// by the first step of phaseTournament.
async function phaseTransactions(ctx) {
  phase('Explicit transactions (execution strategy)');

  const item = await api('POST', `/events/${ctx.eventId}/auction/items`, {
    token: ctx.token,
    body: {
      title: 'E2E Signed Flag', description: 'For the transaction path',
      auctionType: 'Silent', startingBidCents: 5000, bidIncrementCents: 500,
      closesAt: new Date(Date.now() + 36e5).toISOString(),
    },
  });
  pass('auction lot created');

  // A bid needs the golfer checked in (or carrying a card) — check-in is the
  // path that doesn't involve Stripe.
  const playerId = ctx.joinPlayerId;
  if (!playerId) { record('bid', 'no player id captured at join'); return; }
  await api('POST', `/events/${ctx.eventId}/players/${playerId}/check-in`, { token: ctx.token, body: {} });

  const bid = await api('POST', `/auction/items/${item.id}/bid`, { body: {
    playerId, amountCents: 5000, sessionToken: ctx.sessionToken,
  }});
  if (bid.currentHighBidCents !== 5000) {
    fail('bid', `expected high bid 5000, got ${JSON.stringify(bid)}`);
  }
  pass('bid committed through SELECT … FOR UPDATE', c.dim('$50.00'));

  // A second bid proves the transaction path survives a repeat write, not just
  // the first one on a fresh row.
  //
  // The price deliberately does NOT move: Silent lots are proxy-bid, the raise
  // is the same golfer lifting their own ceiling, and nobody bids against
  // themselves. Asserting the price *held* is the stronger check — it would
  // catch the execution-strategy wrapper re-running the delegate and recording
  // a phantom second bidder.
  const raise = await api('POST', `/auction/items/${item.id}/bid`, { body: {
    playerId, amountCents: 6000, sessionToken: ctx.sessionToken,
  }});
  if (!raise.isWinning) {
    fail('raise', `raising bidder should still hold the lot: ${JSON.stringify(raise)}`);
  }
  if (raise.currentHighBidCents !== 5000) {
    fail('raise', `sole proxy bidder must not bid against themselves — ` +
                  `expected the price to hold at 5000, got ${raise.currentHighBidCents}`);
  }
  pass('proxy raise holds the public price', c.dim('$50.00, lot still held'));
}

// ── main ──────────────────────────────────────────────────────────────────────
(async () => {
  const t0 = Date.now();
  console.log(c.hd(`\nGolf Fundraiser Pro — end-to-end on a clean build${FAST ? ' (--fast)' : ''}`));
  try {
    await phaseClean();
    await phaseGates();
    await phaseBoot();
    const ctx = await phaseTournament();
    await phaseLogos(ctx);
    await phaseWeb(ctx);
    await phaseJoinCost(ctx);
    await phaseTransactions(ctx);
    await phaseVenueNat(ctx);
  } catch (e) {
    // fail() prints and records its own detail; anything else lands here and
    // must be recorded, or the summary reports a pass that never happened.
    if (!results.some(r => !r.ok)) record('unhandled error', (e && (e.stack || e.message)) || e);
  } finally {
    if (!KEEP) { phase('Teardown'); stopAll(); }
    else console.log(`\n  ${c.dim('--keep: services left running')}`);
  }

  const failed = results.filter(r => !r.ok);
  console.log(c.hd(`\n── summary ─────────────────────────────────────────`));
  for (const r of results) {
    console.log(`  ${r.ok ? c.ok('✓') : c.bad('✗')} ${r.name}`);
  }
  console.log(`\n  ${failed.length ? c.bad(`${failed.length} failed`) : c.ok('all passed')} ` +
              c.dim(`in ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min`));
  if (failed.length) console.log(c.dim(`  logs: ${LOG_DIR}`));
  process.exit(failed.length ? 1 : 0);
})();
