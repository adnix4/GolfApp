import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

// ── Web shim ──────────────────────────────────────────────────────────────────
// expo-sqlite is native-only. On web we back both tables with localStorage:
// event_cache as one key per row (session + deviceId), pending_scores as a
// JSON row array driven by a tiny interpreter for the exact SQL shapes
// store.ts issues (problemList A5 — the old no-op stub silently dropped all
// score entry/sync on web). Anything the interpreter doesn't recognize THROWS,
// so a future store.ts query change fails loudly on web instead of silently
// no-oping. (leaderboard_cache has no queries anywhere — nothing to shim.)

const SCORES_KEY = 'gfp:pending_scores';

type WebScoreRow = Record<string, string | number | null>;

function readScoreRows(): WebScoreRow[] {
  try { return JSON.parse(localStorage.getItem(SCORES_KEY) ?? '[]'); }
  catch { return []; }
}

function writeScoreRows(rows: WebScoreRow[]): void {
  localStorage.setItem(SCORES_KEY, JSON.stringify(rows));
}

// WHERE parser: AND-joined `col = ?` / `col IS NULL` / `col IS NOT NULL`.
// Returns a row predicate; consumes its `?` params from the tail of `params`.
function parseWhere(sql: string, params: unknown[], paramOffset: number) {
  const m = sql.match(/WHERE\s+(.+?)\s*(ORDER BY|$)/is);
  if (!m) return { test: (_r: WebScoreRow) => true };
  let i = paramOffset;
  const tests = m[1].split(/\s+AND\s+/i).map(cond => {
    const c = cond.trim();
    let cm: RegExpMatchArray | null;
    if ((cm = c.match(/^(\w+)\s*=\s*\?$/))) {
      const col = cm[1]; const val = params[i++];
      return (r: WebScoreRow) => r[col] === val;
    }
    if ((cm = c.match(/^(\w+)\s+IS\s+NOT\s+NULL$/i))) {
      const col = cm[1];
      return (r: WebScoreRow) => r[col] !== null && r[col] !== undefined;
    }
    if ((cm = c.match(/^(\w+)\s+IS\s+NULL$/i))) {
      const col = cm[1];
      return (r: WebScoreRow) => r[col] === null || r[col] === undefined;
    }
    throw new Error(`webDb: unsupported WHERE condition on web: ${c}`);
  });
  return { test: (r: WebScoreRow) => tests.every(t => t(r)) };
}

function runScoresSql(sql: string, params: unknown[]): void {
  const s = sql.trim();

  if (/^INSERT(\s+OR\s+REPLACE)?\s+INTO\s+pending_scores/i.test(s)) {
    const m = s.match(/pending_scores\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/is);
    if (!m) throw new Error(`webDb: unparsable INSERT on web: ${s}`);
    const cols = m[1].split(',').map(c => c.trim());
    const vals = m[2].split(',').map(v => v.trim());
    if (cols.length !== vals.length) throw new Error('webDb: INSERT column/value count mismatch');
    let i = 0;
    const row: WebScoreRow = {};
    for (let c = 0; c < cols.length; c++) {
      const v = vals[c];
      if (v === '?') row[cols[c]] = params[i++] as string | number | null;
      else if (/^NULL$/i.test(v)) row[cols[c]] = null;
      else if (/^-?\d+$/.test(v)) row[cols[c]] = Number(v);
      else throw new Error(`webDb: unsupported INSERT value on web: ${v}`);
    }
    const rows = readScoreRows().filter(r => r.id !== row.id); // OR REPLACE
    rows.push(row);
    writeScoreRows(rows);
    return;
  }

  if (/^UPDATE\s+pending_scores\s+SET\s+/i.test(s)) {
    const m = s.match(/SET\s+(.+?)\s+WHERE\s/is);
    if (!m) throw new Error(`webDb: unparsable UPDATE on web: ${s}`);
    let i = 0;
    const sets = m[1].split(',').map(a => {
      const at = a.trim();
      let am: RegExpMatchArray | null;
      if ((am = at.match(/^(\w+)\s*=\s*\?$/))) {
        const col = am[1]; const val = params[i++];
        return (r: WebScoreRow) => { r[col] = val as string | number | null; };
      }
      if ((am = at.match(/^(\w+)\s*=\s*\1\s*\+\s*1$/))) {
        const col = am[1];
        return (r: WebScoreRow) => { r[col] = (Number(r[col]) || 0) + 1; };
      }
      throw new Error(`webDb: unsupported UPDATE assignment on web: ${at}`);
    });
    const where = parseWhere(s, params, i);
    const rows = readScoreRows();
    for (const r of rows) if (where.test(r)) sets.forEach(set => set(r));
    writeScoreRows(rows);
    return;
  }

  if (/^DELETE\s+FROM\s+pending_scores/i.test(s)) {
    const where = parseWhere(s, params, 0);
    writeScoreRows(readScoreRows().filter(r => !where.test(r)));
    return;
  }

  throw new Error(`webDb: unsupported pending_scores statement on web: ${s}`);
}

