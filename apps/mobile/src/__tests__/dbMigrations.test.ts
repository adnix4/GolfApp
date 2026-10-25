// Runs the migrations against real SQLite (Node's built-in node:sqlite), so the
// SQL itself is exercised: fresh installs, installs from before versioning, and
// a step that fails partway.
import { DatabaseSync } from 'node:sqlite';
import { describe, it, expect } from 'vitest';
import { runMigrations, SCHEMA_VERSION, type MigratableDb } from '../lib/dbMigrations';

/** expo-sqlite's async surface over a synchronous node:sqlite handle. */
function asMigratable(d: DatabaseSync): MigratableDb {
  return {
    execAsync: async sql => { d.exec(sql); },
    getFirstAsync: async <T,>(sql: string) => (d.prepare(sql).get() as T | undefined) ?? null,
    getAllAsync: async <T,>(sql: string) => d.prepare(sql).all() as T[],
    withTransactionAsync: async task => {
      d.exec('BEGIN');
      try { await task(); d.exec('COMMIT'); }
      catch (e) { d.exec('ROLLBACK'); throw e; }
    },
  };
}

const userVersion = (d: DatabaseSync) =>
  (d.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;

const columns = (d: DatabaseSync, table: string) =>
  (d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name);

const indexes = (d: DatabaseSync) =>
  (d.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[])
    .map(i => i.name);

/** pending_scores as the very first app builds created it, before any ALTER ran. */
function legacyDb(): DatabaseSync {
  const d = new DatabaseSync(':memory:');
  d.exec(`
    CREATE TABLE event_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE pending_scores (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, team_id TEXT NOT NULL,
      hole_number INTEGER NOT NULL, gross_score INTEGER NOT NULL, putts INTEGER,
      player_shots TEXT, created_at TEXT NOT NULL, synced_at TEXT,
      sync_attempts INTEGER NOT NULL DEFAULT 0
    );
  `);
  d.prepare(`INSERT INTO pending_scores (id, event_id, team_id, hole_number, gross_score, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`).run('e1_t1_4', 'e1', 't1', 4, 5, '2026-10-01T15:00:00.000Z');
  return d;
}

const ALL_SCORE_COLUMNS = [
  'id', 'event_id', 'team_id', 'hole_number', 'gross_score', 'putts', 'drive_shots',
  'approach_shots', 'player_shots', 'created_at', 'synced_at', 'sync_attempts',
  'completed_at', 'conflict',
];

describe('runMigrations', () => {
  it('builds the full schema on a fresh install', async () => {
    const d = new DatabaseSync(':memory:');
    await runMigrations(asMigratable(d));

    expect(userVersion(d)).toBe(SCHEMA_VERSION);
    expect(columns(d, 'pending_scores').sort()).toEqual([...ALL_SCORE_COLUMNS].sort());
    expect(columns(d, 'event_cache')).toEqual(['key', 'value']);
    expect(columns(d, 'leaderboard_cache')).toEqual(['key', 'value', 'cached_at']);
    expect(indexes(d)).toContain('idx_pending_event_team');
  });

  it('upgrades a pre-versioning install and keeps its unsynced scores', async () => {
    const d = legacyDb();
    await runMigrations(asMigratable(d));

    expect(userVersion(d)).toBe(SCHEMA_VERSION);
    expect(columns(d, 'pending_scores').sort()).toEqual([...ALL_SCORE_COLUMNS].sort());
    const row = d.prepare('SELECT * FROM pending_scores').get() as Record<string, unknown>;
    expect(row).toMatchObject({
      id: 'e1_t1_4', gross_score: 5, synced_at: null,
      drive_shots: null, completed_at: null, conflict: 0,
    });
  });

  it('adds only the columns a partly-upgraded install is missing', async () => {
    const d = legacyDb();
    // An install that ran the first two ALTERs in an earlier build.
    d.exec('ALTER TABLE pending_scores ADD COLUMN drive_shots INTEGER');
    d.exec('ALTER TABLE pending_scores ADD COLUMN approach_shots INTEGER');
    await runMigrations(asMigratable(d));

    expect(columns(d, 'pending_scores').sort()).toEqual([...ALL_SCORE_COLUMNS].sort());
  });

  it('is a no-op on a database already at the current version', async () => {
    const d = new DatabaseSync(':memory:');
    const db = asMigratable(d);
    await runMigrations(db);
    d.prepare(`INSERT INTO pending_scores (id, event_id, team_id, hole_number, gross_score, created_at)
               VALUES ('x', 'e', 't', 1, 4, '2026-10-01T15:00:00.000Z')`).run();
    await runMigrations(db);

    expect(userVersion(d)).toBe(SCHEMA_VERSION);
    expect((d.prepare('SELECT COUNT(*) AS n FROM pending_scores').get() as { n: number }).n).toBe(1);
  });

  it('leaves a database from a newer build alone', async () => {
    const d = new DatabaseSync(':memory:');
    d.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 3}`);
    await runMigrations(asMigratable(d));

    expect(userVersion(d)).toBe(SCHEMA_VERSION + 3);
    expect(columns(d, 'pending_scores')).toEqual([]);
  });

  it('rolls a failed step back with its version bump, so the next launch retries it', async () => {
    const d = legacyDb();
    const db = asMigratable(d);
    let failed = false;
    const failing: MigratableDb = {
      ...db,
      execAsync: async sql => {
        if (!failed && sql.includes('CREATE INDEX')) { failed = true; throw new Error('disk I/O error'); }
        return db.execAsync(sql);
      },
    };

    await expect(runMigrations(failing)).rejects.toThrow('disk I/O error');
    expect(userVersion(d)).toBe(0);
    expect(columns(d, 'pending_scores')).not.toContain('conflict');

    await runMigrations(db);
    expect(userVersion(d)).toBe(SCHEMA_VERSION);
    expect(columns(d, 'pending_scores')).toContain('conflict');
    expect(d.prepare('SELECT COUNT(*) AS n FROM pending_scores').get()).toMatchObject({ n: 1 });
  });
});
