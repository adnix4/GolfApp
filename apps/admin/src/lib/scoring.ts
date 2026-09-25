/**
 * Scoring helpers for the admin scoring screen.
 *
 * Kept out of the screen so the arithmetic is testable — same reasoning as
 * checkIn.ts and eventStatus.ts.
 */
import { teamHoleGross, aceGolferIds, type HoleShots } from '@gfp/shared-types';

// Aces are golfers at 1 on their own ball; in a scramble, the team row at 1.
export { aceGolferIds };
export type { HoleShots };

/**
 * Per-golfer counts on a hole, keyed by player id. What a count MEANS depends
 * on the event's format (U8 — packages/shared-types/src/formatScoring.ts):
 *
 * In a scramble everyone hits from the same spot but only the shot the team
 * plays gets recorded, credited to that golfer. So the count is "shots of
 * yours the team used", which is why the counts sum to the team score. A team
 * scoring 4 might read { ann: 2, bo: 1, cal: 1 }.
 *
 * In every other format each golfer plays their own ball and the count is
 * their own strokes. Best Ball takes the lowest; Stroke and Stableford keep
 * each golfer's number (the team row holds the aggregate).
 */
export function sumPlayerShots(shots: HoleShots | undefined): number {
  if (!shots) return 0;
  return Object.values(shots).reduce((total, n) => total + n, 0);
}

/**
 * The team's gross score for a hole under the event's format.
 *
 * U1: the recorded strokes drive the team score, so entering them has to move
 * the total. This previously read `existingGross ?? playerTotal`, so the first
 * saved score won permanently: every later +/- updated the golfer's own row
 * and left the team total stale, which is what "the strokes don't add in"
 * meant. U8: *how* they drive it is the format's call — a Best Ball hole is
 * the lowest golfer, not the sum. The API recomputes the same way on save, so
 * this is the preview the desk sees while typing.
 *
 * Falling back to the existing gross when no strokes are recorded keeps a
 * score entered directly on the card (or synced from a phone) from being wiped
 * the moment someone clears a golfer's row back to zero.
 *
 * Returns null when there is nothing to save at all.
 */
export function resolveGrossScore(
  format: string,
  shots: HoleShots | undefined,
  existingGross: number | null | undefined,
): number | null {
  return teamHoleGross(format, shots) ?? existingGross ?? null;
}

/**
 * Whether marking this hole complete needs the hole-in-one confirmation.
 *
 * Completing a hole is what publishes it, and on an ace that announces it on
 * every live scoreboard and sends a push notification — neither of which can
 * be recalled. An ace is a once-a-tournament event while a half-entered hole
 * sitting at 1 stroke is routine (it's the state after the first golfer's
 * first tap), so the rare case is the one that gets a confirmation.
 *
 * Only gates completion: reopening a hole publishes nothing and never alerts.
 */
export function needsAceConfirmation(
  complete: boolean,
  format: string,
  grossScore: number | null | undefined,
  shots?: HoleShots,
): boolean {
  if (!complete) return false;
  if (format !== 'Scramble' && shots && Object.keys(shots).length > 0)
    return aceGolferIds(format, shots).length > 0;
  return grossScore === 1;
}
