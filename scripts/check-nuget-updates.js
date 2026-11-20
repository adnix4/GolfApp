#!/usr/bin/env node
/**
 * NuGet update report for the ASP.NET Core API — the C# twin of
 * scripts/check-updates.js, built for the weekly dependency routine.
 *
 * WHY: until 2026-11-11 the weekly routine was npm-only (its prompt said
 * "apps/api [.NET — ignore for deps]"), so the API's packages sat at their
 * project-creation versions with high advisories. This script tells the
 * routine exactly which NuGet moves it may make, so it never has to reason
 * about versions or hand-edit XML.
 *
 * POLICY (encoded here, not left to the routine):
 *   • Patch updates only (same major.minor) are applied. Minor and major
 *     updates are reported, never applied: ImageSharp 3.1 → 3.2 was a MINOR
 *     and it broke the build by demanding a license key.
 *   • 72h cooldown, same as check-updates.js (UPDATE_COOLDOWN_HOURS overrides):
 *     the target is the NEWEST patch that has been published for at least the
 *     cooldown, so a fresh patch never blocks an older mature one
 *     (scripts/lib/cooldown.js). Unknown or unlisted publish dates fail closed.
 *   • Families move together. Microsoft.AspNetCore.* / EntityFrameworkCore.* /
 *     Extensions.* share one servicing train, and the Npgsql EF provider and
 *     its NetTopologySuite plugin ship as a pair. The family moves to the
 *     highest version past the cooldown for EVERY member; if there is none, the
 *     whole family waits — a half-moved train is how you get NU1605 downgrade
 *     errors. A patch update only ever moves a version up.
 *   • Only exact versions are touched. A floating or ranged PackageReference
 *     is reported and left alone.
 *
 * USAGE
 *   npm run check-updates:nuget                 # human-readable report
 *   npm run check-updates:nuget -- --json       # for the weekly routine
 *   npm run check-updates:nuget -- --apply      # rewrite csproj Version attrs
 *
 * --apply edits only the Version="…" attribute of each PackageReference in
 * `applyPatch`, string-exact, leaving line endings and comments untouched.
 *
 * Exit codes:
 *   0  report produced (or dotnet is not installed — dotnetAvailable:false,
 *      so the routine can skip NuGet without failing the npm half)
 *   2  dotnet ran but its output was unusable, or --apply could not edit a file
 */
'use strict';

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { candidatesBetween, newestMature, familyTarget } = require('./lib/cooldown');

const repoRoot = path.resolve(__dirname, '..');
const PROJECTS = ['apps/api/WebAPI.csproj', 'apps/api-tests/WebAPI.Tests.csproj'];
const COOLDOWN_HOURS = Number(process.env.UPDATE_COOLDOWN_HOURS) || 72;
const NETWORK_TIMEOUT_MS = Number(process.env.GFP_NET_TIMEOUT_MS) || 10000;

const args = new Set(process.argv.slice(2));
const JSON_OUT = args.has('--json');
const APPLY = args.has('--apply');

const FAMILIES = [
  { name: 'Microsoft servicing (AspNetCore / EntityFrameworkCore / Extensions)',
    test: (id) => /^Microsoft\.(AspNetCore|EntityFrameworkCore|Extensions)\./i.test(id) },
  { name: 'Npgsql EF provider',
    test: (id) => /^Npgsql\.EntityFrameworkCore\.PostgreSQL(\.|$)/i.test(id) },
];
const familyOf = (id) => FAMILIES.find((f) => f.test(id)) || null;

function sh(cmd) {
  return execSync(cmd, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  });
}

function dotnetVersion() {
  try {
    return { ok: true, version: sh('dotnet --version').trim() };
  } catch (err) {
    return { ok: false, error: (err.stderr || err.message || 'dotnet not found').toString().split(/\r?\n/)[0].trim() };
  }
}

/** `dotnet list package --outdated` for one project and one mode → Map(id → row). */
function listOutdated(project, mode) {
  const flag = mode === 'patch' ? ' --highest-patch' : mode === 'minor' ? ' --highest-minor' : '';
  let raw;
  try {
    raw = sh(`dotnet list ${project} package --outdated${flag} --format json`);
  } catch (err) {
    throw new Error(`dotnet list package --outdated failed for ${project}:\n${(err.stdout || '') + (err.stderr || '')}`, { cause: err });
  }
  const start = raw.indexOf('{');
  if (start < 0) throw new Error(`dotnet list package produced no JSON for ${project}.`);
  let report;
  try {
    report = JSON.parse(raw.slice(start));
  } catch (err) {
    throw new Error(`dotnet list package output was not valid JSON for ${project}.`, { cause: err });
  }
  if (Array.isArray(report.problems) && report.problems.length > 0) {
    const msgs = report.problems.map((p) => `  • ${p.text || JSON.stringify(p)}`).join('\n');
    throw new Error(`dotnet list package reported problems for ${project}:\n${msgs}`);
  }
  const rows = new Map();
  for (const proj of report.projects || []) {
    for (const fw of proj.frameworks || []) {
      for (const pkg of fw.topLevelPackages || []) rows.set(pkg.id, pkg);
    }
  }
  return rows;
}

