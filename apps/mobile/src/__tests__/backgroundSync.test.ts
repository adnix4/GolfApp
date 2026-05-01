import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all external dependencies before importing the module under test
vi.mock('expo-task-manager', () => ({
  defineTask:              vi.fn(),
  isTaskRegisteredAsync:   vi.fn().mockResolvedValue(false),
}));

vi.mock('expo-background-fetch', () => ({
  registerTaskAsync:   vi.fn().mockResolvedValue(undefined),
  unregisterTaskAsync: vi.fn().mockResolvedValue(undefined),
  BackgroundFetchResult: { NewData: 'newData', NoData: 'noData', Failed: 'failed' },
}));

const mockLoadSession      = vi.fn();
const mockGetDeviceId      = vi.fn();
const mockLoadUnsynced     = vi.fn();
const mockMarkSynced       = vi.fn();
const mockIncrementAttempts = vi.fn();
const mockBatchSync        = vi.fn();

vi.mock('@/lib/store', () => ({
  loadSession:           mockLoadSession,
  getDeviceId:           mockGetDeviceId,
  loadUnsyncedScores:    mockLoadUnsynced,
  markScoresSynced:      mockMarkSynced,
  incrementSyncAttempts: mockIncrementAttempts,
}));

vi.mock('@/lib/api', () => ({
  batchSync: mockBatchSync,
}));

import { attemptSync, registerBackgroundSync, TASK_NAME } from '../lib/backgroundSync';
import * as TaskManager from 'expo-task-manager';

const SESSION = {
  event: { id: 'ev1' }, team: { id: 'tm1' },
} as any;

const SCORES = [
  { holeNumber: 1, grossScore: 4, putts: 2, clientTimestampMs: 1_700_000_000_000 },
];

const SYNC_OK = { accepted: 1, conflicts: 0, conflictDetails: [] };

// Advance fake time by 1 000 000 ms (≫ 480 s backoff cap) before each test so that
// the module-level `lastAttemptMs` left by the previous test never blocks the next one.
// Tests that need to verify throttling control time within the test body.
let fakeNow = 2_000_000_000_000;

beforeEach(() => {
  fakeNow += 1_000_000;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(fakeNow));
  vi.clearAllMocks();
  mockLoadSession.mockResolvedValue(SESSION);
  mockGetDeviceId.mockResolvedValue('dev-001');
  mockLoadUnsynced.mockResolvedValue([]);
  mockMarkSynced.mockResolvedValue(undefined);
  mockIncrementAttempts.mockResolvedValue(undefined);
  mockBatchSync.mockResolvedValue(SYNC_OK);
});

afterEach(() => {
  vi.useRealTimers();
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

    // Capture resolve handle only after batchSync is actually called —
    // the mock executor runs synchronously when batchSync() is invoked,
    // at which point resolveFirst is assigned and firstSyncStarted resolves.
    let resolveFirst!: () => void;
    const firstSyncStarted = new Promise<void>(signalReady => {
      mockBatchSync.mockImplementationOnce(
        () => new Promise<typeof SYNC_OK>(syncResolve => {
          resolveFirst = () => syncResolve(SYNC_OK);
          signalReady();
        }),
      );
    });

    // p1 runs synchronously up to the first await, setting isSyncing = true.
    const p1 = attemptSync();
    // p2 sees isSyncing = true immediately and returns false without awaiting.
    const p2 = attemptSync();

    // Wait until attemptSync has progressed far enough to call batchSync.
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

    // First call — time is frozen at fakeNow, lastAttemptMs is far in the past → succeeds
    const r1 = await attemptSync();
    expect(r1).toBe(true);

    // Immediate second call — Date.now() still returns fakeNow, so
    // Date.now() - lastAttemptMs = 0 < backoffMs(0) = 30 000 → throttled
    const r2 = await attemptSync();
    expect(r2).toBe(false);
    expect(mockBatchSync).toHaveBeenCalledTimes(1);
  });
});
