'use strict';
// Run: npm run test:scripts  (node --test, no extra dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  compareStable, compareAny, candidatesBetween, newestMature,
  cooldownCutoff, familyTarget, lockDowngrades,
} = require('../lib/cooldown');

const COOL = 72;
const agesOf = (ages) => (v) => (v in ages ? ages[v] : null);

test('compareStable orders 3- and 4-part versions numerically', () => {
  assert.equal(compareStable('1.10.0', '1.9.9'), 1);
  assert.equal(compareStable('4.0.104.12', '4.0.100.2'), 1);
  assert.equal(compareStable('1.2', '1.2.0'), 0);
  assert.throws(() => compareStable('1.0.0-rc.1', '1.0.0'));
});

test('compareAny ranks a prerelease below its release', () => {
  assert.equal(compareAny('1.0.0-rc.1', '1.0.0'), -1);
  assert.equal(compareAny('1.0.0-rc.2', '1.0.0-rc.10'), -1);
  assert.equal(compareAny('2.0.0', '1.9.9-beta'), 1);
  assert.equal(compareAny('not-a-version', '1.0.0'), null);
});

test('candidatesBetween keeps stable versions in (current, ceiling], newest first', () => {
  const versions = ['1.0.0', '1.0.1', '1.1.0-beta.1', '1.1.0', '1.2.0', '2.0.0'];
  assert.deepEqual(candidatesBetween(versions, '1.0.0', '1.2.0'), ['1.2.0', '1.1.0', '1.0.1']);
  assert.deepEqual(candidatesBetween(versions, '1.2.0', '1.2.0'), []);
  // NuGet narrows to the same major.minor.
  assert.deepEqual(candidatesBetween(versions, '1.0.0', '2.0.0', (v) => v.startsWith('1.0.')), ['1.0.1']);
});

test('a fresh release no longer blocks an older mature one', async () => {
  const pick = await newestMature(['1.2.0', '1.1.0', '1.0.1'], agesOf({ '1.2.0': 5, '1.1.0': 200, '1.0.1': 900 }), COOL);
  assert.equal(pick.version, '1.1.0');
  assert.equal(pick.newest, '1.2.0');
  assert.equal(pick.newestHours, 5);
});

test('the newest version wins when it is already mature', async () => {
  const pick = await newestMature(['1.2.0', '1.1.0'], agesOf({ '1.2.0': 100, '1.1.0': 900 }), COOL);
  assert.equal(pick.version, '1.2.0');
});

test('nothing past the cooldown, or an unknown age, means no target (fail closed)', async () => {
  assert.equal((await newestMature(['1.2.0', '1.1.0'], agesOf({ '1.2.0': 5, '1.1.0': 70 }), COOL)).version, null);
  assert.equal((await newestMature(['1.2.0'], agesOf({}), COOL)).version, null);
  assert.equal((await newestMature([], agesOf({}), COOL)).version, null);
});

test('the old npm gate bug: a fresh in-range patch is not let through by an old major', async () => {
  // Installed 1.4.0; 1.4.1 published an hour ago (wanted); 2.0.0 out for months (latest).
  // The install target only ever comes from (current, wanted], timed on its own age.
  const versions = ['1.4.0', '1.4.1', '2.0.0'];
  const ages = agesOf({ '1.4.1': 1, '2.0.0': 2000 });
  const pick = await newestMature(candidatesBetween(versions, '1.4.0', '1.4.1'), ages, COOL);
  assert.equal(pick.version, null);
});

test('maxLookups bounds the registry calls', async () => {
  let calls = 0;
  const hoursOf = () => { calls++; return 1; };
  await newestMature(Array.from({ length: 100 }, (_, i) => `1.0.${100 - i}`), hoursOf, COOL, 10);
  assert.equal(calls, 10);
});

test('cooldownCutoff is the npm --before timestamp', () => {
  assert.equal(cooldownCutoff(72, Date.parse('2026-11-20T12:00:00Z')), '2026-11-17T12:00:00.000Z');
});

const member = (id, current, candidates, matureVersion, ages) =>
  ({ id, current, candidates, matureVersion, hoursOf: agesOf(ages) });

test('a family moves to the highest version mature for every member', async () => {
  const target = await familyTarget([
    member('A', '10.0.1', ['10.0.3', '10.0.2'], '10.0.3', { '10.0.3': 100, '10.0.2': 300 }),
    member('B', '10.0.1', ['10.0.3', '10.0.2'], '10.0.2', { '10.0.3': 10, '10.0.2': 300 }),
  ], COOL);
  assert.equal(target, '10.0.2');
});

test('a family waits when a member cannot take the shared version', async () => {
  assert.equal(await familyTarget([
    member('A', '10.0.1', ['10.0.3'], '10.0.3', { '10.0.3': 100 }),
    member('B', '10.0.1', ['10.0.2'], '10.0.2', { '10.0.2': 300 }),
  ], COOL), null);
  assert.equal(await familyTarget([
    member('A', '10.0.1', ['10.0.2'], '10.0.2', { '10.0.2': 100 }),
    member('B', '10.0.1', ['10.0.2'], null, { '10.0.2': 5 }),
  ], COOL), null);
});

test('a family never moves a member down', async () => {
  assert.equal(await familyTarget([
    member('A', '10.0.1', ['10.0.2'], '10.0.2', { '10.0.2': 100 }),
    member('B', '10.0.3', [], '10.0.3', {}),
  ], COOL), null);
});

test('lockDowngrades reports only versions that went down', () => {
  const before = { packages: {
    '': { version: '0.0.0' },
    'node_modules/a': { version: '1.2.0' },
    'node_modules/b': { version: '1.0.0' },
    'node_modules/c': { version: '2.0.0' },
    'node_modules/d': { version: '1.0.0' },
  } };
  const after = { packages: {
    '': { version: '0.0.0' },
    'node_modules/a': { version: '1.1.9' },        // down
    'node_modules/b': { version: '1.0.1' },        // up
    'node_modules/c': { version: '2.0.0-rc.1' },   // down to a prerelease
    'node_modules/e': { version: '0.1.0' },        // new
  } };
  assert.deepEqual(lockDowngrades(before, after), [
    { path: 'node_modules/a', from: '1.2.0', to: '1.1.9' },
    { path: 'node_modules/c', from: '2.0.0', to: '2.0.0-rc.1' },
  ]);
  assert.deepEqual(lockDowngrades(before, before), []);
});
