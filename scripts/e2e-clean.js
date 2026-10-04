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
 *   node scripts/e2e-clean.js --fast --skip-gates   # CI: other jobs run the gates
 *
 * The browser UI smoke drives an installed Chromium-family browser (Edge or
 * Chrome are found automatically); point GFP_E2E_BROWSER at the executable to
 * override. Ports owned during a run: 5000 API, 3000 web, 8081 admin UI,
 * 8200 mobile UI — the harness refuses to start if any is taken.
 *
 * Exits non-zero on the first failed phase, with the failing output.
 */

const { execSync, spawn } = require('node:child_process');
const fs   = require('node:fs');
const net  = require('node:net');
const path = require('node:path');
const os   = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const API  = 'http://localhost:5000/api/v1';
const WEB  = 'http://localhost:3000';

// The harness runs against its OWN database and its own Redis db index, so a
// run can never destroy local dev data. Changing these names is a decision, not
// a tidy-up: golf_fundraiser (db 0) is the developer's.
const PG      = 'gfp-postgres';
const REDIS   = 'gfp-redis';
const E2E_DB  = 'golf_fundraiser_e2e';
const E2E_PG_URL    = `postgres://gfp:gfp_local@localhost:5432/${E2E_DB}`;
const E2E_REDIS_URL = 'localhost:6379,defaultDatabase=1';  // SE.Redis syntax, not a redis:// path
const LOG_DIR = path.join(os.tmpdir(), 'gfp-e2e');

const ARGS = process.argv.slice(2);
const FAST = ARGS.includes('--fast');
const KEEP = ARGS.includes('--keep');
// CI already runs lint/type-check/vitest/dotnet test as separate jobs, so the
// e2e job skips them. The API build stays: boot runs `dotnet run --no-build`.
const SKIP_GATES = ARGS.includes('--skip-gates');

const started = [];           // child processes we own and must stop
const results = [];
const retries = [];           // checks that passed only after a visible retry
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
  console.log(`  ${c.bad('✗')} ${name}\n${String(err).split('\n').slice(0, 40).map(l => '    ' + l).join('\n')}`);
  throw new Error(name);
}

// An exception that never went through fail() must still sink the run: api()
// and fetch() throw raw Errors, and a bare catch turned that into a green exit.
function record(name, err) {
  results.push({ name, ok: false, ms: Date.now() - phaseStart, err: String(err) });
  const detail = String(err).split('\n').slice(0, 40).map(l => '    ' + l).join('\n');
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
  // On POSIX, detached makes the shell a process-group leader so stopAll can
  // kill the whole tree (sh → npm → next, sh → dotnet → WebAPI) by group id;
  // without it kill(-pid) hits no group and the servers outlive the run. On
  // Windows detached would open a console window, and taskkill /T walks the
  // tree anyway.
  const child = spawn([cmd, ...args].join(' '), {
    cwd, env: { ...process.env, ...env }, stdio: ['ignore', out, out], shell: true,
    detached: process.platform !== 'win32',
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
    } catch (e) {
      // Already gone is fine (ESRCH; taskkill exits 128). Anything else means
      // a server may still hold its port — say so, don't swallow it.
      if (e.code !== 'ESRCH' && e.status !== 128) {
        console.log(`  ${c.dim(`could not stop ${name}: ${e.message.split('\n')[0]}`)}`);
      }
    }
  }
  started.length = 0;
}

// Detached services sit outside the terminal's process group, so Ctrl+C no
// longer reaches them; stop them here or an interrupted run orphans them.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { if (!KEEP) stopAll(); process.exit(130); });
}
// An exception thrown inside an event callback (a puppeteer page listener, a
// stream) never reaches main's try/finally, so teardown would be skipped and
// the API/web/browser left holding their ports for the next run.
process.on('uncaughtException', e => {
  console.log(`\n  ${c.bad('✗')} uncaught exception\n${String(e.stack || e).split('\n').slice(0, 15).map(l => '    ' + l).join('\n')}`);
  if (!KEEP) stopAll();
  process.exit(1);
});

// ── port guard ────────────────────────────────────────────────────────────────
// Boot only waits for SOMETHING to answer on :5000 / :3000. If a dev API or web
// server is already there, ours fails to bind and the wait succeeds against the
// dev one, so every phase runs against golf_fundraiser and still prints "all
// passed" (T6). Refuse to start instead, before the clean phase spends minutes
// and before dotnet clean trips the running API's MSB3021 build lock.
const OWNED_PORTS = [[5000, 'API'], [3000, 'web'], [8081, 'admin UI'], [8200, 'mobile UI']];

