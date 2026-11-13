import type { HoleShots } from '@gfp/shared-types';
import type { PlayerShotBreakdown, PlayerShotEntry } from './api';

/**
 * Returns the ordered list of hole numbers for a round, accounting for
 * shotgun starts that begin mid-course.
 *
 * Example: startingHole=10, totalHoles=18 → [10,11,...,18,1,2,...,9]
 */
export function getHoleOrder(startingHole: number | null, totalHoles: number): number[] {
  if (!startingHole) return Array.from({ length: totalHoles }, (_, i) => i + 1);
  return Array.from({ length: totalHoles }, (_, i) => ((startingHole - 1 + i) % totalHoles) + 1);
}

/** True when the golfer's shots are a total the organizer typed in admin (no split). */
export function isAdminTotal(entry: PlayerShotEntry | undefined): entry is number {
  return typeof entry === 'number';
}

/** A golfer's strokes on the hole, whichever shape they were recorded in. */
export function shotTotal(entry: PlayerShotEntry | undefined): number {
  if (entry === undefined) return 0;
  return isAdminTotal(entry) ? entry : entry.drive + entry.approach + entry.putt;
}

/** The split a golfer's entry edits as; an admin total has none, so it reads as empty. */
export function toBreakdown(entry: PlayerShotEntry | undefined): PlayerShotBreakdown {
  return entry === undefined || isAdminTotal(entry)
    ? { drive: 0, approach: 0, putt: 0 }
    : entry;
}

/**
 * Opens an organizer-entered total for editing as a drive/approach split that
 * keeps the same total (one drive, the rest approach), so tapping Edit alone
 * never changes the team's score. The golfer then moves strokes between
 * columns; only a changed total goes to the organizer for approval.
 */
export function splitAdminTotal(total: number): PlayerShotBreakdown {
  return total <= 0
    ? { drive: 0, approach: 0, putt: 0 }
    : { drive: 1, approach: total - 1, putt: 0 };
}

/** Per-golfer strokes on a hole — the shape the format rules read (U8). */
export function strokesByPlayer(
  breakdown: Record<string, PlayerShotEntry> | undefined,
): HoleShots {
  const out: HoleShots = {};
  for (const [id, e] of Object.entries(breakdown ?? {})) out[id] = shotTotal(e);
  return out;
}
