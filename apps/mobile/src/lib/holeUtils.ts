import type { HoleShots } from '@gfp/shared-types';
import type { PlayerShotBreakdown } from './api';

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

/** Per-golfer strokes on a hole — the shape the format rules read (U8). */
export function strokesByPlayer(
  breakdown: Record<string, PlayerShotBreakdown> | undefined,
): HoleShots {
  const out: HoleShots = {};
  for (const [id, b] of Object.entries(breakdown ?? {})) out[id] = b.drive + b.approach + b.putt;
  return out;
}
