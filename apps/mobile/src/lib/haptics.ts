import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// Score-entry haptics. Fire-and-forget, in the same handler that changes what
// is on screen, and never the only feedback: haptics are off system-wide for
// many golfers and silent on a lot of Android hardware. Web has no haptics.

/** A shot stepper ticked up or down. */
export function tickHaptic(): void {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => {});
}

/** A hole was saved as complete. */
export function holeCompleteHaptic(): void {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/**
 * Someone else's hole-in-one arrived on the live leaderboard. Not used for the
 * golfer's own ace: Complete Hole has already buzzed for that one.
 */
export function holeInOneAlertHaptic(): void {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