function parseVer(v) {
  const m = /^(\d+)\.(\d+)/.exec(v || '');
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
}

const isExact = (v) => /^\d+(\.\d+){1,3}(-[0-9A-Za-z.-]+)?$/.test(v || '');

const publishCache = new Map();
/** Hours since `id@version` was published on nuget.org; null = unknown (fail closed). */
async function publishedHoursAgo(id, version) {
  const key = `${id.toLowerCase()}@${version.toLowerCase()}`;
  if (publishCache.has(key)) return publishCache.get(key);
  let hours = null;
  try {
    const url = `https://api.nuget.org/v3/registration5-gz-semver2/${id.toLowerCase()}/${version.toLowerCase()}.json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) });
    if (res.ok) {
      const body = await res.json();
      const t = Date.parse(body.published);
      // nuget.org stamps UNLISTED packages with 1900-01-01: treat as unknown.
      if (body.listed !== false && !Number.isNaN(t) && new Date(t).getUTCFullYear() > 1900) {
        hours = (Date.now() - t) / 3_600_000;
      }
    }
  } catch {
    hours = null;
  }
  publishCache.set(key, hours);
  return hours;
}

/** Every version of `id` on nuget.org (unlisted ones too; publishedHoursAgo
 *  treats those as unknown, so they never qualify). null if unreachable. */
async function listedVersions(id) {
  try {
    const res = await fetch(`https://api.nuget.org/v3-flatcontainer/${id.toLowerCase()}/index.json`,
      { signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body.versions) ? body.versions : null;
  } catch {
    return null;
  }
}

function fmtAge(hours) {
  if (hours == null) return 'publish date unknown';
  return hours < 48 ? `${Math.floor(hours)}h old` : `${Math.floor(hours / 24)}d old`;
}

