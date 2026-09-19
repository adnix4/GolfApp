#!/usr/bin/env node
/**
 * Dependency health check for the Golf Fundraiser Pro monorepo.
 *
 * Reports four things and exits non-zero if anything needs attention:
 *   1. Version mismatches  — a "watchlist" framework package (react,
 *      react-native, etc.) resolving to more than one version across the
 *      workspace. This is the class of bug that broke the web bundle
 *      (react 19.2.0 vs react-dom 19.0.0) and the mobile native tree
 *      (react-native 0.79.2 vs 0.83.6).
 *   2. SDK-managed pins    — packages whose version is chosen by the installed
 *      Expo SDK, NOT by npm. Fetched live from api.expo.dev, so the list can
 *      never go stale the way a hand-maintained table does. For these, npm's
 *      `latest` is noise: it is routinely ahead of what the SDK targets
 *      (npm said react-native 0.87.1 while SDK 57 targets 0.86.3, and
 *      react 19.3.0 while SDK 57 targets 19.2.3). Bumping one desyncs the
 *      native tree from the SDK. Reporting them as ordinary "outdated"
 *      packages is what produced the bad bumps in PR #40 and PR #64.
 *   3. Runtime-tracked pins — packages whose major must track something other
 *      than npm's newest: @types/node follows the Node major this repo runs
 *      (engines.node / CI), @types/react* follow the pinned React minor.
 *   4. Outdated packages   — genuinely actionable updates. Any update whose
 *      target version was published less than COOLDOWN_HOURS (default 72h)
 *      ago is "held back" — flagged as not-yet-installable so a freshly
 *      published (and possibly compromised) version is never pulled in
 *      immediately. The window is a supply-chain safety cooldown.
 *
 * Report-only: it never touches git or node_modules. Run via:
 *     npm run check-updates                    # full report
 *     npm run check-updates -- --assert-pins   # CI gate, see below
 *     npm run check-updates -- --json          # machine-readable
 *
 * --assert-pins is the guard the weekly update routine needs: it fails when a
 * manifest pin or an installed version has drifted away from the SDK target.
 * That turns "a PR quietly bumped react past the SDK" from something a human
 * has to notice into a failing check. It also catches the reverse case, where
 * Expo moves a target within the same SDK (57 moved react-native 0.86.2 ->
 * 0.86.3 with no SDK bump) and our pin silently goes stale.
 *
 * Network: SDK data comes from api.expo.dev. If it is unreachable the SDK and
 * runtime sections degrade to a warning and --assert-pins passes rather than
 * failing CI on a network blip; everything else still runs offline.
 *
 * Exit codes:
 *   0  clean (outdated packages are informational)
 *   1  watchlist version mismatch, or (with --assert-pins) a pin divergence
 *   2  the check itself failed to run
 */
'use strict';

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const ASSERT_PINS = args.has('--assert-pins');
const JSON_OUT = args.has('--json');

// Packages that MUST resolve to a single version across the monorepo.
// Multiple copies of these cause runtime crashes, not just bloat.
const WATCHLIST = [
  'react',
  'react-dom',
  // Two copies of @types/react make tsc reject every react-native component
  // with TS2786 ("cannot be used as a JSX component"), because react-native's
  // bundled types and a workspace's own types end up on different copies.
  '@types/react',
  '@types/react-dom',
  'react-native',
  'react-native-web',
  'react-native-safe-area-context',
  'react-native-screens',
  'expo',
];

// Supply-chain cooldown: an available update must have been on the registry
// for at least this long before it's treated as installable. Guards against
// pulling in a version published only minutes/hours ago (the window in which a
// compromised release is most likely to still be live). Override with
// UPDATE_COOLDOWN_HOURS for a one-off looser/tighter window.
const COOLDOWN_HOURS = Number(process.env.UPDATE_COOLDOWN_HOURS) || 72;

// Expo's own view of what an SDK targets. These two endpoints are the
// authoritative source — npm's dist-tags are not. GFP_SDK_MAJOR overrides the
// detected SDK, which is how the drift path gets exercised in testing.
const EXPO_VERSIONS_URL = 'https://api.expo.dev/v2/versions/latest';
const expoNativeModulesUrl = (major) => 'https://api.expo.dev/v2/sdks/' + major + '.0.0/native-modules';
const NETWORK_TIMEOUT_MS = Number(process.env.GFP_NET_TIMEOUT_MS) || 10000;

