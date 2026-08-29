/**
 * Scoring helpers for the admin scoring screen.
 *
 * Kept out of the screen so the arithmetic is testable — same reasoning as
 * checkIn.ts and eventStatus.ts.
 */

/**
 * Shots the team USED on a hole, keyed by the player whose shot it was.
 *
 * In a scramble everyone hits from the same spot but only the shot the team
 * plays gets recorded, credited to that golfer. So this is "shots of yours the
 * team used", NOT "strokes you personally played" — which is exactly why the
 * counts sum to the team score: each recorded shot is one team stroke. A team
 * scoring 4 might read { ann: 2, bo: 1, cal: 1 }.
 */
export type HoleShots = Record<string, number>;

/** Team strokes on a hole — one per shot used. */
export function sumPlayerShots(shots: HoleShots | undefined): number {
  if (!shots) return 0;
  return Object.values(shots).reduce((total, n) => total + n, 0);
}

/**
 * The team's gross score for a hole, given the shots the team used.
 *
 * U1: the recorded shots ARE the team score (see HoleShots — one recorded shot
 * per team stroke), so entering them has to move the total. This previously
 * read `existingGross ?? playerTotal`, so the first saved score won
 * permanently: every later +/- updated the golfer's own row and left the team
 * total stale, which is what "the strokes don't add in" meant.
 *
 * Falling back to the existing gross when no strokes are recorded keeps a
 * score entered directly on the card (or synced from a phone) from being wiped
 * the moment someone clears a golfer's row back to zero.
 *
 * Returns null when there is nothing to save at all.
 */
export function resolveGrossScore(
  shots: HoleShots | undefined,
  existingGross: number | null | undefined,
): number | null {
  const playerTotal = sumPlayerShots(shots);
  if (playerTotal > 0) return playerTotal;
  return existingGross ?? null;
}

/**
 * Whether marking this hole complete needs the hole-in-one confirmation.
 *
 * Completing a hole is what publishes it, and at a gross of 1 that announces an
 * ace on every live scoreboard and sends a push notification — neither of which
 * can be recalled. An ace is a once-a-tournament event while a half-entered
 * hole sitting at 1 stroke is routine (it's the state after the first golfer's
 * first tap), so the rare case is the one that gets a confirmation.
 *
 * Only gates completion: reopening a hole publishes nothing and never alerts.
 */
export function needsAceConfirmation(
  complete: boolean,
  grossScore: number | null | undefined,
): boolean {
  return complete && grossScore === 1;
}
