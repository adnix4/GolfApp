#!/usr/bin/env node
/**
 * NuGet dependency audit gate for the ASP.NET Core API.
 *
 * The npm side has had a gate since 2026-08 (scripts/audit-prod.js). The C#
 * side had none: CI built and tested the API but nothing ever looked at its
 * packages, and on 2026-11-11 they were still at their project-creation
 * versions with high advisories in System.Text.Json, Npgsql and
 * Microsoft.Extensions.Caching.Memory. This is the same gate, for NuGet.
 *
 * Wraps `dotnet list package --vulnerable --include-transitive` for the API
 * project only. apps/api-tests is not audited: it never ships, and every
 * runtime package it resolves comes from its reference to the API, so it would
 * only repeat the API's findings.
 *
 * Same three failure rules as audit-prod.js, same allowlist entry shape, but
 * its own file (.audit-allowlist.nuget.json) so neither gate reports the
 * other's entries as stale:
 *   1. A high/critical advisory that is NOT allowlisted.
 *   2. An allowlist entry whose reviewBy date has passed.
 *   3. An allowlist entry that no longer matches any advisory.
 * Moderate/low advisories are printed but never fail the build.
 *
 * Run via:
 *     npm run audit:nuget      (needs the .NET SDK; restores the API itself)
 *
 * Exit codes:
 *   0  clean (no high/critical, or every one is allowlisted and in date)
 *   1  the gate failed — see the printed reason
 *   2  the check itself failed to run (no SDK, restore failed, no vuln data)
 */
'use strict';

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const PROJECT = 'apps/api/WebAPI.csproj';
const ALLOWLIST_PATH = path.join(repoRoot, '.audit-allowlist.nuget.json');
const BLOCKING = new Set(['high', 'critical']);

function sh(cmd) {
  return execSync(cmd, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  });
}

function runAudit() {
  // `dotnet list package` reads the assets file restore writes; without it the
  // report comes back with a "problems" entry instead of packages.
  try {
    sh(`dotnet restore ${PROJECT} --verbosity quiet`);
  } catch (err) {
    throw new Error(`dotnet restore failed:\n${(err.stdout || '') + (err.stderr || '')}`, { cause: err });
  }

  let raw;
  try {
    raw = sh(`dotnet list ${PROJECT} package --vulnerable --include-transitive --format json`);
  } catch (err) {
    throw new Error(`dotnet list package failed:\n${(err.stdout || '') + (err.stderr || '')}`, { cause: err });
  }
  const start = raw.indexOf('{');
  if (start < 0) throw new Error('dotnet list package produced no JSON report.');
  let report;
  try {
    report = JSON.parse(raw.slice(start));
  } catch (err) {
    throw new Error('dotnet list package output was not valid JSON.', { cause: err });
  }
  // A missing vulnerability source, or an unrestored project, shows up here
  // rather than as a non-zero exit. Fail closed: no data is not a clean bill.
  if (Array.isArray(report.problems) && report.problems.length > 0) {
    const msgs = report.problems.map((p) => `  • ${p.text || JSON.stringify(p)}`).join('\n');
    throw new Error(`dotnet list package reported problems:\n${msgs}`);
  }
  return report;
}

function ghsaFromUrl(url) {
  const m = /\/(GHSA-[a-z0-9-]+)\s*$/i.exec(url || '');
  return m ? m[1] : null;
}

