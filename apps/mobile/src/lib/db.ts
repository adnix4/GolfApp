import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

// ── Web stub ──────────────────────────────────────────────────────────────────
// expo-sqlite is native-only. On web we back the event_cache table with
// localStorage so session and deviceId persist across reloads. pending_scores
// and leaderboard_cache silently no-op (scores stay in-memory via session.tsx).

const webDb = {
  async execAsync(_sql: string) {},

  async getFirstAsync<T>(sql: string, params: unknown[]): Promise<T | null> {
    if (sql.includes('event_cache')) {
      const raw = localStorage.getItem(`gfp:${params[0]}`);
      return raw !== null ? ({ value: raw } as T) : null;
    }
    return null;
  },

  async runAsync(sql: string, params: unknown[]) {
    if (!sql.includes('event_cache')) return;
    if (sql.trimStart().toUpperCase().startsWith('DELETE')) {
      localStorage.removeItem(`gfp:${params[0]}`);
    } else {
      // INSERT / INSERT OR REPLACE — key is params[0], value is params[1]
      localStorage.setItem(`gfp:${params[0]}`, params[1] as string);
    }
  },

  async getAllAsync<T>(_sql: string, _params: unknown[]): Promise<T[]> {
    return [];
  },
};

type Db = typeof webDb | SQLite.SQLiteDatabase;

let _dbPromise: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  if (!_dbPromise) {
    if (Platform.OS === 'web') {
      _dbPromise = Promise.resolve(webDb);
    } else {
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
  }
  return _dbPromise;
}
