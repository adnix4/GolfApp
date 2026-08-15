#!/usr/bin/env node
/**
 * Production dependency audit gate for the Golf Fundraiser Pro monorepo.
 *
 * Wraps `npm audit --omit=dev` and decides whether the build should fail.
 * Plain `--audit-level=high` can't express "this one high is understood and
 * accepted" — it's all or nothing, and the only other lever (dropping the gate
 * to `critical`) would have silently let through the js-yaml and nanoid highs
 * that the 2026-08-14 dependency update fixed. So the threshold stays at high
 * and individual advisories are accepted by id, in writing, with an expiry.
 *
 * Fails on any of:
 *   1. A high/critical advisory that is NOT in .audit-allowlist.json.
 *   2. An allowlist entry whose reviewBy date has passed. An accepted risk is a
 *      decision with a shelf life, not a permanent exemption — when the date
 *      comes round the build stops until someone re-reads it.
 *   3. An allowlist entry that no longer matches any advisory. Dead entries
 *      silently widen the gate, so they have to be deleted deliberately.
 *
 * ON THE SHAPE OF `npm audit --json`: only some entries carry a real advisory.
 * A vulnerability's `via` array holds either advisory OBJECTS (the root finding)
 * or STRINGS naming the dependency that dragged it in. The current tree reports
 * ten "high" packages but only one root advisory pair — expo, react-native,
 * metro and friends are all just propagation. We gate on the root advisories, so
 * the allowlist stays short and names the actual defect rather than every
 * package that transitively contains it.
 *
 * Run via:
 *     npm run audit:prod
 *
 * Exit codes:
 *   0  clean (no high/critical, or every one is allowlisted and in date)
 *   1  the gate failed — see the printed reason
 *   2  the check itself failed to run
 */
'use strict';

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const ALLOWLIST_PATH = path.join(repoRoot, '.audit-allowlist.json');

// Severities that block a merge. Anything below this is reported by the
// informational `npm audit` step in CI but never fails the build.
const BLOCKING = new Set(['high', 'critical']);

/**
 * `npm audit --json` exits non-zero whenever it finds anything, so a thrown
 * error is the normal path — the report is still on stdout. Only a genuinely
 * empty/unparseable stdout means the audit itself failed.
 */
function runAudit() {
  let raw = '';
  try {
    // Run through a shell so Windows resolves the `npm` wrapper (.cmd) safely,
    // matching scripts/check-updates.js.
    raw = execSync('npm audit --omit=dev --json', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    raw = err.stdout ? err.stdout.toString() : '';
  }
  if (!raw.trim()) {
    throw new Error('npm audit produced no output — could not assess the dependency tree.');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('npm audit output was not valid JSON — could not assess the dependency tree.');
  }
}

/** GHSA id out of an advisory URL, e.g. .../advisories/GHSA-xxxx -> GHSA-xxxx. */
function ghsaFromUrl(url) {
  const m = /\/(GHSA-[a-z0-9-]+)\s*$/i.exec(url || '');
  return m ? m[1] : null;
}

/**
 * Every distinct root advisory in the report, keyed by its numeric npm source
 * id. Walks all `via` arrays and keeps only the objects; the string entries are
 * propagation and resolve back to one of these.
 */
function collectAdvisories(report) {
  const found = new Map();
  for (const vuln of Object.values(report.vulnerabilities || {})) {
    for (const via of vuln.via || []) {
      if (!via || typeof via !== 'object') continue;
      if (!found.has(via.source)) {
        found.set(via.source, {
          source: via.source,
          ghsa: ghsaFromUrl(via.url),
          url: via.url,
          name: via.name,
          severity: via.severity,
          title: via.title,
          carriers: new Set(),
        });
      }
    }
  }
  // Record which top-level package names surface each advisory, so a failure
  // message can point at something actionable.
  for (const [pkgName, vuln] of Object.entries(report.vulnerabilities || {})) {
    for (const via of vuln.via || []) {
      if (via && typeof via === 'object' && found.has(via.source)) {
        found.get(via.source).carriers.add(pkgName);
      }
    }
  }
  return [...found.values()];
}

function readAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) return [];
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`.audit-allowlist.json is not valid JSON: ${err.message}`);
  }
  const entries = Array.isArray(parsed.allow) ? parsed.allow : [];
  entries.forEach((e, i) => {
    for (const field of ['advisory', 'package', 'reason', 'reviewBy']) {
      if (!e[field] || typeof e[field] !== 'string') {
        throw new Error(`.audit-allowlist.json entry ${i} is missing a "${field}" string.`);
      }
    }
    if (Number.isNaN(Date.parse(e.reviewBy))) {
      throw new Error(`.audit-allowlist.json entry ${i} has an unparseable reviewBy: ${e.reviewBy}`);
    }
  });
  return entries;
}

