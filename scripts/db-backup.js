#!/usr/bin/env node
/**
 * Local Postgres snapshot / restore.
 *
 *   npm run db:backup                 -> backups/golf_fundraiser_<stamp>.dump
 *   npm run db:restore -- <file>      -> restores that file over the dev database
 *
 * pg_dump runs INSIDE the gfp-postgres container, so nothing has to be
 * installed on the host and the client version always matches the server.
 *
 * Why this exists: `npm run e2e` used to drop the shared Postgres volume, and
 * on 2026-09-23 that deleted the developer's own organizer account with no way
 * back. The harness now uses its own database, and this is the second layer —
 * take a snapshot before anything destructive.
 */
'use strict';

const { execFileSync, execSync } = require('node:child_process');
const fs   = require('node:fs');
const path = require('node:path');
const os   = require('node:os');

const ROOT       = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'backups');
const CONTAINER  = 'gfp-postgres';
const DB         = 'golf_fundraiser';
const USER       = 'gfp';

const c = { dim: s => `\x1b[2m${s}\x1b[0m`, ok: s => `\x1b[32m${s}\x1b[0m`,
            bad: s => `\x1b[31m${s}\x1b[0m`, hd: s => `\x1b[1m${s}\x1b[0m` };

function die(msg) {
  console.error(`\n  ${c.bad('✗')} ${msg}\n`);
  process.exit(1);
}

function requireContainer() {
  let running = '';
  try {
    running = execSync(`docker ps --filter name=^/${CONTAINER}$ --format "{{.Names}}"`,
                       { encoding: 'utf8' }).trim();
  } catch {
    die('docker is not available. Start Docker Desktop and try again.');
  }
  if (running !== CONTAINER) {
    die(`container ${CONTAINER} is not running. Start it with:\n` +
        `      docker compose -f infra/docker-compose.yml up -d`);
  }
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_` +
         `${p(d.getHours())}${p(d.getMinutes())}`;
}

function humanSize(bytes) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
                             : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function backup() {
  requireContainer();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const out = path.join(BACKUP_DIR, `${DB}_${stamp()}.dump`);

  // -Fc is the custom format: compressed, and pg_restore can pick from it.
  // stdout is binary, so capture it as a buffer and write it ourselves rather
  // than shell-redirecting (which would mangle the bytes on Windows).
  let dump;
  try {
    dump = execFileSync('docker',
      ['exec', CONTAINER, 'pg_dump', '-U', USER, '-Fc', '--no-owner', DB],
      { maxBuffer: 1024 * 1024 * 1024 });
  } catch (e) {
    die(`pg_dump failed:\n${(e.stderr || e.message).toString().trim()}`);
  }
  if (!dump || dump.length === 0) die('pg_dump produced an empty file — nothing was written.');

  fs.writeFileSync(out, dump);
  console.log(`\n  ${c.ok('✓')} ${path.relative(ROOT, out)} ${c.dim(humanSize(dump.length))}\n`);
}

function restore(file) {
  if (!file) {
    const have = fs.existsSync(BACKUP_DIR)
      ? fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.dump')).sort().reverse()
      : [];
    die('name the dump to restore: npm run db:restore -- <file>\n' +
        (have.length ? `      available:\n${have.map(f => `        backups/${f}`).join('\n')}`
                     : '      (no dumps in backups/ yet — run npm run db:backup first)'));
  }

  const abs = path.resolve(ROOT, file);
  if (!fs.existsSync(abs)) die(`no such file: ${file}`);
  requireContainer();

  // Restoring REPLACES the dev database. Deliberately not defaulting to the
  // newest dump and deliberately not silent: putting back the wrong snapshot is
  // the same accident this script exists to prevent.
  if (!process.argv.includes('--yes')) {
    console.log(`\n  ${c.hd('This overwrites the ' + DB + ' database')} ${c.dim('(--clean --if-exists)')}`);
    console.log(`  ${c.dim('from')} ${path.relative(ROOT, abs)} ${c.dim(humanSize(fs.statSync(abs).size))}`);
    console.log(`\n  Re-run with --yes to proceed:`);
    console.log(`      npm run db:restore -- ${file} --yes\n`);
    process.exit(1);
  }

  try {
    execFileSync('docker',
      ['exec', '-i', CONTAINER, 'pg_restore', '-U', USER, '-d', DB,
       '--clean', '--if-exists', '--no-owner'],
      { input: fs.readFileSync(abs), stdio: ['pipe', 'inherit', 'pipe'],
        maxBuffer: 1024 * 1024 * 1024 });
  } catch (e) {
    // pg_restore exits non-zero on warnings too (a DROP of something absent,
    // for instance), so show what it said instead of claiming failure outright.
    const err = (e.stderr || '').toString().trim();
    console.error(`\n  ${c.bad('pg_restore reported:')}\n${err}\n`);
    process.exit(1);
  }
  console.log(`\n  ${c.ok('✓')} restored ${DB} from ${path.relative(ROOT, abs)}\n`);
}

const mode = process.argv[2];
if (mode === 'restore') restore(process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null);
else backup();
