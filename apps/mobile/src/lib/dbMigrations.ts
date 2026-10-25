// SQLite schema migrations, tracked in PRAGMA user_version.
//
// Each entry upgrades the schema by one version and runs inside a transaction
// together with the user_version bump, so an install never sits half-migrated:
// if a step throws, the step and the version bump roll back together and the
// next launch retries it. Append new steps; never edit or reorder a shipped one.
//
// pending_scores holds scores not yet on the server, so a step that rebuilds a
// table must copy its rows across. Dropping them loses a golfer's round.

/** The slice of expo-sqlite's SQLiteDatabase the migrations use. */
export interface MigratableDb {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string): Promise<T | null>;
  getAllAsync<T>(source: string): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

type Migration = (db: MigratableDb) => Promise<void>;

/** Columns added to pending_scores by ALTERs that ran on every launch before versioning. */
const PRE_VERSIONING_COLUMNS: [name: string, decl: string][] = [
  ['drive_shots',    'INTEGER'],
  ['approach_shots', 'INTEGER'],
  ['completed_at',   'TEXT'],
  ['conflict',       'INTEGER NOT NULL DEFAULT 0'],
];

const MIGRATIONS: Migration[] = [
  // 1 — baseline. Installs from before versioning are at user_version 0 with
  // the tables present and any subset of the later columns, so this step has
  // to be idempotent: create what's missing, add only the columns that aren't there.
  async db => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS event_cache (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pending_scores (
        id             TEXT PRIMARY KEY,
        event_id       TEXT NOT NULL,
        team_id        TEXT NOT NULL,
        hole_number    INTEGER NOT NULL,
        gross_score    INTEGER NOT NULL,
        putts          INTEGER,
        drive_shots    INTEGER,
        approach_shots INTEGER,
        player_shots   TEXT,
        created_at     TEXT NOT NULL,
        synced_at      TEXT,
        sync_attempts  INTEGER NOT NULL DEFAULT 0,
        completed_at   TEXT,
        conflict       INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS leaderboard_cache (
        key       TEXT PRIMARY KEY,
        value     TEXT NOT NULL,
        cached_at TEXT NOT NULL
      );
    `);
    const existing = new Set(
      (await db.getAllAsync<{ name: string }>('PRAGMA table_info(pending_scores)'))
        .map(c => c.name),
    );
    for (const [name, decl] of PRE_VERSIONING_COLUMNS) {
      if (!existing.has(name)) {
        await db.execAsync(`ALTER TABLE pending_scores ADD COLUMN ${name} ${decl}`);
      }
    }
    // Every store.ts query filters on (event_id, team_id).
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_pending_event_team ON pending_scores(event_id, team_id)');
  },
];

/** The schema version this build of the app writes. */
export const SCHEMA_VERSION = MIGRATIONS.length;

/**
 * Brings the database up to SCHEMA_VERSION, one transaction per step.
 * A database already ahead of this build (an older build reinstalled over a
 * newer one) is left untouched: its extra columns are ones this build ignores.
 */
export async function runMigrations(db: MigratableDb): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (let version = row?.user_version ?? 0; version < MIGRATIONS.length; version++) {
    const step = MIGRATIONS[version];
    await db.withTransactionAsync(async () => {
      await step(db);
      // PRAGMA takes no bound parameters; `version` is a loop integer.
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
