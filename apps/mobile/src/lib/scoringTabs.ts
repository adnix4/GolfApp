/**
 * Whether the scoring area shows its tabs (Scorecard, Standings, Team,
 * Auction, League, Help) or the "waiting" wall.
 *
 * Tabs whenever there is something to do: scoring is open (Scoring, or Draft
 * test mode), the golfer is a guest (never scores — the auction is their
 * reason to be here), they tapped "Continue to Event", or the round is over
 * (Completed): the auction routinely runs on into the banquet and the golfer
 * must still reach it, the standings and their read-only card. Only before
 * scoring opens (the wall explains the wait) and Cancelled keep the wall.
 */
export function shouldShowTabs(opts: { status: string | null; dismissed: boolean; isGuest: boolean }): boolean {
  const { status, dismissed, isGuest } = opts;
  if (status === 'Cancelled') return false;
  if (status === 'Scoring' || status === 'Draft' || status === 'Completed') return true;
  return dismissed || isGuest;
}