async function buildReport() {
  const restore = [];
  for (const p of PROJECTS) {
    try {
      sh(`dotnet restore ${p} --verbosity quiet`);
    } catch (err) {
      restore.push(`${p}: ${((err.stdout || '') + (err.stderr || '')).trim().split('\n')[0]}`);
    }
  }
  if (restore.length) throw new Error(`dotnet restore failed:\n  ${restore.join('\n  ')}`);

  // id → { id, current, projects:Set, patch, minor, latest }
  const pkgs = new Map();
  for (const project of PROJECTS) {
    const modes = { patch: listOutdated(project, 'patch'), minor: listOutdated(project, 'minor'), latest: listOutdated(project, 'latest') };
    for (const [mode, rows] of Object.entries(modes)) {
      for (const [id, row] of rows) {
        const key = id.toLowerCase();
        if (!pkgs.has(key)) {
          pkgs.set(key, { id, current: row.resolvedVersion, requested: row.requestedVersion, projects: new Set() });
        }
        const entry = pkgs.get(key);
        entry.projects.add(project);
        if (row.latestVersion && row.latestVersion !== row.resolvedVersion) entry[mode] = row.latestVersion;
      }
    }
  }

  const candidates = [];
  const minorAvailable = [];
  const majorAvailable = [];
  const notExact = [];

  for (const p of pkgs.values()) {
    const cur = parseVer(p.current);
    if (p.minor) {
      const m = parseVer(p.minor);
      if (m && cur && (m.major !== cur.major || m.minor !== cur.minor)) minorAvailable.push({ id: p.id, current: p.current, version: p.minor });
    }
    if (p.latest) {
      const l = parseVer(p.latest);
      if (l && cur && l.major > cur.major) majorAvailable.push({ id: p.id, current: p.current, version: p.latest });
    }
    if (!p.patch) continue;
    if (!isExact(p.requested)) { notExact.push({ id: p.id, requested: p.requested, version: p.patch }); continue; }
    // The newest patch on this major.minor that has cleared the cooldown — not
    // just the highest patch, which held everything back whenever it was fresh.
    const line = parseVer(p.current);
    const sameLine = (v) => { const x = parseVer(v); return !!x && !!line && x.major === line.major && x.minor === line.minor; };
    const versions = await listedVersions(p.id);
    const between = candidatesBetween(versions ?? [p.patch], p.current, p.patch, sameLine);
    const hoursOf = (v) => publishedHoursAgo(p.id, v);
    const pick = await newestMature(between, hoursOf, COOLDOWN_HOURS);
    candidates.push({
      id: p.id,
      from: p.current,
      to: pick.version ?? p.patch,
      latestPatch: p.patch,
      latestPatchHours: pick.newestHours,
      projects: [...p.projects].sort(),
      hours: pick.version ? pick.hours : pick.newestHours,
      mature: !!pick.version,
      candidates: between,
      hoursOf,
      family: familyOf(p.id)?.name || null,
    });
  }

  // Family rule: the train moves to ONE version every member can take, the
  // highest that has cleared the cooldown for all of them (familyTarget). If
  // there is none, the whole family waits — a split train is NU1605.
  const families = new Map();
  for (const c of candidates) if (c.family) families.set(c.family, [...(families.get(c.family) ?? []), c]);
  for (const [name, members] of families) {
    const target = await familyTarget(members.map((c) => ({
      id: c.id, current: c.from, candidates: c.candidates, matureVersion: c.mature ? c.to : null, hoursOf: c.hoursOf,
    })), COOLDOWN_HOURS);
    for (const c of members) {
      if (!target) {
        if (c.mature) c.blocked = `family "${name}" has no version past the cooldown for every member`;
        continue;
      }
      if (c.to !== target) { c.to = target; c.hours = await c.hoursOf(target); }
      if (c.from === target) c.noop = true;
    }
  }
  await pairSkia(candidates);

  const applyPatch = [];
  const heldBack = [];
  const eta = (hours) => (hours == null ? null : Math.max(0, Math.ceil(COOLDOWN_HOURS - hours)));
  for (const c of candidates.sort((a, b) => a.id.localeCompare(b.id))) {
    if (c.noop) continue;
    if (c.mature && !c.blocked) {
      // Moving to an older patch while a newer one cools down: say so.
      const newerHeldBack = c.to !== c.latestPatch
        ? { version: c.latestPatch, age: fmtAge(c.latestPatchHours), eligibleIn: eta(c.latestPatchHours) }
        : null;
      applyPatch.push({ id: c.id, from: c.from, to: c.to, projects: c.projects, age: fmtAge(c.hours), newerHeldBack });
    } else {
      const hours = c.blocked ? c.hours : c.latestPatchHours;
      heldBack.push({
        id: c.id,
        version: c.blocked ? c.to : c.latestPatch,
        age: fmtAge(hours),
        reason: c.blocked || (hours == null ? 'publish date unknown (fail closed)' : 'no patch past the cooldown yet'),
        eligibleIn: eta(hours),
      });
    }
  }
  // A family member that is mature but waiting inherits the slowest member's ETA.
  for (const h of heldBack) {
    if (h.reason.startsWith('family')) {
      const fam = candidates.find((c) => c.id === h.id).family;
      const etas = heldBack.filter((x) => candidates.find((c) => c.id === x.id).family === fam && x.eligibleIn != null);
      h.eligibleIn = etas.length ? Math.max(...etas.map((x) => x.eligibleIn)) : null;
    }
  }

  const byId = (a, b) => a.id.localeCompare(b.id);
  return { applyPatch, heldBack, minorAvailable: minorAvailable.sort(byId), majorAvailable: majorAvailable.sort(byId), notExact };
}