function readLockfile() {
  const lockPath = path.join(repoRoot, 'package-lock.json');
  if (!fs.existsSync(lockPath)) {
    throw new Error('package-lock.json not found — run from the repo root.');
  }
  return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
}

/** Map every installed package name -> Set of versions present in the tree. */
function collectVersions(lock) {
  const versions = new Map();
  for (const [key, meta] of Object.entries(lock.packages || {})) {
    if (!key.includes('node_modules') || !meta.version) continue;
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    if (!versions.has(name)) versions.set(name, new Set());
    versions.get(name).add(meta.version);
  }
  return versions;
}

function checkMismatches(versions) {
  const problems = [];
  for (const name of WATCHLIST) {
    const found = versions.get(name);
    if (found && found.size > 1) {
      problems.push({ name, versions: [...found].sort() });
    }
  }
  return problems;
}

/** "1.2.3" / "1.2.3-rc.0" -> [1,2,3]; anything else -> null. */
function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(v).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * Minimal semver range test, deliberately dependency-free.
 *
 * `semver` is only present in this tree as a transitively hoisted copy, so
 * requiring it would make this script break whenever the hoist moves. Expo
 * only ever publishes exact ("0.86.3"), tilde ("~5.7.0") and caret ("^1.2.3")
 * pins, plus the occasional "*", so that is all we need to understand.
 * Anything unrecognised returns null = "cannot judge", never a false failure.
 */
function satisfiesSimple(version, range) {
  if (!version || !range) return null;
  const r = String(range).trim();
  if (r === '*' || r === 'latest' || r === '') return true;

  const got = parseVersion(version);
  if (!got) return null;

  const op = (r[0] === '~' || r[0] === '^') ? r[0] : '=';
  const want = parseVersion(op === '=' ? r : r.slice(1));
  if (!want) return null;

  if (op === '=') return got[0] === want[0] && got[1] === want[1] && got[2] === want[2];
  // Both ~ and ^ require the same major here; ~ additionally pins the minor.
  if (got[0] !== want[0]) return false;
  if (op === '~' && got[1] !== want[1]) return false;
  // Must not be older than the floor the range names.
  if (got[1] < want[1]) return false;
  if (got[1] === want[1] && got[2] < want[2]) return false;
  return true;
}