function selectScoreRows(sql: string, params: unknown[]): WebScoreRow[] {
  // Rows carry every column, so SELECT projection is just property access by
  // the caller — only WHERE + ORDER BY need interpreting.
  const where = parseWhere(sql, params, 0);
  const rows = readScoreRows().filter(r => where.test(r));
  if (/ORDER BY\s+hole_number/i.test(sql)) {
    rows.sort((a, b) => Number(a.hole_number) - Number(b.hole_number));
  } else if (/ORDER BY/i.test(sql)) {
    throw new Error(`webDb: unsupported ORDER BY on web: ${sql}`);
  }
  return rows;
}

const webDb = {
  async execAsync(_sql: string) {},

  async getFirstAsync<T>(sql: string, params: unknown[]): Promise<T | null> {
    if (sql.includes('event_cache')) {
      const raw = localStorage.getItem(`gfp:${params[0]}`);
      return raw !== null ? ({ value: raw } as T) : null;
    }
    if (sql.includes('pending_scores')) {
      return (selectScoreRows(sql, params)[0] as T) ?? null;
    }
    throw new Error(`webDb: unsupported query on web: ${sql}`);
  },

  async runAsync(sql: string, params: unknown[]) {
    if (sql.includes('event_cache')) {
      if (sql.trimStart().toUpperCase().startsWith('DELETE')) {
        localStorage.removeItem(`gfp:${params[0]}`);
      } else {
        // INSERT / INSERT OR REPLACE — key is params[0], value is params[1]
        localStorage.setItem(`gfp:${params[0]}`, params[1] as string);
      }
      return;
    }
    if (sql.includes('pending_scores')) {
      runScoresSql(sql, params);
      return;
    }
    throw new Error(`webDb: unsupported statement on web: ${sql}`);
  },

  async getAllAsync<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (sql.includes('pending_scores')) {
      return selectScoreRows(sql, params) as T[];
    }
    throw new Error(`webDb: unsupported query on web: ${sql}`);
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
        // Migrate existing DBs that predate the drive/approach columns.
        // SQLite throws if the column already exists — that's fine, swallow it.
        try { await db.runAsync('ALTER TABLE pending_scores ADD COLUMN drive_shots INTEGER', []); } catch { /* already exists */ }
        try { await db.runAsync('ALTER TABLE pending_scores ADD COLUMN approach_shots INTEGER', []); } catch { /* already exists */ }
        try { await db.runAsync('ALTER TABLE pending_scores ADD COLUMN completed_at TEXT', []); } catch { /* already exists */ }
        try { await db.runAsync('ALTER TABLE pending_scores ADD COLUMN conflict INTEGER NOT NULL DEFAULT 0', []); } catch { /* already exists */ }
        return db;
      })();
    }
  }
  return _dbPromise;
}
