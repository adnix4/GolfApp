import { Platform } from 'react-native';
import * as TaskManager  from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import {
  getDeviceId, loadSession,
  loadUnsyncedScores, markScoresSynced, incrementSyncAttempts,
} from './store';
import { batchSync } from './api';

export const TASK_NAME = 'GFP_BACKGROUND_SYNC';

// ── In-memory backoff state ───────────────────────────────────────────────────
// Resets on app restart; the mutex prevents concurrent sync runs.

let isSyncing        = false;
let consecutiveFails = 0;
let lastAttemptMs    = 0;

/** Resets module-level sync state. Only used in tests. */
export function __resetSyncState(): void {
  isSyncing = false; consecutiveFails = 0; lastAttemptMs = 0;
}

function backoffMs(): number {
  // 30 s → 60 s → 120 s → 240 s → 480 s (8 min cap)
  return Math.min(30_000 * Math.pow(2, consecutiveFails), 480_000);
}

// ── Core sync logic ───────────────────────────────────────────────────────────

/**
 * Drains pending_scores WHERE synced_at IS NULL.
 * Returns true when at least one score was accepted or a conflict resolved.
 * Safe to call from both the in-app foreground timer and the OS background task.
 */
export async function attemptSync(): Promise<boolean> {
  if (isSyncing) return false;
  if (Date.now() - lastAttemptMs < backoffMs()) return false;

  isSyncing     = true;
  lastAttemptMs = Date.now();

  try {
    const [session, deviceId] = await Promise.all([loadSession(), getDeviceId()]);
    if (!session) { isSyncing = false; return false; }

    const { event, team } = session;
    const unsynced = await loadUnsyncedScores(event.id, team.id);
    if (unsynced.length === 0) { isSyncing = false; return false; }

    await incrementSyncAttempts(event.id, team.id);
    const result = await batchSync(event.id, team.id, deviceId, unsynced);

    // Accept conflicts as "resolved by server" — mark synced so we don't retry
    if (result.accepted > 0 || result.conflicts > 0) {
      await markScoresSynced(event.id, team.id);
      consecutiveFails = 0;
      isSyncing = false;
      return true;
    }

    isSyncing = false;
    return false;
  } catch {
    consecutiveFails++;
    isSyncing = false;
    return false;
  }
}

// ── Task Manager registration ─────────────────────────────────────────────────

/**
 * Must be called at module level in app/_layout.tsx — before any component
 * renders. This satisfies expo-task-manager's requirement that defineTask()
 * runs synchronously during module initialisation.
 */
export function defineBackgroundSyncTask(): void {
  if (Platform.OS === 'web') return;
  TaskManager.defineTask(TASK_NAME, async () => {
    const synced = await attemptSync();
    return synced
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  });
}

/**
 * Registers the periodic OS background task. Call once inside a useEffect
 * after the root layout mounts. Safe to call multiple times — skips if
 * already registered.
 */
export async function registerBackgroundSync(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (registered) return;
    await BackgroundFetch.registerTaskAsync(TASK_NAME, {
      minimumInterval: 30,    // 30 s floor; iOS/Android may enforce longer intervals
      stopOnTerminate: false, // keep running after the user swipes the app away
      startOnBoot:     false,
    });
  } catch {
    // Not critical — in-app foreground timer handles the common case
  }
}

export async function unregisterBackgroundSync(): Promise<void> {
  try { await BackgroundFetch.unregisterTaskAsync(TASK_NAME); } catch { /* not critical */ }
}
