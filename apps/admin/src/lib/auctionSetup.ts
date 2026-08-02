/**
 * Organizer-facing sanity checks for auction item setup.
 *
 * Pure and admin-only — these are judgement calls about whether a configuration
 * will BID WELL, not validity rules. The API accepts every value flagged here,
 * so nothing in this file may block a save; it exists to warn the organizer at
 * the moment they can still change their mind.
 */

/**
 * Warns when the bid increment is large enough to strangle the bidding.
 *
 * The increment does two jobs on a competitive item, and an oversized one hurts
 * in both:
 *
 *  1. It sets the ENTRY PRICE for every new bidder. The server demands
 *     `currentPrice + increment` (AuctionBidRules.MinimumRequired), so a $25
 *     lot with a $50 increment asks the second bidder for $75 — a 3× jump over
 *     the asking price, before anyone has shown interest. Most people just
 *     don't bid, and the organizer sees a lot that "nobody wanted" when what
 *     actually happened is nobody could get in cheaply.
 *  2. Under proxy bidding it is the STEP the server spends on a golfer's
 *     behalf. A big step burns through a maximum in a couple of moves, so two
 *     bidders who would have inched from $40 to $65 instead land on $90 at
 *     once and one of them is out — the slow climb that makes an auction
 *     profitable never happens.
 *
 * Thresholds are deliberately loose: a warning that fires on reasonable setups
 * gets ignored, and this can't be exactly right for every lot. Charity auction
 * guidance generally puts the increment at roughly 5–10% of the item's value,
 * so we stay quiet up to a quarter of the starting bid.
 *
 * Returns null when the setup looks fine, or a sentence to show under the field.
 */
export function bidIncrementWarning(
  startingBidCents: number,
  bidIncrementCents: number,
): string | null {
  if (bidIncrementCents <= 0 || startingBidCents <= 0) return null;

  const $ = (c: number) => `$${(c / 100).toFixed(2)}`;
  const secondBidder = startingBidCents + bidIncrementCents;

  if (bidIncrementCents >= startingBidCents) {
    return `That increment is at or above the ${$(startingBidCents)} starting bid, so the ` +
           `second bidder has to jump straight to ${$(secondBidder)}. Expect very few bids. ` +
           `Something nearer ${$(suggested(startingBidCents))} lets the price climb.`;
  }

  if (bidIncrementCents * 4 > startingBidCents) {
    return `That's a big step for a ${$(startingBidCents)} lot — the next bid has to be ` +
           `${$(secondBidder)}. Smaller increments (around ${$(suggested(startingBidCents))}) ` +
           `usually raise more, because more people can afford to join in.`;
  }

  return null;
}

/** ~10% of the opening price, rounded to a tidy figure an organizer would type. */
function suggested(startingBidCents: number): number {
  const tenth = startingBidCents / 10;
  if (tenth <= 100)  return 100;    // floor at $1
  if (tenth <= 500)  return 500;    // $5
  if (tenth <= 1000) return 1000;   // $10
  return Math.round(tenth / 2500) * 2500 || 2500; // then to the nearest $25
}