/** GET + parse JSON, returning null on any failure (timeout, non-200, bad body). */
async function fetchJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), NETWORK_TIMEOUT_MS);
  try {
    // 'connection: close' matters on Windows: a lingering keep-alive socket is
    // still closing when we exit, which trips a libuv assertion inside npm's
    // wrapper (npm then reports 127 even though this script exited 0).
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { accept: 'application/json', connection: 'close' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Expo SDK major actually installed (e.g. 57), from the lockfile. */
function detectExpoSdkMajor(lock) {
  if (process.env.GFP_SDK_MAJOR) return process.env.GFP_SDK_MAJOR;
  const meta = (lock.packages || {})['node_modules/expo'];
  if (!meta || !meta.version) return null;
  return meta.version.split('.')[0];
}

/**
 * Every package whose version the installed Expo SDK dictates, as
 * name -> { range, source }. Combines the native-modules list (RN libraries,
 * expo-* packages) with the react / react-native targets from versions/latest.
 */
async function getSdkPins(sdkMajor) {
  if (!sdkMajor) return null;
  const [nativeModules, versions] = await Promise.all([
    fetchJson(expoNativeModulesUrl(sdkMajor)),
    fetchJson(EXPO_VERSIONS_URL),
  ]);
  if (!nativeModules && !versions) return null;

  const pins = new Map();
  const list = (nativeModules && (nativeModules.data || nativeModules)) || [];
  if (Array.isArray(list)) {
    for (const mod of list) {
      if (mod && mod.npmPackage && mod.versionRange) {
        pins.set(mod.npmPackage, { range: mod.versionRange, source: 'SDK ' + sdkMajor + ' native-modules' });
      }
    }
  }
  const sdk = versions && versions.data && versions.data.sdkVersions
    && versions.data.sdkVersions[sdkMajor + '.0.0'];
  if (sdk && sdk.facebookReactVersion) {
    for (const n of ['react', 'react-dom']) {
      pins.set(n, { range: sdk.facebookReactVersion, source: 'SDK ' + sdkMajor + ' facebookReactVersion' });
    }
  }
  if (sdk && sdk.facebookReactNativeVersion) {
    pins.set('react-native', {
      range: sdk.facebookReactNativeVersion,
      source: 'SDK ' + sdkMajor + ' facebookReactNativeVersion',
    });
  }
  return pins.size > 0 ? pins : null;
}

/**
 * Packages whose major tracks something in THIS repo rather than npm's newest:
 *   @types/node        -> the Node major we declare and run in CI
 *   @types/react(-dom) -> the React minor pinned in the tree
 * Bumping either to npm `latest` types the code against a runtime/library that
 * is not the one actually in use.
 */
function getRuntimePins(lock, rootPkg) {
  const pins = new Map();

  const enginesNode = (rootPkg.engines && rootPkg.engines.node) || '';
  const nodeMajor = (/(\d+)/.exec(enginesNode) || [])[1];
  if (nodeMajor) {
    pins.set('@types/node', {
      range: '^' + nodeMajor + '.0.0',
      source: 'Node ' + nodeMajor + ' (engines.node "' + enginesNode + '")',
    });
  }

  const reactVersion = ((lock.packages || {})['node_modules/react'] || {}).version;
  if (reactVersion) {
    const parts = reactVersion.split('.');
    for (const n of ['@types/react', '@types/react-dom']) {
      pins.set(n, { range: '~' + parts[0] + '.' + parts[1] + '.0', source: 'react ' + reactVersion + ' in tree' });
    }
  }
  return pins;
}

/**
 * Does a DECLARED manifest range conflict with the SDK's target?
 *
 * A manifest floor at or below the SDK target in the same tilde family is
 * normal and fine: apps/mobile pinning "~57.0.10" while the SDK now targets
 * "~57.0.19" still resolves to 57.0.19. What matters is a manifest demanding
 * a version the SDK does NOT target — a different major/minor, or a floor
 * ABOVE the SDK target. That last case is exactly the PR #64 bug, where the
 * manifests declared react 19.3.0 while SDK 57 targets 19.2.3.
 */
function declaredConflicts(declRange, sdkRange) {
  const decl = parseVersion(String(declRange).replace(/^[~^]/, ''));
  const sdk = parseVersion(String(sdkRange).replace(/^[~^]/, ''));
  if (!decl || !sdk) return false; // cannot judge -> never a false failure

  // Expo names a single exact version (react 19.2.3, react-native 0.86.3).
  // The manifest conflicts only if its range cannot resolve to that version.
  if (!/^[~^]/.test(String(sdkRange))) {
    return satisfiesSimple(String(sdkRange), declRange) === false;
  }

  // Expo names a family (~4.26.0, ~57.0.19). Any member of that family is
  // fine, so compare families and ignore the patch: a manifest pinning
  // "~57.0.10" still resolves to 57.0.19, and "4.26.2" is inside "~4.26.0".
  if (decl[0] !== sdk[0]) return true;
  if (String(sdkRange)[0] === '~' && decl[1] !== sdk[1]) return true;
  return false;
}

/** Declared dependency pins across the root manifest and every workspace. */
function readDeclaredPins() {
  const manifests = [path.join(repoRoot, 'package.json')];
  for (const group of ['apps', 'packages']) {
    const dir = path.join(repoRoot, group);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      const p = path.join(dir, entry, 'package.json');
      if (fs.existsSync(p)) manifests.push(p);
    }
  }
  const declared = new Map(); // name -> [{ where, range }]
  for (const file of manifests) {
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    const where = path.relative(repoRoot, file).split(path.sep).join('/');
    for (const bucket of [pkg.dependencies, pkg.devDependencies, pkg.overrides]) {
      if (!bucket) continue;
      for (const [name, range] of Object.entries(bucket)) {
        if (typeof range !== 'string') continue;
        if (!declared.has(name)) declared.set(name, []);
        declared.get(name).push({ where, range });
      }
    }
  }
  return declared;
}

/**
 * Compare what this repo DECLARES against the pin map, resolving each
 * declaration the way npm does: a workspace's own nested copy first, then the
 * hoisted root copy.
 *
 * Only declared packages are judged. A transitively installed copy is not a
 * pin this repo owns — the root has a hoisted @types/react 19.3.0 pulled in by
 * tooling while every workspace resolves its own 19.2.18, and failing CI over
 * that would be noise. This mirrors `expo install --check`, which also only
 * looks at declared dependencies.
 */
function auditPins(pinMap, declared, lockPkgs) {
  const rows = [];
  const sorted = [...pinMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, pin] of sorted) {
    const decls = declared.get(name) || [];
    if (decls.length === 0) continue; // transitive only — not ours to pin

    const sites = [];
    for (const d of decls) {
      const prefix = d.where === 'package.json'
        ? ''
        : d.where.replace(/\/package\.json$/, '') + '/';
      const meta = lockPkgs[prefix + 'node_modules/' + name] || lockPkgs['node_modules/' + name];
      sites.push({ where: d.where, range: d.range, version: meta && meta.version });
    }

    const badInstalls = sites.filter(
      (site) => site.version && satisfiesSimple(site.version, pin.range) === false,
    );
    const badDecls = decls.filter(
      (d) => /^[~^]?\d+\.\d+\.\d+/.test(d.range) && declaredConflicts(d.range, pin.range),
    );
    const resolved = [...new Set(sites.map((site) => site.version).filter(Boolean))];

    rows.push({
      name,
      installed: resolved.join(', ') || '(not installed)',
      range: pin.range,
      source: pin.source,
      okInstalled: badInstalls.length > 0 ? false : (resolved.length > 0 ? true : null),
      badInstalls,
      badDecls,
      diverged: badInstalls.length > 0 || badDecls.length > 0,
    });
  }
  return rows;
}

