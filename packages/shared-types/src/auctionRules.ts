// ─────────────────────────────────────────────────────────────────────────────
// auctionRules.ts — client mirror of the server's auction bid eligibility rule
// ─────────────────────────────────────────────────────────────────────────────
//
// This rule lives in two places by necessity: the server enforces it, the client
// needs it to disable a button before the golfer taps it. It was previously
// written twice from memory and drifted — the mobile app blocked every golfer
// without a saved card, ignoring check-in, so its bid button stayed disabled for
// people the server would happily have accepted.
//
// Keep this file in lockstep with:
//   apps/api/Features/Auction/AuctionBidRules.cs  (NeedsPaymentMethod, MinimumRequired)
//   apps/api-tests/AuctionBidRulesTests.cs        (the same cases, per rule)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True when the golfer must add a saved card before they can bid.
 *
 * Checking in waives the card requirement: the organizer has the golfer in front
 * of them at that point, so an uncharged auction win can be settled in person.
 * See Phase 4 spec §3.1 step 3 — "player has_payment_method OR
 * check_in_status=checked_in".
 */
export function needsPaymentMethod(
  hasPaymentMethod: boolean,
  isCheckedIn: boolean,
): boolean {
  return !hasPaymentMethod && !isCheckedIn;
}

/** The `auctionType` values the server treats as Fund-a-Need rather than competitive. */
const DONATION_TYPES = ['DonationSilent', 'DonationLive'];

/** True for a Fund-a-Need item, where every pledge stands on its own. */
export function isDonationItem(auctionType: string): boolean {
  return DONATION_TYPES.includes(auctionType);
}

/**
 * True where the amount a golfer submits is a private MAXIMUM the server bids
 * up to on their behalf, not the bid itself. Mirrors
 * AuctionBidRules.UsesProxyBidding.
 *
 * Silent items only. A Live lot is called out loud by an auctioneer, so a
 * hidden max would put the app and the room on different numbers, and
 * Fund-a-Need pledges stack rather than compete.
 *
 * The UI difference is not cosmetic: on a proxy item the amount entered will
 * usually NOT become the displayed price, and a bid can be accepted and still
 * lose on the spot, so the label has to say "max" and the confirmation has to
 * read `isWinning` rather than assume success.
 */
export function usesProxyBidding(auctionType: string): boolean {
  return auctionType === 'Silent';
}

/**
 * Minimum accepted bid, in cents. Mirrors AuctionBidRules.MinimumRequired.
 *
 * The starting bid is a floor, not just a seed: on an item with no bids yet the
 * server still demands it, so `currentHighBidCents + bidIncrementCents` alone
 * understates the minimum by the whole opening price. The mobile bid modal used
 * to compute exactly that and told golfers a $50 item could be had for $5 —
 * every such bid came back BID_TOO_LOW.
 *
 * Donation items ignore the running total (multiple pledges are the point) and
 * take minimumBidCents when set, else the starting bid.
 */
export function minimumBidCents(item: {
  auctionType:         string;
  startingBidCents:    number;
  bidIncrementCents:   number;
  currentHighBidCents: number;
  minimumBidCents?:    number | null;
}): number {
  return isDonationItem(item.auctionType)
    ? (item.minimumBidCents ?? item.startingBidCents)
    : Math.max(item.startingBidCents, item.currentHighBidCents + item.bidIncrementCents);
}
