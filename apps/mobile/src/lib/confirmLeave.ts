import { notify } from './notify';

/**
 * Holes finished on this device that the server hasn't confirmed yet.
 * Leaving an event deletes them, so the confirmation calls them out.
 */
export function unsyncedHoleCount(completedHoles: Set<number>, syncedHoles: Set<number>): number {
  let n = 0;
  for (const h of completedHoles) if (!syncedHoles.has(h)) n++;
  return n;
}

/** The confirmation body: a warning when scores would be lost, else how to get back. */
export function leaveEventMessage(unsyncedHoles: number): string {
  if (unsyncedHoles > 0) {
    const holes = unsyncedHoles === 1 ? '1 hole' : `${unsyncedHoles} holes`;
    return `Scores for ${holes} haven't synced yet and will be deleted from this device. ` +
      'Sync first if you want to keep them.';
  }
  return 'You can rejoin later with your event code and email.';
}

/**
 * Every "Leave Event" / "Change Event" button goes through this, so a stray tap
 * mid-round can't drop the golfer's event (and unsynced scores) without a
 * second, deliberate choice.
 */
export function confirmLeaveEvent(onLeave: () => void, unsyncedHoles = 0): void {
  notify('Leave this event?', leaveEventMessage(unsyncedHoles), [
    { text: 'Stay', style: 'cancel' },
    { text: 'Leave Event', style: 'destructive', onPress: onLeave },
  ]);
}
