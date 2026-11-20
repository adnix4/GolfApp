#!/usr/bin/env node
/**
 * Fail when package-lock.json moves any package to an OLDER version than a git
 * ref has (default: HEAD).
 *
 * WHY: the weekly routine resolves updates with `npm update --before=<cutoff>`
 * so nothing younger than the 72h cooldown gets in, transitive dependencies
 * included. The same flag can also pick an older copy of something already in
 * the tree (e.g. a version installed by hand within the last 72h). Downgrades
 * are never made without the user's approval, so the routine runs this before
 * committing and treats any hit as "ask first", not as a change to ship.
 *
 * USAGE
 *   npm run check-lock-downgrades                     # vs HEAD
 *   npm run check-lock-downgrades -- --base=origin/main
 *   npm run check-lock-downgrades -- --json
 *
 * Exit codes: 0 no downgrades, 1 downgrades found, 2 could not compare.
 */
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { lockDowngrades } = require('./lib/cooldown');

const repoRoot = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const base = (argv.find((a) => a.startsWith('--base=')) || '--base=HEAD').slice('--base='.length);

function fail(msg) {
  if (JSON_OUT) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
  else console.error('✗ ' + msg);
  process.exit(2);
}

// The ref is passed as an argument, never through a shell.
if (!/^[\w./~^-]+$/.test(base)) fail(`unexpected --base value: ${base}`);

let before;
let after;
try {
  before = JSON.parse(execFileSync('git', ['show', `${base}:package-lock.json`], {
    cwd: repoRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  }));
} catch (err) {
  fail(`could not read package-lock.json at ${base}: ${(err.stderr || err.message || '').toString().trim().split('\n')[0]}`);
}
try {
  after = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'));
} catch (err) {
  fail(`could not read the working package-lock.json: ${err.message}`);
}

const downgrades = lockDowngrades(before, after);

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: downgrades.length === 0, base, downgrades }, null, 2));
} else if (downgrades.length === 0) {
  console.log(`✓ No downgrades in package-lock.json against ${base}.`);
} else {
  console.log(`✗ ${downgrades.length} downgrade(s) in package-lock.json against ${base} — not to be committed without the user's approval:`);
  for (const d of downgrades) console.log(`    ${d.path.replace(/^node_modules\//, '')}: ${d.from} → ${d.to}`);
}
process.exitCode = downgrades.length === 0 ? 0 : 1;