/** SkiaSharp version a given Svg.Skia release depends on, from its nuspec; null if unknown. */
async function svgSkiaSkiaSharpDep(version) {
  try {
    const url = `https://api.nuget.org/v3-flatcontainer/svg.skia/${version.toLowerCase()}/svg.skia.nuspec`;
    const res = await fetch(url, { signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) });
    if (!res.ok) return null;
    const m = /<dependency\s+id="SkiaSharp"\s+version="\[?\s*([0-9.]+)/i.exec(await res.text());
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * The managed SkiaSharp comes in transitively through Svg.Skia; the Linux native
 * assets are pinned directly (apps/api/Dockerfile relies on them). The two must
 * stay on the same SkiaSharp version, so they move together or not at all, and
 * the native assets only ever move to exactly what Svg.Skia's target asks for.
 */
async function pairSkia(candidates) {
  const svg = candidates.find((c) => c.id.toLowerCase() === 'svg.skia');
  const natives = candidates.filter((c) => /^SkiaSharp\.NativeAssets\./i.test(c.id));
  if (!svg && natives.length === 0) return;

  const svgMoves = svg && svg.mature && !svg.blocked;
  if (!svgMoves) {
    for (const n of natives) n.blocked ||= 'would split from the managed SkiaSharp that Svg.Skia pins; moves only with Svg.Skia';
    return;
  }
  const want = await svgSkiaSkiaSharpDep(svg.to);
  // Svg.Skia may be moving to an older mature patch than its newest; the native
  // assets follow it to exactly the SkiaSharp that release asks for.
  for (const n of natives) {
    if (want && n.to !== want && n.candidates.includes(want)) {
      n.to = want;
      n.hours = await n.hoursOf(want);
      n.mature = n.hours != null && n.hours >= COOLDOWN_HOURS;
    }
  }
  const mismatched = natives.filter((n) => n.to !== want);
  if (!want || mismatched.length > 0) {
    const why = want
      ? `Svg.Skia ${svg.to} needs SkiaSharp ${want}; native assets target ${mismatched.map((n) => n.to).join(', ')}`
      : `could not read Svg.Skia ${svg.to}'s SkiaSharp dependency`;
    svg.blocked ||= why;
    for (const n of natives) n.blocked ||= why;
    return;
  }
  for (const n of natives) if (!n.mature) svg.blocked ||= `${n.id} ${n.to} is still in cooldown`;
}

const escapeRe =(s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rewrites Version attributes in place. Throws if a reference is not found exactly once. */
function applyEdits(applyPatch) {
  const changed = [];
  for (const project of PROJECTS) {
    const file = path.join(repoRoot, project);
    let text = fs.readFileSync(file, 'utf8');
    const before = text;
    for (const u of applyPatch.filter((x) => x.projects.includes(project))) {
      const re = new RegExp(`(<PackageReference\\s+Include="${escapeRe(u.id)}"\\s+Version=")${escapeRe(u.from)}(")`, 'gi');
      const hits = text.match(re) || [];
      if (hits.length !== 1) {
        throw new Error(`${project}: expected exactly one PackageReference ${u.id} Version="${u.from}", found ${hits.length}.`);
      }
      text = text.replace(re, `$1${u.to}$2`);
    }
    if (text !== before) {
      fs.writeFileSync(file, text, 'utf8');
      changed.push(project);
    }
  }
  return changed;
}

async function main() {
  const dn = dotnetVersion();
  if (!dn.ok) {
    const out = { dotnetAvailable: false, dotnetError: dn.error, cooldownHours: COOLDOWN_HOURS,
      applyPatch: [], heldBack: [], minorAvailable: [], majorAvailable: [], notExact: [], applied: [] };
    if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
    else console.log(`\nNuGet not checked: dotnet is unavailable (${dn.error}).\n`);
    return;
  }

  const report = await buildReport();
  const applied = APPLY && report.applyPatch.length ? applyEdits(report.applyPatch) : [];

  if (JSON_OUT) {
    console.log(JSON.stringify({ dotnetAvailable: true, dotnetError: null, dotnetSdk: dn.version,
      cooldownHours: COOLDOWN_HOURS, ...report, applied }, null, 2));
    return;
  }

  console.log(`\n=== NuGet update check (dotnet ${dn.version}, ${COOLDOWN_HOURS}h cooldown) ===\n`);
  if (report.applyPatch.length) {
    console.log(`Patch updates ready${APPLY ? ' — APPLIED' : ''}:`);
    for (const u of report.applyPatch) {
      const newer = u.newerHeldBack ? `; ${u.newerHeldBack.version} is newer but still cooling down` : '';
      console.log(`  • ${u.id} ${u.from} → ${u.to} (${u.age}${newer})`);
    }
  } else {
    console.log('✓ No patch updates ready to apply.');
  }
  if (report.heldBack.length) {
    console.log('\n⏳ Held back:');
    for (const h of report.heldBack) {
      console.log(`  • ${h.id} → ${h.version} (${h.age}; ${h.reason}${h.eligibleIn != null ? `; eligible in ~${h.eligibleIn}h` : ''})`);
    }
  }
  if (report.minorAvailable.length) {
    console.log('\nMinor updates (reported, never applied):');
    for (const u of report.minorAvailable) console.log(`  • ${u.id} ${u.current} → ${u.version}`);
  }
  if (report.majorAvailable.length) {
    console.log('\nMajor updates (reported, never applied):');
    for (const u of report.majorAvailable) console.log(`  • ${u.id} ${u.current} → ${u.version}`);
  }
  if (report.notExact.length) {
    console.log('\nNot an exact version, left alone:');
    for (const u of report.notExact) console.log(`  • ${u.id} ${u.requested} (patch ${u.version} exists)`);
  }
  if (applied.length) console.log(`\nEdited: ${applied.join(', ')}`);
  else if (!APPLY && report.applyPatch.length) console.log('\nRe-run with --apply to write these into the csproj files.');
  console.log('');
}

main().catch((err) => {
  console.error('check-nuget-updates failed:', err.message);
  process.exitCode = 2;
});
