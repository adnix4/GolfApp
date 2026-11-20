'use strict';
/**
 * Version picking under the 72h supply-chain cooldown, shared by
 * check-updates.js (npm) and check-nuget-updates.js (NuGet).
 *
 * THE RULE: install the newest version that has been on the registry for at
 * least the cooldown — not "the newest version, if it is old enough".
 *
 * Until 2026-11-20 both scripts timed only the single newest candidate and held
 * the whole package back when it was fresh, so a release yesterday blocked a
 * safe one from last month. The npm script also timed `latest` instead of the
 * `wanted` version it actually installs: a fresh 1.x patch slipped through
 * whenever an old 2.0 existed, and a fresh 2.0 blocked a mature 1.x patch.
 *
 * Pure (no network, no fs) so scripts/__tests__/cooldown.test.js covers it.
 */

const HOUR_MS = 3_600_000;

/**
 * Numeric parts of a stable version ("1.2.3", NuGet's "4.0.104.12"), or null
 * for a prerelease or anything else. Prereleases are never install targets.
 */
function stableParts(v) {
  const s = String(v ?? '').trim();
  if (!/^\d+(\.\d+){1,3}$/.test(s)) return null;
  return s.split('.').map(Number);
}

/** Compare two stable versions; missing trailing parts count as 0. */
function compareStable(a, b) {
  const pa = stableParts(a);
  const pb = stableParts(b);
  if (!pa || !pb) throw new Error(`not a stable version: ${!pa ? a : b}`);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Full semver-ish comparison for lockfile entries, prereleases included
 * ("1.0.0-rc.1" < "1.0.0"). Returns -1 / 0 / 1, or null if either is unparseable.
 */
function compareAny(a, b) {
  const split = (v) => {
    const m = /^(\d+(?:\.\d+){0,3})(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(String(v ?? '').trim());
    return m ? { core: m[1], pre: m[2] ?? null } : null;
  };
  const x = split(a);
  const y = split(b);
  if (!x || !y) return null;
  const c = compareStable(x.core, y.core);
  if (c !== 0) return c;
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;   // a release outranks its own prerelease
  if (y.pre === null) return -1;
  const xs = x.pre.split('.');
  const ys = y.pre.split('.');
  for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
    if (xs[i] === undefined) return -1;
    if (ys[i] === undefined) return 1;
    const xn = /^\d+$/.test(xs[i]);
    const yn = /^\d+$/.test(ys[i]);
    if (xn && yn && Number(xs[i]) !== Number(ys[i])) return Number(xs[i]) < Number(ys[i]) ? -1 : 1;
    if (xn !== yn) return xn ? -1 : 1;
    if (xs[i] !== ys[i]) return xs[i] < ys[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Stable versions strictly above `current` and at or below `ceiling`, newest
 * first. `sameLine(v)` optionally narrows further (NuGet: same major.minor).
 * For npm the ceiling is `wanted`, the newest version the declared range
 * allows; caret and tilde ranges are contiguous, so everything between the
 * installed version and `wanted` is inside the range too.
 */
function candidatesBetween(versions, current, ceiling, sameLine = () => true) {
  const out = [];
  for (const v of versions) {
    if (!stableParts(v)) continue;
    if (current && stableParts(current) && compareStable(v, current) <= 0) continue;
    if (ceiling && stableParts(ceiling) && compareStable(v, ceiling) > 0) continue;
    if (!sameLine(v)) continue;
    out.push(v);
  }
  return out.sort((a, b) => compareStable(b, a));
}

/**
 * The newest candidate that has cleared the cooldown.
 * `hoursOf(v)` returns the version's age in hours, or null when unknown — an
 * unknown age never counts as mature (fail closed). It may be async.
 *
 * Returns { version, hours, newest, newestHours } where `newest` is the newest
 * candidate overall (so a report can say what is still cooling down), or
 * { version: null, ... } when nothing qualifies. `maxLookups` bounds network
 * calls for packages with long release trains (AWSSDK ships several a week).
 */
async function newestMature(candidatesDesc, hoursOf, cooldownHours, maxLookups = 40) {
  const result = { version: null, hours: null, newest: candidatesDesc[0] ?? null, newestHours: null };
  for (let i = 0; i < candidatesDesc.length && i < maxLookups; i++) {
    const v = candidatesDesc[i];
    const hours = await hoursOf(v);
    if (i === 0) result.newestHours = hours;
    if (hours != null && hours >= cooldownHours) {
      result.version = v;
      result.hours = hours;
      return result;
    }
  }
  return result;
}

/** Hours since `date` (a Date or ISO string), or null. */
function hoursSince(date, now = Date.now()) {
  if (!date) return null;
  const t = date instanceof Date ? date.getTime() : Date.parse(date);
  return Number.isNaN(t) ? null : (now - t) / HOUR_MS;
}

/** ISO timestamp for `npm --before`: resolve as the registry stood `cooldownHours` ago. */
function cooldownCutoff(cooldownHours, now = Date.now()) {
  return new Date(now - cooldownHours * HOUR_MS).toISOString();
}

/**
 * One version every family member can move to (they share a servicing train,
 * and a split train fails restore with NU1605). It is the lowest of the
 * members' newest-mature versions, and only if every member can take it:
 * each must list it as a candidate (or already be on it) and it must be mature
 * for each. `members`: [{ id, current, candidates, matureVersion, hoursOf }].
 * Returns the version, or null to hold the whole family back.
 */
async function familyTarget(members, cooldownHours) {
  if (members.length === 0) return null;
  if (members.some((m) => !m.matureVersion)) return null;
  const target = members.map((m) => m.matureVersion).sort(compareStable)[0];
  for (const m of members) {
    if (m.current && stableParts(m.current) && compareStable(m.current, target) > 0) return null;
    if (m.current === target) continue;
    if (!m.candidates.includes(target)) return null;
    const hours = await m.hoursOf(target);
    if (hours == null || hours < cooldownHours) return null;
  }
  return target;
}

/**
 * Lockfile entries whose version went DOWN between two package-lock.json
 * objects. Resolving with `npm --before` can pick an older copy of something
 * already in the tree; that must never be committed without the user's say.
 */
function lockDowngrades(oldLock, newLock) {
  const before = oldLock?.packages ?? {};
  const after = newLock?.packages ?? {};
  const out = [];
  for (const [key, entry] of Object.entries(after)) {
    if (key === '' || !entry?.version || !before[key]?.version) continue;
    const cmp = compareAny(entry.version, before[key].version);
    if (cmp !== null && cmp < 0) out.push({ path: key, from: before[key].version, to: entry.version });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

module.exports = {
  stableParts, compareStable, compareAny, candidatesBetween, newestMature,
  hoursSince, cooldownCutoff, familyTarget, lockDowngrades,
};
