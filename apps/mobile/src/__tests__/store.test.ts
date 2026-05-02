import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── in-memory SQLite mock ──────────────────────────────────────────────────────
// Mock ../lib/db to avoid expo-sqlite native module resolution.
// We implement enough of the SQLiteDatabase interface to let store.ts run
// real JavaScript logic against in-memory state.

const { mockDb } = vi.hoisted(() => {
  const kv   = new Map<string, string>();                          // event_cache rows
  const scores = new Map<string, Record<string, unknown>>();      // pending_scores rows keyed by id

  const mockDb = {
    execAsync: vi.fn().mockResolvedValue(undefined),

    runAsync: vi.fn().mockImplementation(async (sql: string, params: unknown[]) => {
      const s = sql.toUpperCase();

      if (s.includes('EVENT_CACHE') && s.includes('INSERT')) {
        kv.set(params[0] as string, params[1] as string);

      } else if (s.includes('EVENT_CACHE') && s.includes('DELETE')) {
        kv.delete(params[0] as string);

      } else if (s.includes('PENDING_SCORES') && s.includes('INSERT')) {
        const id = params[0] as string;
        scores.set(id, {
          id,
          event_id:      params[1],
          team_id:       params[2],
          hole_number:   params[3],
          gross_score:   params[4],
          putts:         params[5],
          player_shots:  params[6],
          created_at:    params[7],
          synced_at:     null,
          sync_attempts: 0,
        });

      } else if (s.includes('PENDING_SCORES') && s.includes('SYNC_ATTEMPTS')) {
        const [eid, tid] = [params[0] as string, params[1] as string];
        for (const row of scores.values()) {
          if (row.event_id === eid && row.team_id === tid && row.synced_at === null)
            (row as Record<string, unknown>).sync_attempts = (row.sync_attempts as number) + 1;
        }

      } else if (s.includes('PENDING_SCORES') && s.includes('SYNCED_AT')) {
        const [ts, eid, tid] = params as [string, string, string];
        for (const row of scores.values()) {
          if (row.event_id === eid && row.team_id === tid)
            (row as Record<string, unknown>).synced_at = ts;
        }

      } else if (s.includes('PENDING_SCORES') && s.includes('DELETE')) {
        const [eid, tid] = params as [string, string];
        for (const [k, row] of scores) {
          if (row.event_id === eid && row.team_id === tid) scores.delete(k);
        }
      }
    }),

    getFirstAsync: vi.fn().mockImplementation(async (sql: string, params: unknown[]) => {
      const s = sql.trim().toUpperCase();
      if (s.includes('FROM EVENT_CACHE')) {
        const val = kv.get(params[0] as string);
        return val !== undefined ? { value: val } : null;
      }
      return null;
    }),

    getAllAsync: vi.fn().mockImplementation(async (sql: string, params: unknown[]) => {
      const s = sql.trim().toUpperCase();
      if (s.includes('FROM PENDING_SCORES')) {
        const [eid, tid] = params as [string, string];
        const rows = [...scores.values()].filter(
          r => r.event_id === eid && r.team_id === tid,
        );
        // synced_at IS NULL filter
        const onlyUnsynced = s.includes('SYNCED_AT IS NULL');
        return (onlyUnsynced ? rows.filter(r => r.synced_at === null) : rows)
          .sort((a, b) => (a.hole_number as number) - (b.hole_number as number));
      }
      return [];
    }),

    // expose internals so individual tests can inspect state
    _kv:     kv,
    _scores: scores,
  };

  return { mockDb };
});

