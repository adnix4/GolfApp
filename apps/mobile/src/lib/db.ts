import * as SQLite from 'expo-sqlite';

let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('gfp.db');
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS event_cache (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS pending_scores (
          id            TEXT PRIMARY KEY,
          event_id      TEXT NOT NULL,
          team_id       TEXT NOT NULL,
          hole_number   INTEGER NOT NULL,
          gross_score   INTEGER NOT NULL,
          putts         INTEGER,
          player_shots  TEXT,
          created_at    TEXT NOT NULL,
          synced_at     TEXT,
          sync_attempts INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS leaderboard_cache (
          key       TEXT PRIMARY KEY,
          value     TEXT NOT NULL,
          cached_at TEXT NOT NULL
        );
      `);
      return db;
    })();
  }
  return _dbPromise;
}
