import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock() factories are hoisted to run before any import/const declarations.
// Use vi.hoisted() to create the mock functions first so the factories can
// reference them without hitting the temporal dead zone.
const {
  mockLoadSession,
  mockGetDeviceId,
  mockLoadUnsynced,
  mockMarkSynced,
  mockIncrementAttempts,
  mockBatchSync,
} = vi.hoisted(() => ({
  mockLoadSession:       vi.fn(),
  mockGetDeviceId:       vi.fn(),
  mockLoadUnsynced:      vi.fn(),
  mockMarkSynced:        vi.fn(),
  mockIncrementAttempts: vi.fn(),
  mockBatchSync:         vi.fn(),
}));

// Use relative paths (not @/ alias) so Vitest resolves to the same absolute
// path as backgroundSync.ts's own './store' and './api' relative imports.
vi.mock('../lib/store', () => ({
  loadSession:           mockLoadSession,
  getDeviceId:           mockGetDeviceId,
  loadUnsyncedScores:    mockLoadUnsynced,
  markScoresSynced:      mockMarkSynced,
  incrementSyncAttempts: mockIncrementAttempts,
}));

vi.mock('../lib/api', () => ({
  batchSync: mockBatchSync,
}));

vi.mock('expo-task-manager', () => ({
  defineTask:              vi.fn(),
  isTaskRegisteredAsync:   vi.fn().mockResolvedValue(false),
}));

vi.mock('expo-background-fetch', () => ({
  registerTaskAsync:   vi.fn().mockResolvedValue(undefined),
  unregisterTaskAsync: vi.fn().mockResolvedValue(undefined),
  BackgroundFetchResult: { NewData: 'newData', NoData: 'noData', Failed: 'failed' },
}));

import { attemptSync, registerBackgroundSync, TASK_NAME, __resetSyncState } from '../lib/backgroundSync';
import * as TaskManager from 'expo-task-manager';

const SESSION = {
  event: { id: 'ev1' }, team: { id: 'tm1' },
} as any;

const SCORES = [
  { holeNumber: 1, grossScore: 4, putts: 2, clientTimestampMs: 1_700_000_000_000 },
];

const SYNC_OK = { accepted: 1, conflicts: 0, conflictDetails: [] };

beforeEach(() => {
  // Reset in-module state (isSyncing, consecutiveFails, lastAttemptMs = 0).
  // With lastAttemptMs = 0, Date.now() - 0 >> 30 000 ms so the backoff check
  // always passes at the start of each test without any time-mocking.
  __resetSyncState();
  vi.clearAllMocks();
  mockLoadSession.mockResolvedValue(SESSION);
  mockGetDeviceId.mockResolvedValue('dev-001');
  mockLoadUnsynced.mockResolvedValue([]);
  mockMarkSynced.mockResolvedValue(undefined);
  mockIncrementAttempts.mockResolvedValue(undefined);
  mockBatchSync.mockResolvedValue(SYNC_OK);
});

// ── attemptSync ───────────────────────────────────────────────────────────────