vi.mock('../lib/db', () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

import {
  getDeviceId, saveSession, loadSession, clearSession,
  upsertPendingScore, loadPendingScores, loadUnsyncedScores,
  markScoresSynced, incrementSyncAttempts, clearPendingScores,
} from '../lib/store';

import type { JoinEventResponse } from '../lib/api';

const SESSION: JoinEventResponse = {
  event:  { id: 'ev1', name: 'Charity Cup', eventCode: 'ABCD1234', holes: 18,
             format: 'Scramble', startType: 'Shotgun', status: 'Active',
             startAt: null, courseId: null },
  team:   { id: 'tm1', name: 'Eagles', entryFeePaid: false, maxPlayers: 4,
             checkInStatus: 'Pending', players: [], eventId: 'ev1',
             startingHole: null, teeTime: null },
  player: { id: 'pl1', firstName: 'Alice', lastName: 'Smith', email: 'a@b.com',
             checkInStatus: 'Pending', teamId: 'tm1', eventId: 'ev1' },
};

const SCORE = {
  holeNumber: 1, grossScore: 4, putts: 2,
  clientTimestampMs: 1_700_000_000_000,
};

beforeEach(() => {
  mockDb._kv.clear();
  mockDb._scores.clear();
  vi.clearAllMocks();
});

// ── getDeviceId ───────────────────────────────────────────────────────────────

describe('getDeviceId', () => {
  it('generates and stores a device ID on first call', async () => {
    const id = await getDeviceId();
    expect(id).toMatch(/^mob-/);
    expect(mockDb._kv.has('gfp:deviceId')).toBe(true);
  });

  it('returns the same ID on subsequent calls', async () => {
    const id1 = await getDeviceId();
    const id2 = await getDeviceId();
    expect(id1).toBe(id2);
  });
});

// ── saveSession / loadSession / clearSession ──────────────────────────────────

describe('saveSession', () => {
  it('persists the session as JSON', async () => {
    await saveSession(SESSION);
    const raw = mockDb._kv.get('gfp:session');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toMatchObject({ event: { id: 'ev1' } });
  });
});

describe('loadSession', () => {
  it('returns null when no session is stored', async () => {
    expect(await loadSession()).toBeNull();
  });

  it('returns the session that was saved', async () => {
    await saveSession(SESSION);
    const result = await loadSession();
    expect(result?.event.id).toBe('ev1');
    expect(result?.team.name).toBe('Eagles');
  });
});

describe('clearSession', () => {
  it('removes the session so loadSession returns null', async () => {
    await saveSession(SESSION);
    await clearSession();
    expect(await loadSession()).toBeNull();
  });
});

// ── upsertPendingScore ────────────────────────────────────────────────────────

describe('upsertPendingScore', () => {
  it('stores a score that can be retrieved', async () => {
    await upsertPendingScore('ev1', 'tm1', SCORE);
    const rows = await loadPendingScores('ev1', 'tm1');
    expect(rows).toHaveLength(1);
    expect(rows[0].holeNumber).toBe(1);
    expect(rows[0].grossScore).toBe(4);
    expect(rows[0].putts).toBe(2);
  });

  it('replaces an existing score for the same team/hole (upsert semantics)', async () => {
    await upsertPendingScore('ev1', 'tm1', SCORE);
    await upsertPendingScore('ev1', 'tm1', { ...SCORE, grossScore: 5 });
    const rows = await loadPendingScores('ev1', 'tm1');
    expect(rows).toHaveLength(1);
    expect(rows[0].grossScore).toBe(5);
  });

  it('stores scores for different holes independently', async () => {
    await upsertPendingScore('ev1', 'tm1', SCORE);
    await upsertPendingScore('ev1', 'tm1', { ...SCORE, holeNumber: 2, grossScore: 3 });
    const rows = await loadPendingScores('ev1', 'tm1');
    expect(rows).toHaveLength(2);
  });

  it('isolates scores by team', async () => {
    await upsertPendingScore('ev1', 'tm1', SCORE);
    await upsertPendingScore('ev1', 'tm2', { ...SCORE, grossScore: 6 });
    const tm1 = await loadPendingScores('ev1', 'tm1');
    const tm2 = await loadPendingScores('ev1', 'tm2');
    expect(tm1[0].grossScore).toBe(4);
    expect(tm2[0].grossScore).toBe(6);
  });
});

// ── loadUnsyncedScores ────────────────────────────────────────────────────────

describe('loadUnsyncedScores', () => {
  it('returns only unsynced rows', async () => {
    await upsertPendingScore('ev1', 'tm1', SCORE);
    await upsertPendingScore('ev1', 'tm1', { ...SCORE, holeNumber: 2 });
    await markScoresSynced('ev1', 'tm1'); // marks all synced
    // re-add hole 3 (unsynced)
    await upsertPendingScore('ev1', 'tm1', { ...SCORE, holeNumber: 3 });
    const unsynced = await loadUnsyncedScores('ev1', 'tm1');
    expect(unsynced.every(s => s.holeNumber === 3)).toBe(true);
  });
});

// ── markScoresSynced ──────────────────────────────────────────────────────────

describe('markScoresSynced', () => {
  it('makes all scores for the team disappear from loadUnsyncedScores', async () => {
    await upsertPendingScore('ev1', 'tm1', SCORE);
    await upsertPendingScore('ev1', 'tm1', { ...SCORE, holeNumber: 2 });
    await markScoresSynced('ev1', 'tm1');
    expect(await loadUnsyncedScores('ev1', 'tm1')).toHaveLength(0);
  });

  it('does not affect a different team', async () => {
    await upsertPendingScore('ev1', 'tm1', SCORE);
    await upsertPendingScore('ev1', 'tm2', SCORE);
    await markScoresSynced('ev1', 'tm1');
    expect(await loadUnsyncedScores('ev1', 'tm2')).toHaveLength(1);
  });
});

// ── incrementSyncAttempts ─────────────────────────────────────────────────────

describe('incrementSyncAttempts', () => {
  it('increments the attempt counter on all unsynced rows', async () => {
    await upsertPendingScore('ev1', 'tm1', SCORE);
    await incrementSyncAttempts('ev1', 'tm1');
    const row = mockDb._scores.get('tm1:1');
    expect(row?.sync_attempts).toBe(1);
  });

  it('does not increment already-synced rows', async () => {
    await upsertPendingScore('ev1', 'tm1', SCORE);
    await markScoresSynced('ev1', 'tm1');
    await incrementSyncAttempts('ev1', 'tm1');
    const row = mockDb._scores.get('tm1:1');
    expect(row?.sync_attempts).toBe(0); // stays 0 — synced row excluded
  });
});

// ── clearPendingScores ────────────────────────────────────────────────────────

describe('clearPendingScores', () => {
  it('removes all scores for the team', async () => {
    await upsertPendingScore('ev1', 'tm1', SCORE);
    await upsertPendingScore('ev1', 'tm1', { ...SCORE, holeNumber: 2 });
    await clearPendingScores('ev1', 'tm1');
    expect(await loadPendingScores('ev1', 'tm1')).toHaveLength(0);
  });

  it('does not affect a different team', async () => {
    await upsertPendingScore('ev1', 'tm1', SCORE);
    await upsertPendingScore('ev1', 'tm2', SCORE);
    await clearPendingScores('ev1', 'tm1');
    expect(await loadPendingScores('ev1', 'tm2')).toHaveLength(1);
  });
});
