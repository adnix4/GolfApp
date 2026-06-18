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
 *   2. Outdated packages   — newer versions available on the registry.
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

  // 2. Outdated packages (informational)
  const names = Object.keys(outdated);
  console.log('');
  if (names.length === 0) {
    console.log('✓ Outdated packages: none.');
  } else {
    console.log(`• ${names.length} package(s) have newer versions available:`);
    for (const name of names.sort()) {
      const info = Array.isArray(outdated[name]) ? outdated[name][0] : outdated[name];
      const loc = info.dependent ? ` (${info.dependent})` : '';
      console.log(`    ${name}: ${info.current || '—'} → wanted ${info.wanted}, latest ${info.latest}${loc}`);
    }
    console.log('\n  "wanted" respects your semver ranges; "latest" may include major bumps. Review before applying.');
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