describe('attemptSync', () => {
  it('returns false when there is no session', async () => {
    mockLoadSession.mockResolvedValueOnce(null);
    const result = await attemptSync();
    expect(result).toBe(false);
    expect(mockBatchSync).not.toHaveBeenCalled();
  });

  it('returns false when there are no unsynced scores', async () => {
    mockLoadUnsynced.mockResolvedValueOnce([]);
    const result = await attemptSync();
    expect(result).toBe(false);
    expect(mockBatchSync).not.toHaveBeenCalled();
  });

  it('returns true when scores are accepted by the server', async () => {
    mockLoadUnsynced.mockResolvedValueOnce(SCORES);
    mockBatchSync.mockResolvedValueOnce({ accepted: 1, conflicts: 0, conflictDetails: [] });
    const result = await attemptSync();
    expect(result).toBe(true);
    expect(mockMarkSynced).toHaveBeenCalledWith('ev1', 'tm1');
  });

  it('returns true when the server reports conflicts (conflict = server resolved it)', async () => {
    mockLoadUnsynced.mockResolvedValueOnce(SCORES);
    mockBatchSync.mockResolvedValueOnce({ accepted: 0, conflicts: 1, conflictDetails: [] });
    const result = await attemptSync();
    expect(result).toBe(true);
    expect(mockMarkSynced).toHaveBeenCalled();
  });

  it('returns false when server accepts 0 and has 0 conflicts', async () => {
    mockLoadUnsynced.mockResolvedValueOnce(SCORES);
    mockBatchSync.mockResolvedValueOnce({ accepted: 0, conflicts: 0, conflictDetails: [] });
    const result = await attemptSync();
    expect(result).toBe(false);
    expect(mockMarkSynced).not.toHaveBeenCalled();
  });

  it('returns false and does not throw when batchSync throws a network error', async () => {
    mockLoadUnsynced.mockResolvedValueOnce(SCORES);
    mockBatchSync.mockRejectedValueOnce(new Error('Network error'));
    const result = await attemptSync();
    expect(result).toBe(false);
  });

  it('increments sync_attempts before calling the API', async () => {
    mockLoadUnsynced.mockResolvedValueOnce(SCORES);
    const callOrder: string[] = [];
    mockIncrementAttempts.mockImplementation(() => { callOrder.push('increment'); return Promise.resolve(); });
    mockBatchSync.mockImplementation(() => { callOrder.push('sync'); return Promise.resolve(SYNC_OK); });
    await attemptSync();
    expect(callOrder).toEqual(['increment', 'sync']);
  });

  it('prevents concurrent sync runs (mutex)', async () => {
    mockLoadUnsynced.mockResolvedValue(SCORES);

    // The mock executor runs synchronously when batchSync() is invoked, at which
    // point resolveFirst is assigned and firstSyncStarted resolves.
    let resolveFirst!: () => void;
    const firstSyncStarted = new Promise<void>(signalReady => {
      mockBatchSync.mockImplementationOnce(
        () => new Promise<typeof SYNC_OK>(syncResolve => {
          resolveFirst = () => syncResolve(SYNC_OK);
          signalReady();
        }),
      );
    });

    // p1 runs synchronously up to its first await, setting isSyncing = true.
    const p1 = attemptSync();
    // p2 sees isSyncing = true at line 1 of attemptSync and returns false immediately.
    const p2 = attemptSync();

    // Suspend test until p1 has progressed through its await chain to batchSync().
    await firstSyncStarted;
    resolveFirst();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect([r1, r2]).toContain(false);
    expect(mockBatchSync).toHaveBeenCalledTimes(1);
  });
});

// ── registerBackgroundSync ────────────────────────────────────────────────────

describe('registerBackgroundSync', () => {
  it('does not re-register when task is already registered', async () => {
    (TaskManager.isTaskRegisteredAsync as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(true);
    await registerBackgroundSync();
    const { registerTaskAsync } = await import('expo-background-fetch');
    expect(registerTaskAsync).not.toHaveBeenCalled();
  });

  it('registers the task when not already registered', async () => {
    (TaskManager.isTaskRegisteredAsync as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(false);
    await registerBackgroundSync();
    const { registerTaskAsync } = await import('expo-background-fetch');
    expect(registerTaskAsync).toHaveBeenCalledWith(TASK_NAME, expect.objectContaining({
      minimumInterval: 30,
      stopOnTerminate: false,
    }));
  });

  it('does not throw when registration fails (non-critical path)', async () => {
    (TaskManager.isTaskRegisteredAsync as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('OS error'));
    await expect(registerBackgroundSync()).resolves.not.toThrow();
  });
});

// ── backoff behaviour ─────────────────────────────────────────────────────────

describe('attemptSync backoff', () => {
  it('is throttled by the minimum interval after a successful sync', async () => {
    mockLoadUnsynced.mockResolvedValue(SCORES);

    // First call: lastAttemptMs = 0, so Date.now() - 0 >> 30 000 → passes.
    const r1 = await attemptSync();
    expect(r1).toBe(true);

    // Immediate second call: both calls happen in the same JS tick, so the
    // real-time delta is microseconds << 30 000 ms → throttled.
    const r2 = await attemptSync();
    expect(r2).toBe(false);
    expect(mockBatchSync).toHaveBeenCalledTimes(1);
  });
});
