import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Platform } from 'react-native';

// ── Web shim end-to-end (problemList A5) ──────────────────────────────────────
// The old webDb stub silently no-oped pending_scores, so on web every score
// entry vanished while the sync bar claimed "synced". These tests run the REAL
// store.ts functions against the REAL db.ts web shim (Platform.OS forced to
// 'web', localStorage polyfilled) — no db mock, unlike store.test.ts.

// Minimal localStorage for the node test environment.
function makeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem:    (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem:    (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear:      () => { m.clear(); },
  };
}

beforeAll(() => {
  // Must happen BEFORE the first getDb() call — db.ts caches the choice.
  (Platform as { OS: string }).OS = 'web';
  (globalThis as Record<string, unknown>).localStorage = makeLocalStorage();
});

beforeEach(() => {
  (globalThis as { localStorage: ReturnType<typeof makeLocalStorage> }).localStorage.clear();
});

const EVENT = 'evt-1';
const TEAM  = 'team-1';

function score(hole: number, gross: number, extra: Partial<{ putts: number | null }> = {}) {
  return {
    holeNumber: hole,
    grossScore: gross,
    putts: extra.putts ?? null,
    clientTimestampMs: Date.now(),
  };
}

describe('webDb pending_scores shim', () => {
  it('round-trips an entered score (upsert → load)', async () => {
    const store = await import('../lib/store');
    const shots = { p1: { drive: 1, approach: 1, putt: 2 } };
    await store.upsertPendingScore(EVENT, TEAM, { ...score(3, 5), playerShots: shots });
    await store.upsertPendingScore(EVENT, TEAM, score(1, 4));

    const rows = await store.loadPendingScores(EVENT, TEAM);
    expect(rows.map(r => r.holeNumber)).toEqual([1, 3]);   // ORDER BY hole_number
    expect(rows[1].grossScore).toBe(5);
    expect(rows[1].playerShots).toEqual(shots);
    expect(rows[1].conflict).toBe(false);
  });

  it('upsert replaces the same hole instead of duplicating', async () => {
    const store = await import('../lib/store');
    await store.upsertPendingScore(EVENT, TEAM, score(7, 6));
    await store.upsertPendingScore(EVENT, TEAM, score(7, 4));

    const rows = await store.loadPendingScores(EVENT, TEAM);
    expect(rows).toHaveLength(1);
    expect(rows[0].grossScore).toBe(4);
  });

  it('sync lifecycle: complete → unsynced → synced', async () => {
    const store = await import('../lib/store');
    await store.upsertPendingScore(EVENT, TEAM, score(1, 4));
    await store.upsertPendingScore(EVENT, TEAM, score(2, 5));

    // Nothing completed yet → nothing eligible for sync.
    expect(await store.loadUnsyncedScores(EVENT, TEAM)).toHaveLength(0);

    await store.markHoleComplete(EVENT, TEAM, 1);
    expect(await store.loadCompletedHoleNumbers(EVENT, TEAM)).toEqual([1]);
    expect((await store.loadUnsyncedScores(EVENT, TEAM)).map(s => s.holeNumber)).toEqual([1]);

    await store.markScoresSynced(EVENT, TEAM);
    expect(await store.loadUnsyncedScores(EVENT, TEAM)).toHaveLength(0);
    // Still present for the scorecard.
    expect(await store.loadPendingScores(EVENT, TEAM)).toHaveLength(2);
  });

  it('incrementSyncAttempts touches only completed+unsynced rows', async () => {
    const store = await import('../lib/store');
    await store.upsertPendingScore(EVENT, TEAM, score(1, 4));
    await store.upsertPendingScore(EVENT, TEAM, score(2, 5));
    await store.markHoleComplete(EVENT, TEAM, 1);
    await store.incrementSyncAttempts(EVENT, TEAM);

    const raw = JSON.parse(localStorage.getItem('gfp:pending_scores')!) as
      { hole_number: number; sync_attempts: number }[];
    expect(raw.find(r => r.hole_number === 1)!.sync_attempts).toBe(1);
    expect(raw.find(r => r.hole_number === 2)!.sync_attempts).toBe(0);
  });

  it('mergeServerScores adopts server values but protects unpushed local edits', async () => {
    const store = await import('../lib/store');
    // Local unpushed edit on hole 1; hole 2 unknown locally.
    await store.upsertPendingScore(EVENT, TEAM, score(1, 4));

    const changed = await store.mergeServerScores(EVENT, TEAM, [
      { holeNumber: 1, grossScore: 9, putts: null, isConflicted: false },
      { holeNumber: 2, grossScore: 3, putts: 1,   isConflicted: true },
    ]);

    expect(changed).toBe(true);
    const rows = await store.loadPendingScores(EVENT, TEAM);
    expect(rows.find(r => r.holeNumber === 1)!.grossScore).toBe(4);  // protected
    const h2 = rows.find(r => r.holeNumber === 2)!;
    expect(h2.grossScore).toBe(3);                                    // adopted
    expect(h2.conflict).toBe(true);
  });

  it('clearPendingScores removes only that event/team', async () => {
    const store = await import('../lib/store');
    await store.upsertPendingScore(EVENT, TEAM, score(1, 4));
    await store.upsertPendingScore(EVENT, 'team-2', score(1, 5));

    await store.clearPendingScores(EVENT, TEAM);
    expect(await store.loadPendingScores(EVENT, TEAM)).toHaveLength(0);
    expect(await store.loadPendingScores(EVENT, 'team-2')).toHaveLength(1);
  });

  it('scores persist across a page reload (fresh read of localStorage)', async () => {
    const store = await import('../lib/store');
    await store.upsertPendingScore(EVENT, TEAM, score(9, 3));
    // A reload re-reads localStorage — the shim keeps no in-memory row state,
    // so the same query straight after proves durability of the stored JSON.
    expect(JSON.parse(localStorage.getItem('gfp:pending_scores')!)).toHaveLength(1);
    expect((await store.loadPendingScores(EVENT, TEAM))[0].grossScore).toBe(3);
  });

  it('event_cache session storage still works alongside scores', async () => {
    const store = await import('../lib/store');
    const id = await store.getDeviceId();
    expect(await store.getDeviceId()).toBe(id);  // stable across calls
  });

  it('unrecognized SQL throws instead of silently no-oping', async () => {
    const { getDb } = await import('../lib/db');
    const db = await getDb();
    await expect(db.runAsync('UPDATE pending_scores SET putts = putts * 2 WHERE id = ?', ['x']))
      .rejects.toThrow(/unsupported/i);
    await expect(db.getAllAsync('SELECT * FROM leaderboard_cache', []))
      .rejects.toThrow(/unsupported/i);
  });
});