function portAnswers(port, host) {
  return new Promise(resolve => {
    const sock = net.connect({ port, host });
    const done = up => { sock.destroy(); resolve(up); };
    sock.setTimeout(1000, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

function portOwner(port) {
  try {
    if (process.platform === 'win32') {
      const line = run('netstat -ano -p tcp').split('\n')
        .find(l => /LISTENING/.test(l) && new RegExp(`:${port}\\s`).test(l));
      return line ? `PID ${line.trim().split(/\s+/).pop()}` : '';
    }
    const pid = run(`lsof -t -iTCP:${port} -sTCP:LISTEN`).trim().split('\n')[0];
    return pid ? `PID ${pid}` : '';
  } catch { return ''; }
}

async function phasePorts() {
  phase('Port guard');
  const busy = [];
  for (const [port, name] of OWNED_PORTS) {
    // The dev API binds 127.0.0.1 and ::1 separately; check both families.
    if (await portAnswers(port, '127.0.0.1') || await portAnswers(port, '::1')) {
      const owner = portOwner(port);
      busy.push(`:${port} (${name}) is already in use${owner ? ` by ${owner}` : ''}`);
    }
  }
  if (busy.length) {
    fail('ports free', busy.join('\n') +
      '\nStop your dev servers (or a previous --keep run) and re-run. The harness' +
      '\nwould otherwise test THEM, against the dev database, and report a pass.');
  }
  pass('ports free', c.dim(OWNED_PORTS.map(([p]) => ':' + p).join(' ')));
}

// Ready means OUR process logged that it is serving the expected port, and is
// still alive. An HTTP answer alone could come from someone else's server.
function ownServiceReady(name, logLine) {
  const svc = started.find(s => s.name === name);
  if (svc.child.exitCode !== null) {
    throw new Error(`${name} exited (code ${svc.child.exitCode}) — see ${svc.logPath}`);
  }
  return logLine.test(fs.readFileSync(svc.logPath, 'utf8'));
}

async function waitForOwn(name, logLine, httpCheck, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // An exited service fails immediately; the bare waitFor would keep polling.
    if (ownServiceReady(name, logLine)) {
      try { if (await httpCheck()) return; } catch { /* not answering yet */ }
    }
    await sleep(2000);
  }
  throw new Error(`timed out waiting for ${name} after ${timeoutMs / 1000}s`);
}

// ── phases ────────────────────────────────────────────────────────────────────

async function phaseClean() {
  phase('Clean slate');
  try {
    // The harness owns golf_fundraiser_e2e and nothing else. Dropping and
    // recreating THAT gives the same guarantee `down -v` used to — migrations
    // run from zero, so no leftover test event can make a broken query look
    // like it works — without touching the developer's own database. It used
    // to drop the whole volume, which on 2026-09-23 deleted a real account.
    // Only the two services the harness uses; pgadmin is a dev convenience and
    // just another image to pull on a fresh CI runner.
    run('docker compose -f infra/docker-compose.yml up -d postgres redis');
    // -h 127.0.0.1, not the socket: on a FRESH volume the image runs init
    // scripts on a temporary socket-only server, then restarts. A socket check
    // passes during init and the DROP/CREATE below races the restart.
    await waitFor('postgres', () => { run(`docker exec ${PG} pg_isready -h 127.0.0.1 -U gfp`, { stdio: 'ignore' }); return true; }, 120_000);
    await waitFor('redis', () => run(`docker exec ${REDIS} redis-cli ping`).trim() === 'PONG', 60_000);
    run(`docker exec ${PG} psql -U gfp -d postgres -v ON_ERROR_STOP=1 ` +
        `-c "DROP DATABASE IF EXISTS ${E2E_DB} WITH (FORCE)" ` +
        `-c "CREATE DATABASE ${E2E_DB} OWNER gfp"`, { stdio: 'ignore' });
    // Redis db 1 is the harness's; FLUSHDB there never touches dev's db 0.
    run(`docker exec ${REDIS} redis-cli -n 1 FLUSHDB`, { stdio: 'ignore' });
    pass('docker infra up, e2e database recreated');
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
  if (SKIP_GATES) console.log(`  ${c.dim('--skip-gates: only the API build runs (CI runs the rest as separate jobs)')}`);
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
    if (SKIP_GATES && name !== 'dotnet build') continue;
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
    DATABASE_URL: E2E_PG_URL,
    REDIS_URL:    E2E_REDIS_URL,
    ASPNETCORE_ENVIRONMENT: 'Development',
  });
  try {
    await waitForOwn('api', /Now listening on: http:\/\/localhost:5000\b/,
      async () => (await http(`${API}/pub/events/ZZZZZZZZ`)).status === 404, 240_000);
  } catch (e) { fail('API on :5000', e.message); }
  pass('API on :5000');

  startService('web', 'npm', ['run', 'dev'], path.join(ROOT, 'apps/web'));
  // Next silently moves to :3001 when :3000 is taken, so require the exact port.
  try {
    await waitForOwn('web', /Local:\s+http:\/\/localhost:3000\b/,
      async () => (await http(WEB)).status === 200, 180_000);
  } catch (e) { fail('web on :3000', e.message); }
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
  ctx.orgEmail = `e2e.${stamp}@example.com`; ctx.orgPassword = 'E2eVerify!2026#pw';
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
  ctx.join = join; ctx.deviceId = `e2e-${stamp}`; ctx.eventName = `E2E ${stamp}`;
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

// ── scoring formats and conflicts (T9) ────────────────────────────────────────
// The tournament phase plays one Scramble, happy path only. Each check below
// runs on its OWN event so it cannot disturb what later phases assert about
// the main one (the scores page expects -3).

const E2E_PARS = [4,5,3,4,4,3,5,4,4, 4,3,5,4,4,3,4,5,4];

// Register → course → team → Scoring → join the first golfer. Returns ids and
// the golfer's session so the caller can sync as that device.
async function setupScoringEvent(ctx, format, players) {
  const tag = `${format}-${Date.now()}`;
  const ev = await api('POST', '/events', { token: ctx.token, body: {
    name: `E2E ${tag}`, format, startType: 'Shotgun', holes: 18,
    startAt: new Date(Date.now() + 864e5).toISOString(), config: { maxTeams: 10 },
  }});
  await api('PATCH', `/events/${ev.id}`, { token: ctx.token, body: { status: 'Registration' } });
  await api('POST', `/events/${ev.id}/course`, { token: ctx.token, body: {
    name: 'E2E National', address: '1 Fairway', city: 'Austin', state: 'TX', zip: '78701',
    holes: E2E_PARS.map((par, i) => ({ holeNumber: i + 1, par, handicapIndex: i + 1,
      yardageWhite: 300 + par * 40, yardageBlue: 330 + par * 40, yardageRed: 260 + par * 40 })),
  }});
  const team = await api('POST', `/events/${ev.id}/register/team`, { body: {
    teamName: `Team ${format}`, maxPlayers: 4,
    players: players.map((n, i) => {
      const [firstName, lastName] = n.split(' ');
      return { firstName, lastName, email: `e2e.${tag}.${i}@example.com`, handicapIndex: 10 };
    }),
  }});
  for (const status of ['Active', 'Scoring']) {
    await api('PATCH', `/events/${ev.id}`, { token: ctx.token, body: { status } });
  }
  const deviceId = `e2e-${tag}`;
  const body = { email: `e2e.${tag}.0@example.com`, deviceId };
  let join = await api('POST', `/events/${ev.eventCode}/join`, { body });
  if (join.verificationRequired) {
    join = await api('POST', `/events/${ev.eventCode}/join`, { body: { ...body, verificationCode: '999999' } });
  }
  if (!join.sessionToken) fail(`${format} join`, 'no sessionToken returned');
  const byName = Object.fromEntries((join.team?.players ?? []).map(p => [`${p.firstName} ${p.lastName}`, p.id]));
  return { eventId: ev.id, code: ev.eventCode, teamId: join.team?.id ?? team.id ?? team.teamId,
           deviceId, sessionToken: join.sessionToken, playerIds: players.map(n => byName[n]) };
}

function syncAs(e, scores) {
  return api('POST', '/sync/scores', { body: {
    eventId: e.eventId, teamId: e.teamId, sessionToken: e.sessionToken, deviceId: e.deviceId,
    scores: scores.map((s, i) => ({ putts: 2, clientTimestampMs: Date.now() + i, ...s })),
  }});
}

async function phaseFormats(ctx) {
  phase('Scoring formats (U8)');
  // Two golfers, three holes (pars 4, 5, 3). Ava: 4,5,3 = E (12). Ben: 5,6,4 = +3 (15).
  const shots = [[4, 5], [5, 6], [3, 4]];

  // Stroke Play scores each golfer on their own ball: an individual board.
  phaseStart = Date.now();
  {
    const e = await setupScoringEvent(ctx, 'Stroke', ['Ava Stroke', 'Ben Stroke']);
    const [ava, ben] = e.playerIds;
    if (!ava || !ben) fail('stroke setup', `player ids missing: ${JSON.stringify(e.playerIds)}`);
    const sync = await syncAs(e, shots.map(([a, b], i) => ({
      holeNumber: i + 1, grossScore: a + b, playerShots: { [ava]: a, [ben]: b } })));
    if (sync.accepted !== 3 || sync.conflicts !== 0) fail('stroke sync', JSON.stringify(sync));
    const lb = await api('GET', `/pub/events/${e.code}/leaderboard`);
    const ind = lb.individuals ?? [];
    const row = id => ind.find(r => r.playerId === id);
    const A = row(ava), B = row(ben);
    if (!A || !B || A.rank !== 1 || A.toPar !== 0 || A.grossTotal !== 12 || A.holesComplete !== 3 ||
        B.rank !== 2 || B.toPar !== 3 || B.grossTotal !== 15 || B.strokesBack !== 3) {
      fail('stroke individual board', `expected Ava E/12 1st, Ben +3/15 2nd (3 back), got ${JSON.stringify(ind)}`);
    }
    pass('Stroke Play ranks golfers individually', c.dim('Ava E · Ben +3'));
  }

  // Stableford: per golfer max(0, par − strokes + 2), summed per team.
  // Ava 2+2+2, Ben 1+1+1 → 9 points.
  phaseStart = Date.now();
  {
    const e = await setupScoringEvent(ctx, 'Stableford', ['Ava Stable', 'Ben Stable']);
    const [ava, ben] = e.playerIds;
    const sync = await syncAs(e, shots.map(([a, b], i) => ({
      holeNumber: i + 1, grossScore: a + b, playerShots: { [ava]: a, [ben]: b } })));
    if (sync.accepted !== 3 || sync.conflicts !== 0) fail('stableford sync', JSON.stringify(sync));
    const lb = await api('GET', `/pub/events/${e.code}/leaderboard`);
    const row = (lb.standings ?? [])[0];
    if (!row || row.stablefordPoints !== 9 || row.holesComplete !== 3) {
      fail('stableford points', `expected 9 points thru 3, got ${JSON.stringify(row)}`);
    }
    pass('Stableford sums per-golfer points', c.dim('9 pts thru 3'));
  }

  // Best Ball: the team takes the lowest golfer on each hole (Rule 23).
  // min(4,5) + min(5,6) + min(3,4) = 12 on par 12 → E. A Scramble-style sum
  // would give 27.
  phaseStart = Date.now();
  {
    const e = await setupScoringEvent(ctx, 'BestBall', ['Ava Best', 'Ben Best']);
    const [ava, ben] = e.playerIds;
    const sync = await syncAs(e, shots.map(([a, b], i) => ({
      holeNumber: i + 1, grossScore: a + b, playerShots: { [ava]: a, [ben]: b } })));
    if (sync.accepted !== 3 || sync.conflicts !== 0) fail('best ball sync', JSON.stringify(sync));
    const lb = await api('GET', `/pub/events/${e.code}/leaderboard`);
    const row = (lb.standings ?? [])[0];
    if (!row || row.grossTotal !== 12 || row.toPar !== 0 || row.holesComplete !== 3) {
      fail('best ball low ball', `expected 12 / E thru 3 (not the 27 sum), got ${JSON.stringify(row)}`);
    }
    pass('Best Ball takes the low ball per hole', c.dim('12 · E thru 3'));
  }
}

// The public leaderboard is a 2s-TTL Redis read-through cache that nothing
// invalidates (spec §3: the TTL absorbs spectator bursts). A read within 2s of
// a change can be stale BY DESIGN, so poll until the expected row appears.
async function boardRowUntil(code, ok, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  let row;
  do {
    row = (await api('GET', `/pub/events/${code}/leaderboard`)).standings?.[0];
    if (row && ok(row)) return row;
    await sleep(500);
  } while (Date.now() < deadline);
  return row;
}

async function phaseConflict(ctx) {
  phase('Score conflict round-trip');
  phaseStart = Date.now();
  const e = await setupScoringEvent(ctx, 'Scramble', ['Cleo Conflict', 'Dev Conflict']);
  // Holes 1-2 from the golfer: 4 + 5 on pars 4, 5 → E (9).
  let sync = await syncAs(e, [{ holeNumber: 1, grossScore: 4 }, { holeNumber: 2, grossScore: 5 }]);
  if (sync.accepted !== 2) fail('conflict setup sync', JSON.stringify(sync));

  // The admin transcribes hole 3 from the paper card first: 3 (par 3), then
  // marks it complete. Entry and completion are separate steps (U1): only a
  // completed hole counts on the leaderboard.
  const admin = await api('POST', `/events/${e.eventId}/scores`, { token: ctx.token,
    body: { teamId: e.teamId, holeNumber: 3, grossScore: 3 } });
  await api('POST', `/events/${e.eventId}/teams/${e.teamId}/holes/3/complete`, { token: ctx.token,
    body: { complete: true } });
  let row = await boardRowUntil(e.code, r => r.holesComplete === 3 && r.grossTotal === 12);
  if (!row || row.holesComplete !== 3 || row.grossTotal !== 12) {
    fail('admin hole on the board', `expected thru 3 / 12 after the admin's hole 3, got ${JSON.stringify(row)}`);
  }
  pass('admin enters and completes hole 3 first', c.dim('E · 12 · thru 3'));

  // The phone then syncs a different hole 3. The admin's value must stay, the
  // phone's becomes a proposal, and the hole drops off the leaderboard.
  phaseStart = Date.now();
  sync = await syncAs(e, [{ holeNumber: 3, grossScore: 4 }]);
  const cd = sync.conflictDetails?.[0];
  if (sync.conflicts !== 1 || cd?.existingScore !== 3 || cd?.submittedScore !== 4) {
    fail('conflict detected', `expected 1 conflict 3 vs 4, got ${JSON.stringify(sync)}`);
  }
  const card = await api('GET', `/pub/events/${e.code}/teams/${e.teamId}/scorecard`);
  const h3 = card.holes?.find(h => h.holeNumber === 3);
  if (!h3 || h3.grossScore !== 3 || !h3.isConflicted || h3.proposedScore !== 4) {
    fail('conflict on scorecard', `expected hole 3 = 3, conflicted, proposed 4; got ${JSON.stringify(h3)}`);
  }
  row = await boardRowUntil(e.code, r => r.holesComplete === 2 && r.grossTotal === 9);
  if (!row || row.holesComplete !== 2 || row.grossTotal !== 9) {
    fail('conflict off the board', `expected thru 2 / 9 while conflicted, got ${JSON.stringify(row)}`);
  }
  pass('phone conflict kept as a proposal, hole off the board', c.dim('admin 3 · proposed 4 · thru 2'));

  // The admin approves the golfer's value: hole 3 becomes 4, back on the board.
  phaseStart = Date.now();
  const resolved = await api('POST', `/events/${e.eventId}/scores/${admin.id}/resolve`, { token: ctx.token,
    body: { acceptedScore: 4, resolutionNote: 'e2e: golfer was right' } });
  if (resolved.isConflicted || resolved.grossScore !== 4 || resolved.proposedScore != null) {
    fail('conflict resolved', JSON.stringify(resolved));
  }
  row = await boardRowUntil(e.code, r => r.holesComplete === 3 && r.grossTotal === 13 && r.toPar === 1);
  if (!row || row.holesComplete !== 3 || row.grossTotal !== 13 || row.toPar !== 1) {
    fail('resolved score on the board', `expected thru 3 / 13 / +1, got ${JSON.stringify(row)}`);
  }
  pass('admin approval puts the hole back on the board', c.dim('+1 · 13 · thru 3'));
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
// ── browser UI smoke (T8) ─────────────────────────────────────────────────────
// Every phase above talks to the API directly; nothing loaded a real UI. #56 (a
// hook below an early return crashed the scorer) was green across 551 tests.
// Export both web apps, serve them on the ports the API's GfpDevelopment CORS
// policy already allows (8081 admin, 8200 mobile), and drive them headless.

function findBrowser() {
  if (process.env.GFP_E2E_BROWSER) return process.env.GFP_E2E_BROWSER;
  const candidates = {
    win32: ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
            'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
            'C:/Program Files/Google/Chrome/Application/chrome.exe'],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
             '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  }[process.platform] ?? ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
                          '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return candidates.find(p => fs.existsSync(p));
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };

// Admin exports one .html per route (output: static); mobile is a single
// index.html. Resolve exact file → route.html → dir/index.html → index.html.
function serveStatic(dir, port) {
  const server = require('node:http').createServer((req, res) => {
    const rel = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\\/]+/, '');
    const base = path.join(dir, rel);
    if (!base.startsWith(dir)) { res.statusCode = 403; return res.end(); }
    const file = [base, base + '.html', path.join(base, 'index.html'), path.join(dir, 'index.html')]
      .find(f => fs.existsSync(f) && fs.statSync(f).isFile());
    res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
}

// puppeteer.launch can refuse with "browser is already running for <dir>" on
// Edge even with a fresh profile; launching it ourselves and connecting over
// the DevTools port has never failed. Port 0 + DevToolsActivePort avoids
// claiming a fixed port. The child joins `started`, so teardown kills it.
async function launchBrowser(exe) {
  const profile = path.join(LOG_DIR, 'browser-profile');
  fs.rmSync(profile, { recursive: true, force: true });
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
                '--no-first-run', '--no-default-browser-check', 'about:blank'];
  // Chrome's sandbox needs unprivileged user namespaces, which ubuntu-24.04
  // runners restrict via AppArmor; the pages are our own build, so in CI (or
  // as root) run without it.
  if (process.env.CI || process.getuid?.() === 0) args.unshift('--no-sandbox');
  const child = spawn(exe, args, { stdio: 'ignore', detached: process.platform !== 'win32' });
  started.push({ name: 'browser', child, logPath: null });
  const portFile = path.join(profile, 'DevToolsActivePort');
  await waitFor('browser DevTools port', () => fs.existsSync(portFile) && fs.readFileSync(portFile, 'utf8').trim(), 30_000);
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
  return require('puppeteer-core').connect({ browserURL: `http://127.0.0.1:${port}` });
}

// A page whose uncaught errors and console.error lines are recorded.
async function watchedPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 900 });
  const errors = [];
  const t0 = Date.now();
  const at = () => `+${Date.now() - t0}ms`;
  page.on('pageerror', e => errors.push(`pageerror ${at()}: ${String(e.stack || e.message).split('\n').slice(0, 3).join(' | ')}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text().slice(0, 200)}`); });
  // Every API call the page makes (and every top-level navigation), so a
  // failed check says whether the app never asked, asked and failed, or got
  // an unexpected answer.
  const api = [];
  const short = u => u.replace('http://localhost:5000', '');
  const ours = u => u.startsWith('http://localhost:5000');
  page.on('request', r => { if (ours(r.url())) api.push(`${at()} → ${r.method()} ${short(r.url())}`); });
  const stats = { abortedApi: 0, scorecardOk: false };
  page.on('response', r => { if (ours(r.url()) && r.status() === 200 && /\/scorecard$/.test(r.url())) stats.scorecardOk = true; });
  page.on('requestfailed', r => { if (ours(r.url()) && r.failure()?.errorText === 'net::ERR_ABORTED') stats.abortedApi++; });
  page.on('response', r => { if (ours(r.url())) api.push(`${at()} ${r.status()} ${r.request().method()} ${short(r.url())}`); });
  page.on('requestfailed', r => { if (ours(r.url())) api.push(`${at()} FAILED ${r.method()} ${short(r.url())} (${r.failure()?.errorText})`); });
  page.on('framenavigated', f => { if (f === page.mainFrame()) api.push(`${at()} NAVIGATED ${f.url()}`); });
  const trace = () => `Page activity (${api.length}):\n` + (api.slice(-18).join('\n') || '(none)');
  return { page, errors, trace, stats };
}