/** One record per (package, advisory), whichever framework/section it came from. */
function collectAdvisories(report) {
  const found = new Map();
  for (const project of report.projects || []) {
    for (const fw of project.frameworks || []) {
      const sections = [
        ['direct', fw.topLevelPackages || []],
        ['transitive', fw.transitivePackages || []],
      ];
      for (const [kind, pkgs] of sections) {
        for (const pkg of pkgs) {
          for (const v of pkg.vulnerabilities || []) {
            const ghsa = ghsaFromUrl(v.advisoryurl);
            const key = `${pkg.id.toLowerCase()}|${ghsa || v.advisoryurl}`;
            if (!found.has(key)) {
              found.set(key, {
                ghsa,
                url: v.advisoryurl,
                name: pkg.id,
                version: pkg.resolvedVersion,
                severity: String(v.severity || '').toLowerCase(),
                kind,
              });
            }
          }
        }
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
    throw new Error(`.audit-allowlist.nuget.json is not valid JSON: ${err.message}`, { cause: err });
  }
  const entries = Array.isArray(parsed.allow) ? parsed.allow : [];
  entries.forEach((e, i) => {
    for (const field of ['advisory', 'package', 'reason', 'reviewBy']) {
      if (!e[field] || typeof e[field] !== 'string') {
        throw new Error(`.audit-allowlist.nuget.json entry ${i} is missing a "${field}" string.`);
      }
    }
    if (Number.isNaN(Date.parse(e.reviewBy))) {
      throw new Error(`.audit-allowlist.nuget.json entry ${i} has an unparseable reviewBy: ${e.reviewBy}`);
    }
  });
  return entries;
}

/** Id AND package must match — NuGet ids are case-insensitive. */
function covers(entry, adv) {
  return entry.advisory === adv.ghsa && entry.package.toLowerCase() === adv.name.toLowerCase();
}

function line(adv) {
  return `${adv.severity.toUpperCase()} ${adv.ghsa || adv.url} — ${adv.name} ${adv.version} (${adv.kind})`;
}

function main() {
  const allowlist = readAllowlist();
  const report = runAudit();
  const advisories = collectAdvisories(report);
  const blocking = advisories.filter((a) => BLOCKING.has(a.severity));
  const minor = advisories.filter((a) => !BLOCKING.has(a.severity));

  console.log('\n=== NuGet dependency audit — apps/api (high+ blocks) ===\n');
  console.log(`Advisories: ${advisories.length} (${blocking.length} at high or above).\n`);

  const unallowed = [];
  const accepted = [];
  const expired = [];
  const used = new Set();
  const now = Date.now();

  for (const adv of blocking) {
    const entry = allowlist.find((e) => covers(e, adv));
    if (!entry) { unallowed.push(adv); continue; }
    used.add(entry);
    (Date.parse(entry.reviewBy) < now ? expired : accepted).push({ entry, adv });
  }
  const stale = allowlist.filter((e) => !used.has(e));

  if (minor.length > 0) {
    console.log('Below the gate (reported, never blocks):');
    for (const adv of minor) console.log(`  • ${line(adv)}`);
    console.log('');
  }

  if (accepted.length > 0) {
    console.log('Accepted (allowlisted, still in date):');
    for (const { entry, adv } of accepted) {
      console.log(`  • ${line(adv)}`);
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
      console.log(`  • ${line(adv)}`);
      console.log(`      ${adv.url}`);
    }
    console.log('\n  Upgrade the package if a patched version exists (for a transitive one, add a'
      + '\n  direct PackageReference at the patched version). Only if it genuinely cannot'
      + '\n  be fixed yet, add an entry to .audit-allowlist.nuget.json with a reason and a'
      + '\n  reviewBy date.\n');
  }

  if (expired.length > 0) {
    failed = true;
    console.log(`✗ ${expired.length} allowlist entry(ies) are past their review date:`);
    for (const { entry, adv } of expired) {
      console.log(`  • ${entry.advisory} (${entry.package}) — review was due ${entry.reviewBy}; still at ${adv.version}`);
    }
    console.log('\n  Re-check whether a fix has shipped. If the risk still stands, extend reviewBy'
      + '\n  and say what changed. Do not extend it without re-reading the advisory.\n');
  }

  if (stale.length > 0) {
    failed = true;
    console.log(`✗ ${stale.length} allowlist entry(ies) no longer match anything:`);
    for (const entry of stale) console.log(`  • ${entry.advisory} (${entry.package})`);
    console.log('\n  The advisory is gone — most likely an upgrade resolved it. Delete the entry'
      + '\n  so the gate narrows back.\n');
  }

  if (!failed) {
    console.log(blocking.length === 0
      ? '✓ No high or critical advisories in API packages.'
      : '✓ Every high/critical advisory is allowlisted, in date, and accounted for.');
    console.log('');
  }

  process.exit(failed ? 1 : 0);
}

try {
  main();
} catch (err) {
  console.error('audit-nuget failed:', err.message);
  process.exit(2);
}
