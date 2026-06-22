#!/usr/bin/env node
/**
 * Dependency health check for the Golf Fundraiser Pro monorepo.
 *
 * Reports two things and exits non-zero if anything needs attention:
 *   1. Version mismatches  — a "watchlist" framework package (react,
 *      react-native, etc.) resolving to more than one version across the
 *      workspace. This is the class of bug that broke the web bundle
 *      (react 19.2.0 vs react-dom 19.0.0) and the mobile native tree
 *      (react-native 0.79.2 vs 0.83.6).
 *   2. Outdated packages   — newer versions available on the registry. Any
 *      update whose target version was published less than COOLDOWN_HOURS
 *      (default 72h) ago is "held back" — flagged as not-yet-installable so a
 *      freshly published (and possibly compromised) version is never pulled in
 *      immediately. The window is a supply-chain safety cooldown.
 *
 * Report-only: it never touches git or node_modules. Run via:
 *     npm run check-updates
 *
 * Exit codes:
 *   0  clean (no mismatches; outdated packages are informational)
 *   1  one or more watchlist version mismatches found
 *   2  the check itself failed to run
 */
'use strict';

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

// Packages that MUST resolve to a single version across the monorepo.
// Multiple copies of these cause runtime crashes, not just bloat.
const WATCHLIST = [
  'react',
  'react-dom',
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
    raw = execSync(`npm view ${name} time --json`, {
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
  return hours < 48 ? `${Math.floor(hours)}h` : `${Math.floor(hours / 24)}d`;
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
  if (!when) return { mature: false, label: `${ver} (publish date unknown — held back)` };
  const hours = (Date.now() - when.getTime()) / 36e5;
  if (hours >= COOLDOWN_HOURS) return { mature: true, label: `${ver} (${fmtAge(hours)} old)` };
  const eta = Math.ceil(COOLDOWN_HOURS - hours);
  return { mature: false, label: `${ver} (${fmtAge(hours)} old — held back, eligible in ${eta}h)` };
}

function main() {
  const lock = readLockfile();
  const versions = collectVersions(lock);
  const mismatches = checkMismatches(versions);
  const outdated = getOutdated();

  console.log('\n=== Dependency health check ===\n');

  // 1. Version mismatches (critical)
  if (mismatches.length === 0) {
    console.log('✓ Version consistency: all watchlist packages resolve to a single version.');
  } else {
    console.log('✗ Version MISMATCH — these must be a single version across the monorepo:');
    for (const m of mismatches) {
      console.log(`    ${m.name}: ${m.versions.join('  vs  ')}`);
    }
    console.log('  Fix: align the pins and add a root "overrides" entry, then regenerate package-lock.json.');
  }

  // 2. Outdated packages (informational), gated by the install cooldown.
  const names = Object.keys(outdated);
  console.log('');
  if (names.length === 0) {
    console.log('✓ Outdated packages: none.');
  } else {
    console.log(`• ${names.length} package(s) have newer versions available `
      + `(updates younger than ${COOLDOWN_HOURS}h are held back):`);
    const heldBack = [];
    for (const name of names.sort()) {
      const info = Array.isArray(outdated[name]) ? outdated[name][0] : outdated[name];
      const loc = info.dependent ? ` (${info.dependent})` : '';
      const times = getPublishTimes(name);

      const wantedT = info.wanted ? describeTarget(info.wanted, times) : null;
      // Only describe `latest` separately when it differs from `wanted`.
      const latestT = (info.latest && info.latest !== info.wanted)
        ? describeTarget(info.latest, times) : null;

      // A package is "held back" when the newest version you'd install (latest,
      // else wanted) hasn't cleared the cooldown yet.
      const gating = latestT ?? wantedT;
      if (gating && !gating.mature) heldBack.push(name);

      const parts = [];
      if (wantedT) parts.push(`wanted ${wantedT.label}`);
      if (latestT) parts.push(`latest ${latestT.label}`);
      console.log(`    ${name}: ${info.current || '—'} → ${parts.join(', ')}${loc}`);
    }
    if (heldBack.length > 0) {
      console.log(`\n  ⏳ ${heldBack.length} update(s) held back by the ${COOLDOWN_HOURS}h `
        + `cooldown — do NOT install yet: ${heldBack.join(', ')}.`);
    } else {
      console.log(`\n  ✓ All available updates have cleared the ${COOLDOWN_HOURS}h cooldown.`);
    }
    console.log('\n  "wanted" respects your semver ranges; "latest" may include major bumps. '
      + 'Review before applying. Held-back updates are too recently published to install safely.');
  }

  console.log('');
  process.exit(mismatches.length > 0 ? 1 : 0);
}

try {
  main();
} catch (err) {
  console.error('check-updates failed:', err.message);
  process.exit(2);
}