/**
 * An entry covers an advisory when the id matches AND the package name matches.
 * The name check stops an entry from silently widening to a different finding if
 * an id is ever reused or mistyped.
 */
function covers(entry, advisory) {
  const idMatch = entry.advisory === advisory.ghsa || entry.advisory === String(advisory.source);
  return idMatch && entry.package === advisory.name;
}

function main() {
  const allowlist = readAllowlist();
  const report = runAudit();
  const advisories = collectAdvisories(report);
  const blocking = advisories.filter((a) => BLOCKING.has(a.severity));

  const counts = (report.metadata && report.metadata.vulnerabilities) || {};
  console.log('\n=== Production dependency audit (high+ blocks) ===\n');
  console.log(`Scanned production deps: ${counts.total || 0} advisory instance(s) `
    + `— ${counts.critical || 0} critical, ${counts.high || 0} high, ${counts.moderate || 0} moderate.`);
  console.log(`Distinct root advisories: ${advisories.length} (${blocking.length} at high or above).\n`);

  const unallowed = [];
  const accepted = [];
  const expired = [];
  const usedEntries = new Set();
  const now = Date.now();

  for (const adv of blocking) {
    const entry = allowlist.find((e) => covers(e, adv));
    if (!entry) {
      unallowed.push(adv);
      continue;
    }
    usedEntries.add(entry);
    if (Date.parse(entry.reviewBy) < now) expired.push({ entry, adv });
    else accepted.push({ entry, adv });
  }

  const stale = allowlist.filter((e) => !usedEntries.has(e));

  if (accepted.length > 0) {
    console.log('Accepted (allowlisted, still in date):');
    for (const { entry, adv } of accepted) {
      console.log(`  • ${adv.severity.toUpperCase()} ${entry.advisory} — ${adv.name}`);
      console.log(`      ${adv.title}`);
      console.log(`      via: ${[...adv.carriers].sort().join(', ')}`);
      console.log(`      why: ${entry.reason}`);
      console.log(`      review by ${entry.reviewBy}`);
    }
    console.log('');
  }

  let failed = false;

  if (unallowed.length > 0) {
    failed = true;
    console.log(`✗ ${unallowed.length} high/critical advisory(ies) are NOT allowlisted:`);
    for (const adv of unallowed) {
      console.log(`  • ${adv.severity.toUpperCase()} ${adv.ghsa || adv.source} — ${adv.name}`);
      console.log(`      ${adv.title}`);
      console.log(`      ${adv.url}`);
      console.log(`      via: ${[...adv.carriers].sort().join(', ')}`);
    }
    console.log('\n  Fix the dependency if a patched version exists. If it genuinely cannot ship '
      + '\n  a fix and the code path is not reachable in production, add an entry to '
      + '\n  .audit-allowlist.json with a reason and a reviewBy date.\n');
  }

  if (expired.length > 0) {
    failed = true;
    console.log(`✗ ${expired.length} allowlist entry(ies) are past their review date:`);
    for (const { entry, adv } of expired) {
      console.log(`  • ${entry.advisory} (${entry.package}) — review was due ${entry.reviewBy}`);
      console.log(`      still present via: ${[...adv.carriers].sort().join(', ')}`);
    }
    console.log('\n  Re-check whether a fix has shipped. If the risk still stands, extend reviewBy '
      + '\n  and say what changed. Do not extend it without re-reading the advisory.\n');
  }

  if (stale.length > 0) {
    failed = true;
    console.log(`✗ ${stale.length} allowlist entry(ies) no longer match anything:`);
    for (const entry of stale) {
      console.log(`  • ${entry.advisory} (${entry.package})`);
    }
    console.log('\n  The advisory is gone — most likely a dependency upgrade resolved it. '
      + '\n  Delete the entry so the gate narrows back.\n');
  }

  if (!failed) {
    console.log(blocking.length === 0
      ? '✓ No high or critical advisories in production dependencies.'
      : '✓ Every high/critical advisory is allowlisted, in date, and accounted for.');
    console.log('');
  }

  process.exit(failed ? 1 : 0);
}

try {
  main();
} catch (err) {
  console.error('audit-prod failed:', err.message);
  process.exit(2);
}
