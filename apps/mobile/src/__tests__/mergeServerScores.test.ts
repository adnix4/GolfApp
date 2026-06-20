import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── in-memory SQLite mock tailored to mergeServerScores ────────────────────────
// Implements just enough of the SQLiteDatabase surface that mergeServerScores
// and loadPendingScores touch: a getFirstAsync id-lookup, the merge
// INSERT OR REPLACE, and the loadPendingScores list query.

type Row = {
  id: string; event_id: string; team_id: string; hole_number: number;
  gross_score: number; putts: number | null; player_shots: string | null;
  created_at: string; synced_at: string | null; completed_at: string | null;
  sync_attempts: number; conflict: number;
};

const { mockDb } = vi.hoisted(() => {
  const scores = new Map<string, Row>();

  const mockDb = {
    execAsync: vi.fn().mockResolvedValue(undefined),

    runAsync: vi.fn().mockImplementation(async (sql: string, params: unknown[]) => {
      const s = sql.toUpperCase();
      // The merge upsert is the only INSERT mergeServerScores issues; its column
      // list includes "conflict", which the legacy upsert does not.
      if (s.includes('PENDING_SCORES') && s.includes('INSERT') && s.includes('CONFLICT')) {
        const [id, event_id, team_id, hole_number, gross_score, putts, created_at, synced_at, completed_at, conflict] =
          params as [string, string, string, number, number, number | null, string, string, string, number];
        scores.set(id, {
          id, event_id, team_id, hole_number, gross_score, putts,
          player_shots: null, created_at, synced_at, completed_at,
          sync_attempts: 0, conflict,
        });
      }
    }),

    getFirstAsync: vi.fn().mockImplementation(async (sql: string, params: unknown[]) => {
      const s = sql.toUpperCase();
      if (s.includes('FROM PENDING_SCORES') && s.includes('WHERE ID')) {
        const row = scores.get(params[0] as string);
        return row
          ? { gross_score: row.gross_score, conflict: row.conflict, synced_at: row.synced_at }
          : null;
      }
      return null;
    }),

    getAllAsync: vi.fn().mockImplementation(async (sql: string, params: unknown[]) => {
      const s = sql.toUpperCase();
      if (s.includes('FROM PENDING_SCORES')) {
        const [eid, tid] = params as [string, string];
        return [...scores.values()]
          .filter(r => r.event_id === eid && r.team_id === tid)
          .sort((a, b) => a.hole_number - b.hole_number)
          .map(r => ({
            hole_number: r.hole_number, gross_score: r.gross_score, putts: r.putts,
            player_shots: r.player_shots, created_at: r.created_at, conflict: r.conflict,
          }));
      }
      return [];
    }),

    _scores: scores,
  };

  return { mockDb };
});

vi.mock('../lib/db', () => ({ getDb: vi.fn().mockResolvedValue(mockDb) }));

import { mergeServerScores, loadPendingScores } from '../lib/store';

function seed(partial: Partial<Row> & { hole_number: number }) {
  const id = `tm1:${partial.hole_number}`;
  mockDb._scores.set(id, {
    id, event_id: 'ev1', team_id: 'tm1', gross_score: 4, putts: null,
    player_shots: null, created_at: '2026-01-01T00:00:00.000Z',
    synced_at: '2026-01-01T00:00:00.000Z', completed_at: '2026-01-01T00:00:00.000Z',
    sync_attempts: 0, conflict: 0, ...partial,
  });
}

beforeEach(() => {
  mockDb._scores.clear();
  vi.clearAllMocks();
});

describe('mergeServerScores', () => {
  it('inserts authoritative server scores for holes with no local row', async () => {
    const changed = await mergeServerScores('ev1', 'tm1', [
      { holeNumber: 1, grossScore: 5, putts: 2, isConflicted: false },
    ]);
    expect(changed).toBe(true);

    const rows = await loadPendingScores('ev1', 'tm1');
    expect(rows).toHaveLength(1);
    expect(rows[0].grossScore).toBe(5);
    expect(rows[0].conflict).toBe(false);

    // Marked synced + completed so it renders as a confirmed score.
    const row = mockDb._scores.get('tm1:1')!;
    expect(row.synced_at).not.toBeNull();
    expect(row.completed_at).not.toBeNull();
  });

  it('overwrites a synced local row when the admin changed the value', async () => {
    seed({ hole_number: 1, gross_score: 4 }); // synced (default)
    const changed = await mergeServerScores('ev1', 'tm1', [
      { holeNumber: 1, grossScore: 7, putts: null, isConflicted: false },
    ]);
    expect(changed).toBe(true);
    expect(mockDb._scores.get('tm1:1')!.gross_score).toBe(7);
  });

  it('protects an unsynced local edit (keeps the golfer value)', async () => {
    seed({ hole_number: 1, gross_score: 4, synced_at: null, completed_at: null });
    const changed = await mergeServerScores('ev1', 'tm1', [
      { holeNumber: 1, grossScore: 9, putts: null, isConflicted: false },
    ]);
    expect(changed).toBe(false);
    expect(mockDb._scores.get('tm1:1')!.gross_score).toBe(4); // unchanged
  });

  it('flags a hole as conflicted when the server reports a pending approval', async () => {
    seed({ hole_number: 1, gross_score: 4 });
    const changed = await mergeServerScores('ev1', 'tm1', [
      { holeNumber: 1, grossScore: 4, putts: null, isConflicted: true },
    ]);
    expect(changed).toBe(true);

    const rows = await loadPendingScores('ev1', 'tm1');
    expect(rows[0].conflict).toBe(true);
  });

  it('returns false when nothing changed (already in sync)', async () => {
    seed({ hole_number: 1, gross_score: 4, conflict: 0 });
    const changed = await mergeServerScores('ev1', 'tm1', [
      { holeNumber: 1, grossScore: 4, putts: null, isConflicted: false },
    ]);
    expect(changed).toBe(false);
  });
});
