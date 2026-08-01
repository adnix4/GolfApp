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
//   apps/api/Features/Auction/AuctionBidRules.cs  (NeedsPaymentMethod)
//   apps/api-tests/AuctionBidRulesTests.cs        (the three cases)
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
