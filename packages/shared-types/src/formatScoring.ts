/**
 * How a hole is scored under each event format (U8).
 *
 * TypeScript twin of apps/api/Features/Scores/FormatScoring.cs. Change the two
 * in lockstep: the admin desk and the phone use this for the number they show
 * while strokes are being entered, and the server recomputes the stored team
 * score with the C# copy. The server copy is the one that counts, so a mismatch
 * shows up as a hole total that changes on save.
 *
 *   Scramble   — one team ball. The per-golfer counts are "shots of yours the
 *                team used", so they SUM to the team score.
 *   BestBall   — Rules of Golf 23 (four-ball): everyone plays their own ball,
 *                the LOWEST golfer score is the team's score on the hole.
 *   Stroke     — Rule 3.3: individual. The team row holds the aggregate; the
 *                standings are per golfer.
 *   Stableford — Rule 21.1: points per GOLFER against par, summed for the team.
 *                The team row holds the aggregate strokes.
 *
 * Gross only — events carry no handicaps.
 */

/** Per-golfer strokes on a hole, keyed by player id. */
export type HoleShots = Record<string, number>;

/** Golfers who actually have a score on the hole (a 0 is "not entered", not a score). */
function scoredStrokes(shots: HoleShots | null | undefined): number[] {
  if (!shots) return [];
  return Object.values(shots).filter(n => Number.isFinite(n) && n > 0);
}

/**
 * The team row's gross for a hole under `format`. Null when no golfer has a
 * stroke recorded — the caller decides what an empty hole shows.
 */
export function teamHoleGross(format: string, shots: HoleShots | null | undefined): number | null {
  const strokes = scoredStrokes(shots);
  if (strokes.length === 0) return null;
  return format === 'BestBall'
    ? Math.min(...strokes)
    : strokes.reduce((total, n) => total + n, 0);
}

/**
 * Stableford points for one score against par (Rule 21.1):
 * double bogey or worse 0 · bogey 1 · par 2 · birdie 3 · eagle 4 · albatross 5.
 */
export function stablefordPoints(par: number, strokes: number): number {
  return Math.max(0, par - strokes + 2);
}

/** A team's Stableford points on a hole: each golfer's points, summed. */
export function teamStablefordPoints(shots: HoleShots | null | undefined, par: number): number {
  return scoredStrokes(shots).reduce((total, n) => total + stablefordPoints(par, n), 0);
}

/**
 * Par the team row is measured against: one par per ball it holds. A Stroke /
 * Stableford row aggregates every golfer's strokes, so a foursome of pars on a
 * par 4 is 16 against 16, not 16 against 4. Mirrors FormatScoring.TeamHolePar.
 */
export function teamHolePar(format: string, shots: HoleShots | null | undefined, par: number): number {
  const balls = scoredStrokes(shots).length;
  return (format === 'Stroke' || format === 'Stableford') && balls > 0 ? par * balls : par;
}

/**
 * Golfers who holed out in one on their own ball. Always empty in a scramble —
 * there a golfer's "1" is one used shot, and the ace is the team row at 1.
 * Mirrors FormatScoring.FindHoleInOne.
 */
export function aceGolferIds(format: string, shots: HoleShots | null | undefined): string[] {
  if (format === 'Scramble' || !shots) return [];
  return Object.entries(shots).filter(([, n]) => n === 1).map(([id]) => id);
}

/**
 * The golfer whose score counts on a Best Ball hole — the lowest. Null for
 * every other format (all balls count, or there's only one) and for an empty
 * hole. Ties go to whoever comes first; any of them is "the" best ball.
 */
export function countingPlayerId(format: string, shots: HoleShots | null | undefined): string | null {
  if (format !== 'BestBall' || !shots) return null;
  let best: [string, number] | null = null;
  for (const [id, n] of Object.entries(shots)) {
    if (!(n > 0)) continue;
    if (best === null || n < best[1]) best = [id, n];
  }
  return best?.[0] ?? null;
}

/**
 * Whether each golfer plays their own ball (everything but Scramble). The
 * scoring screens use it to word the per-golfer counter: "shots used" in a
 * scramble, "strokes" otherwise.
 */
export function isOwnBallFormat(format: string): boolean {
  return format !== 'Scramble';
}
