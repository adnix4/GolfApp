import { AppState, type AppStateStatus } from 'react-native';

/**
 * Foreground gating for recurring polls.
 *
 * A golfer's phone in a pocket, or a hidden browser tab running the web build,
 * has nobody looking at it. Polling then only costs battery and server
 * requests, so the status polls skip their tick while the app is backgrounded
 * and catch up the moment it returns. React Native Web maps AppState to page
 * visibility, so this covers a hidden tab too.
 *
 * Score sync is NOT gated by this: backgroundSync.ts has its own path, so an
 * offline-queued score still goes out whenever the device can send it.
 */
export function isForeground(): boolean {
  // currentState can be 'unknown' / null briefly at launch: treat that as
  // foreground so the first poll is never skipped.
  const state = AppState.currentState as AppStateStatus | null;
  return state !== 'background' && state !== 'inactive';
}

/**
 * Calls `fn` each time the app comes back to the foreground. Returns the
 * unsubscribe function, so it drops straight into a useEffect cleanup.
 */
export function onForeground(fn: () => void): () => void {
  const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'active') fn();
  });
  return () => sub.remove();
}
