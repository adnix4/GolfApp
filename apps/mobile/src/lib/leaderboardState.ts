/**
 * Which of the leaderboard screen's states to render.
 *
 * The screen used to show one empty view — "No Scores Yet — Standings will
 * appear once teams start scoring" — for three different situations, only one
 * of which is about scores:
 *
 *  - the event is in offline mode, so the leaderboard never fetched at all
 *  - the fetch ran and failed
 *  - the fetch succeeded and there genuinely are no scores
 *
 * That cost real diagnosis time on an event with 77 scores in the database and
 * a healthy API: the screen was reporting a cause it had no evidence for.
 *
 * Kept out of the screen so the precedence is testable — same reasoning as
 * chipsFit.ts, toPar.ts and holeUtils.ts.
 */

export type LeaderboardState =
  /** Still waiting on the first result. */
  | 'loading'
  /** Offline-mode event: both transports are disabled, nothing was fetched. */
  | 'offline'
  /** A fetch ran and failed. */
  | 'error'
  /** Fetched fine; no team has a completed hole yet. */
  | 'empty'
  /** Standings to show. */
  | 'ready';

export interface LeaderboardStateInput {
  /** The event's offlineMode flag — disables both transports. */
  offlineMode: boolean;
  /** The hook's error flag: a fetch was attempted and failed. */
  error: boolean;
  /** Null before the first successful load. */
  standings: unknown[] | null;
  loading: boolean;
}

export function resolveLeaderboardState(
  { offlineMode, error, standings, loading }: LeaderboardStateInput,
): LeaderboardState {
  // Standings win over every explanation — if we have rows, show them. An
  // offline event that was pulled-to-refresh once has real data to display, and
  // a later failed poll shouldn't blank it.
  if (standings && standings.length > 0) return 'ready';

  // An error outranks the offline explanation: `error` is only ever set after a
  // fetch was actually attempted and failed, which in offline mode means the
  // golfer tapped refresh. Telling them "live standings are off" then would
  // hide the fact that their tap failed — they would tap into silence.
  if (error) return 'error';

  // Nothing was attempted: in offline mode both transports are disabled, so
  // neither a spinner nor a failure message would be true.
  if (offlineMode) return 'offline';

  if (loading) return 'loading';

  return 'empty';
}