async function phaseUi(ctx) {
  phase('Browser UI smoke');
  const exe = findBrowser();
  if (!exe) fail('browser', 'no Chromium-family browser found; set GFP_E2E_BROWSER to its executable');

  for (const app of ['admin', 'mobile']) {
    phaseStart = Date.now();
    try { run(`npm run build -w @gfp/${app}`, { env: { ...process.env, EXPO_PUBLIC_API_URL: 'http://localhost:5000' } }); }
    catch (e) { fail(`${app} web export`, (e.stdout || '') + (e.stderr || '')); }
    pass(`${app} web export`);
  }

  const servers = [await serveStatic(path.join(ROOT, 'apps/admin/dist'), 8081),
                   await serveStatic(path.join(ROOT, 'apps/mobile/dist'), 8200)];
  let browser;
  try {
    phaseStart = Date.now();
    browser = await launchBrowser(exe);

    // Mobile scorer: seed the session /join returned, exactly where the web
    // db shim keeps it, then expect the scorecard to show the 9 synced holes.
    //
    // ONE visible retry, for one known pattern only (T12): roughly 1 run in 8
    // on Windows/Edge, every request in the page is aborted ~10ms after the
    // scorecard's first API calls (ERR_ABORTED on API and static assets alike;
    // the icon font then throws NetworkError). Cause not yet found. Web polls
    // every 60s, so the page never recovers inside the wait. Retry only when
    // API calls were aborted AND no scorecard response arrived; print it as ⚠
    // so it stays visible. Anything else, or a second failure, fails as before.
    for (let attempt = 1; ; attempt++) {
      phaseStart = Date.now();
      const { page, errors, trace, stats } = await watchedPage(browser);
      await page.evaluateOnNewDocument((join, deviceId) => {
        localStorage.setItem('gfp:gfp:session', join);
        localStorage.setItem('gfp:gfp:deviceId', deviceId);
      }, JSON.stringify(ctx.join), ctx.deviceId);
      await page.goto('http://localhost:8200/', { waitUntil: 'networkidle2', timeout: 60_000 });
      let shown = true;
      try { await page.waitForSelector('[aria-label="Edit score for hole 1"]', { timeout: 30_000 }); }
      catch { shown = false; }
      if (!shown && attempt === 1 && stats.abortedApi > 0 && !stats.scorecardOk) {
        console.log(`  ${c.bad('⚠')} mobile scorecard: first load's API requests were aborted (${stats.abortedApi}) — retrying once (T12)\n` +
          trace().split('\n').map(l => '      ' + l).join('\n'));
        retries.push('mobile scorecard');
        await page.close();
        continue;
      }
      if (!shown) {
        const text = (await page.evaluate(() => document.body.innerText)).slice(0, 300);
        fail('mobile scorecard', `no completed hole 1 on ${page.url()}\n${trace()}\n${errors.join('\n')}\n${text}`);
      }
      if (errors.length) fail('mobile scorecard', errors.join('\n'));
      pass('mobile scorecard renders the synced holes',
        c.dim(new URL(page.url()).pathname + (attempt > 1 ? ' (after 1 retry)' : '')));
      await page.close();
      break;
    }

    // Admin: sign in through the real form and expect this run's event.
    {
      phaseStart = Date.now();
      const { page, errors, trace } = await watchedPage(browser);
      await page.goto('http://localhost:8081/login', { waitUntil: 'networkidle2', timeout: 60_000 });
      await page.type('input[placeholder="organizer@email.com"]', ctx.orgEmail);
      await page.type('input[placeholder="••••••••"]', ctx.orgPassword);
      await page.click('[aria-label="Sign in"]');
      try {
        await page.waitForFunction(name => document.body.innerText.includes(name), { timeout: 30_000 }, ctx.eventName);
      } catch {
        const text = (await page.evaluate(() => document.body.innerText)).slice(0, 300);
        fail('admin sign-in', `"${ctx.eventName}" never appeared on ${page.url()}\n${trace()}\n${errors.join('\n')}\n${text}`);
      }
      if (errors.length) fail('admin sign-in', errors.join('\n'));
      pass('admin signs in and lists the event', c.dim(new URL(page.url()).pathname));
      await page.close();
    }
  } finally {
    if (browser) await browser.disconnect();
    for (const s of servers) s.close();
  }
}

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
    await phasePorts();
    await phaseClean();
    await phaseGates();
    await phaseBoot();
    const ctx = await phaseTournament();
    await phaseLogos(ctx);
    await phaseWeb(ctx);
    await phaseJoinCost(ctx);
    await phaseTransactions(ctx);
    await phaseFormats(ctx);
    await phaseConflict(ctx);
    await phaseUi(ctx);
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
  // A pass that needed a retry is still worth seeing in the summary (T12).
  if (retries.length) console.log(`  ${c.bad('⚠')} passed only after a retry: ${retries.join(', ')} (see problemList T12)`);
  process.exit(failed.length ? 1 : 0);
})();