function getOutdated() {
  // Run through a shell so Windows resolves the `npm` wrapper (.cmd) safely.
  // npm outdated exits 1 when anything is outdated, so capture rather than throw.
  // Run from root without workspace flags — that already traverses every workspace.
  let raw = '';
  try {
    raw = execSync('npm outdated --json', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (err) {
    raw = err.stdout ? err.stdout.toString() : '';
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Registry publish timestamps for every version of a package.
 * Returns a Map<version, Date>, or null if the lookup failed. The `time`
 * object also carries `created`/`modified` keys, which we drop.
 */
function getPublishTimes(name) {
  // Defense-in-depth: `name` comes from `npm outdated` (registry data), not user
  // input, but it is interpolated into a shell command below. Validate it against
  // the npm package-name grammar so nothing with shell metacharacters can ever
  // reach the shell; anything unexpected is treated as "no data" (held back).
  if (!/^@?[a-z0-9._/-]+$/i.test(name)) return null;
  let raw = '';
  try {
    // Same shell-through pattern as getOutdated() so Windows resolves npm.cmd.
    raw = execSync('npm view ' + name + ' time --json', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (err) {
    raw = err.stdout ? err.stdout.toString() : '';
  }
  if (!raw.trim()) return null;
  let obj;
  try { obj = JSON.parse(raw); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;
  const map = new Map();
  for (const [ver, iso] of Object.entries(obj)) {
    if (ver === 'created' || ver === 'modified') continue;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) map.set(ver, d);
  }
  return map;
}

/** Human age: "9h", "3d". */
function fmtAge(hours) {
  return hours < 48 ? Math.floor(hours) + 'h' : Math.floor(hours / 24) + 'd';
}

/**
 * Classify one install-target version against the cooldown.
 *   mature  — true if it's been published for at least COOLDOWN_HOURS
 *   label   — display string with age / "held back" / "unknown" annotation
 * An unknown publish date is treated as NOT mature (fail closed): a version we
 * can't date doesn't get to skip the cooldown.
 */
function describeTarget(ver, times) {
  const when = times && times.get(ver);
  if (!when) return { mature: false, label: ver + ' (publish date unknown — held back)' };
  const hours = (Date.now() - when.getTime()) / 36e5;
  if (hours >= COOLDOWN_HOURS) return { mature: true, label: ver + ' (' + fmtAge(hours) + ' old)' };
  const eta = Math.ceil(COOLDOWN_HOURS - hours);
  return { mature: false, label: ver + ' (' + fmtAge(hours) + ' old — held back, eligible in ' + eta + 'h)' };
}

async function main() {
  const lock = readLockfile();
  const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const versions = collectVersions(lock);
  const declared = readDeclaredPins();
  const mismatches = checkMismatches(versions);

  const sdkMajor = detectExpoSdkMajor(lock);
  const sdkPins = await getSdkPins(sdkMajor);
  const sdkRows = sdkPins ? auditPins(sdkPins, declared, lock.packages || {}) : [];
  const runtimeRows = auditPins(getRuntimePins(lock, rootPkg), declared, lock.packages || {});

  // Anything the SDK or the runtime dictates is NOT an ordinary update.
  const managed = new Set([].concat(sdkRows, runtimeRows).map((r) => r.name));
  const divergences = [].concat(sdkRows, runtimeRows).filter((r) => r.diverged);

  // --assert-pins is a pure lockfile+manifest audit, so skip the registry scan:
  // it makes the CI gate fast and independent of npm being reachable. The full
  // report (and --json, which the weekly routine consumes) still scans.
  const scanRegistry = !ASSERT_PINS || JSON_OUT;
  const outdated = scanRegistry ? getOutdated() : {};
  const actionable = [];
  const suppressed = [];
  const heldBack = [];

  for (const name of Object.keys(outdated).sort()) {
    const info = Array.isArray(outdated[name]) ? outdated[name][0] : outdated[name];
    if (managed.has(name)) { suppressed.push(name); continue; }
    const times = getPublishTimes(name);
    const wantedT = info.wanted ? describeTarget(info.wanted, times) : null;
    const latestT = (info.latest && info.latest !== info.wanted)
      ? describeTarget(info.latest, times) : null;
    const gating = latestT || wantedT;
    const isHeld = !!(gating && !gating.mature);
    if (isHeld) heldBack.push(name);
    actionable.push({
      name,
      current: info.current || null,
      wanted: info.wanted || null,
      latest: info.latest || null,
      dependent: info.dependent || null,
      heldBack: isHeld,
      label: [wantedT ? 'wanted ' + wantedT.label : null, latestT ? 'latest ' + latestT.label : null]
        .filter(Boolean).join(', '),
    });
  }

  const failed = mismatches.length > 0 || (ASSERT_PINS && divergences.length > 0);

  if (JSON_OUT) {
    console.log(JSON.stringify({
      sdkMajor,
      sdkDataAvailable: !!sdkPins,
      mismatches,
      sdkManaged: sdkRows,
      runtimeTracked: runtimeRows,
      divergences,
      actionable,
      heldBack,
      cooldownHours: COOLDOWN_HOURS,
      ok: !failed,
    }, null, 2));
    process.exitCode = failed ? 1 : 0;
    return;
  }

  console.log('\n=== Dependency health check ===\n');

  // 1. Version mismatches (critical)
  if (mismatches.length === 0) {
    console.log('✓ Version consistency: all watchlist packages resolve to a single version.');
  } else {
    console.log('✗ Version MISMATCH — these must be a single version across the monorepo:');
    for (const m of mismatches) {
      console.log('    ' + m.name + ': ' + m.versions.join('  vs  '));
    }
    console.log('  Fix: align the pins and add a root "overrides" entry, then regenerate package-lock.json.');
  }

  // 2. SDK-managed pins.
  console.log('');
  if (!sdkMajor) {
    console.log('• SDK-managed pins: expo not found in the lockfile — skipped.');
  } else if (!sdkPins) {
    console.log('⚠ SDK-managed pins: could not reach api.expo.dev — cannot verify Expo SDK ' + sdkMajor + ' targets.');
    console.log('  Treat every react/react-native/expo-* "update" below as UNVERIFIED until this succeeds.');
  } else {
    console.log('• SDK-managed by Expo SDK ' + sdkMajor + ' — npm "latest" does NOT apply to these:');
    for (const r of sdkRows) {
      const mark = r.okInstalled === false ? '✗' : (r.okInstalled === null ? '?' : '✓');
      let note;
      if (r.okInstalled === false) note = '  ← DRIFTED, SDK ' + sdkMajor + ' wants ' + r.range;
      else if (r.okInstalled === null) note = '  (cannot compare against "' + r.range + '")';
      else note = ' (SDK target ' + r.range + ')';
      console.log('    ' + mark + ' ' + r.name + ' ' + r.installed + note);
      for (const d of r.badDecls) {
        console.log('        ✗ ' + d.where + ' declares "' + d.range + '" — outside the SDK target');
      }
    }
  }

  // 3. Runtime-tracked pins.
  console.log('');
  if (runtimeRows.length === 0) {
    console.log('• Runtime-tracked pins: none resolved.');
  } else {
    console.log('• Runtime-tracked — these follow this repo, not npm latest:');
    for (const r of runtimeRows) {
      const mark = r.okInstalled === false ? '✗' : (r.okInstalled === null ? '?' : '✓');
      const note = r.okInstalled === false
        ? '  ← DRIFTED, should match ' + r.range
        : ' (tracks ' + r.source + ')';
      console.log('    ' + mark + ' ' + r.name + ' ' + r.installed + note);
      for (const d of r.badDecls) {
        console.log('        ✗ ' + d.where + ' declares "' + d.range + '" — outside ' + r.range);
      }
    }
  }

  // 4. Genuinely actionable updates.
  console.log('');
  if (!scanRegistry) {
    console.log('• Update scan skipped (--assert-pins audits pins only).');
  } else if (actionable.length === 0) {
    console.log('✓ Outdated packages: none actionable.');
  } else {
    console.log('• ' + actionable.length + ' actionable update(s) (updates younger than '
      + COOLDOWN_HOURS + 'h are held back):');
    for (const a of actionable) {
      const loc = a.dependent ? ' (' + a.dependent + ')' : '';
      console.log('    ' + a.name + ': ' + (a.current || '—') + ' → ' + a.label + loc);
    }
    if (heldBack.length > 0) {
      console.log('\n  ⏳ ' + heldBack.length + ' update(s) held back by the ' + COOLDOWN_HOURS
        + 'h cooldown — do NOT install yet: ' + heldBack.join(', ') + '.');
    } else {
      console.log('\n  ✓ All actionable updates have cleared the ' + COOLDOWN_HOURS + 'h cooldown.');
    }
  }
  if (suppressed.length > 0) {
    console.log('\n  ℹ ' + suppressed.length + ' package(s) hidden from the list above because their '
      + 'version is dictated by the SDK or this repo runtime, not by npm:');
    console.log('      ' + suppressed.join(', '));
    console.log('    npm reports newer versions for these. Installing one desyncs the app. Do not.');
  }

  // 5. Pin gate.
  console.log('');
  if (divergences.length === 0) {
    if (sdkPins) console.log('✓ Pin integrity: every SDK-managed and runtime-tracked package matches its target.');
  } else {
    console.log('✗ Pin integrity: ' + divergences.length + ' package(s) have drifted from their target:');
    for (const d of divergences) {
      // Say which of the two things actually drifted: the installed copy, or a
      // manifest declaring something the SDK does not target (the PR #64 shape).
      const why = [];
      if (d.badInstalls.length > 0) {
        why.push('installed ' + [...new Set(d.badInstalls.map((b) => b.version))].join(', '));
      }
      for (const b of d.badDecls) why.push(b.where + ' declares "' + b.range + '"');
      console.log('    ' + d.name + ' — ' + d.source + ' wants ' + d.range + '; ' + why.join('; '));
    }
    console.log(ASSERT_PINS
      ? '  Failing because --assert-pins was passed.'
      : '  Re-run with --assert-pins to make this a hard failure.');
  }

  console.log('');
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error('check-updates failed:', err.message);
  process.exitCode = 2;
});
