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
//   apps/api/Features/Auction/AuctionBidRules.cs  (NeedsPaymentMethod, MinimumRequired, IsBuyNow)
//   apps/api/Features/Auction/AuctionService.cs   (PlaceBidAsync — what a buy-now sale bills)
//   apps/api-tests/AuctionBidRulesTests.cs        (the same cases, per rule)
// ─────────────────────────────────────────────────────────────────────────────

import { formatCentsShort } from './money';

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

/**
 * True when this amount would buy the item outright rather than bid on it.
 * Mirrors AuctionBidRules.IsBuyNow — note the `>=`: matching the buy-now price
 * exactly is a purchase, and the server closes the item on the spot.
 *
 * This is the trap the confirmation dialog exists for. On a Silent lot the
 * amount is a private ceiling, so a golfer setting a deliberately generous
 * maximum can cross the buy-now price and end the auction without ever
 * intending to buy.
 */
export function isBuyNowBid(
  buyNowPriceCents: number | null | undefined,
  amountCents: number,
): boolean {
  return buyNowPriceCents != null && amountCents >= buyNowPriceCents;
}

// ── THE GOLFER'S OWN STANDING, PER ITEM ──────────────────────────────────────

/** One golfer's standing position on one item, folded from their bid history. */
export interface PlayerItemBid {
  /** Highest amount they have on the item — their maximum on a Silent lot. */
  maxCents: number;
  /** Server-computed status of THAT row: Winning/Outbid/Won/Lost/Pledged/Charged. */
  status:   string;
  placedAt: string;
}

/**
 * Collapses a player's bid history into one standing row per item.
 *
 * Fold by HIGHEST AMOUNT, never by most recent. A golfer who raises their own
 * maximum leaves the earlier, lower rows in the history, and the server marks a
 * row Winning only when it is the golfer's top amount on the item
 * (AuctionService.GetPlayerBidsAsync: `leader == playerId && amount == myMax`).
 * So their older rows come back "Outbid" while they are in fact leading —
 * folding by latest row would paint a winning card red.
 *
 * Ties on amount take the later placement, matching how the server picks a
 * golfer's standing bid in AuctionBidRules.ResolveProxy.
 */
export function foldPlayerBidsByItem(
  rows: ReadonlyArray<{
    auctionItemId: string;
    amountCents:   number;
    status:        string;
    placedAt:      string;
  }>,
): Map<string, PlayerItemBid> {
  const byItem = new Map<string, PlayerItemBid>();

  for (const row of rows) {
    const held = byItem.get(row.auctionItemId);
    const wins = !held
      || row.amountCents > held.maxCents
      || (row.amountCents === held.maxCents && row.placedAt > held.placedAt);

    if (wins) {
      byItem.set(row.auctionItemId, {
        maxCents: row.amountCents,
        status:   row.status,
        placedAt: row.placedAt,
      });
    }
  }

  return byItem;
}

/**
 * How an item should read to THIS golfer. A tone, not a color — this package
 * owns rules, not a palette, and the two apps that show it style it differently.
 */
export type BidTone = 'winning' | 'outbid' | 'none';

/**
 * Winning/Won → winning, Outbid/Lost → outbid, everything else → none.
 *
 * "Everything else" is deliberate and includes a golfer who has not bid at all
 * (undefined), a Fund-a-Need pledge (Pledged/Charged — pledges stack, so there
 * is nothing to win or lose), and any status a future server adds. An unknown
 * string must fall back to neutral: telling a golfer they are winning, or that
 * they were outbid, on a status this build does not understand is worse than
 * saying nothing.
 */
export function bidTone(mine: { status: string } | null | undefined): BidTone {
  switch (mine?.status) {
    case 'Winning':
    case 'Won':
      return 'winning';
    case 'Outbid':
    case 'Lost':
      return 'outbid';
    default:
      return 'none';
  }
}

// ── CONFIRMATION COPY ────────────────────────────────────────────────────────

/** What to put in the confirm dialog raised before an amount is submitted. */
export interface BidConfirmationPrompt {
  title:        string;
  message:      string;
  /** Native only — on web `notify` falls back to the browser's OK/Cancel, so
   *  the message must stand on its own without this label. */
  confirmLabel: string;
}

/**
 * Reads the amount back to the golfer before it posts, in the terms of the item
 * they are actually bidding on.
 *
 * The distinction that matters most is what they will PAY, and it is not the
 * same number in every branch:
 *   - Silent, ordinary bid — the amount is a ceiling; they pay the settled
 *     price, at most their maximum.
 *   - Silent, buy-now — they pay the BUY-NOW PRICE, not the ceiling they typed.
 *     AuctionService.PlaceBidAsync sets CurrentHighBidCents = BuyNowPriceCents
 *     on a proxy buy-now precisely so the ceiling is never billed.
 *   - Live, buy-now — no proxy ladder, so CurrentHighBidCents becomes
 *     Math.Max(current, amount): they pay WHAT THEY TYPED.
 * Quoting the wrong one of those to a golfer about to spend money is the whole
 * risk this function exists to remove; the tests pin each branch.
 */
export function buildBidConfirmation(
  item: {
    title:             string;
    auctionType:       string;
    bidIncrementCents: number;
    buyNowPriceCents?: number | null;
  },
  amountCents: number,
): BidConfirmationPrompt {
  const amount  = formatCentsShort(amountCents);
  const buyNow  = isBuyNowBid(item.buyNowPriceCents, amountCents);
  const buyNowP = formatCentsShort(item.buyNowPriceCents ?? 0);

  if (isDonationItem(item.auctionType)) {
    return {
      title:   'Confirm your pledge',
      message: `Pledge ${amount} to "${item.title}"?`
        // IsBuyNow is evaluated for every type server-side, so a Fund-a-Need
        // item with a buy-now price set closes on a large enough pledge too.
        + (buyNow ? `\n\nThis also meets the ${buyNowP} buy-now price and will close the item.` : ''),
      confirmLabel: 'Pledge',
    };
  }

  if (buyNow) {
    const pays = usesProxyBidding(item.auctionType) ? buyNowP : amount;
    return {
      title:   'This buys it outright',
      message: `${amount} is at or above the ${buyNowP} buy-now price for "${item.title}".`
        + `\n\nConfirming ends the bidding now and you buy it for ${pays}.`
        + ` To bid instead, enter less than ${buyNowP}.`,
      confirmLabel: 'Buy it now',
    };
  }

  if (usesProxyBidding(item.auctionType)) {
    return {
      title:   'Confirm your maximum',
      message: `Set your maximum at ${amount} on "${item.title}"?`
        + `\n\nWe'll bid only enough to keep you in front, in`
        + ` ${formatCentsShort(item.bidIncrementCents)} steps, and never more than your maximum.`,
      confirmLabel: 'Place max bid',
    };
  }

  return {
    title:        'Confirm your bid',
    message:      `Bid ${amount} on "${item.title}"?\n\nIf you win, you pay ${amount}.`,
    confirmLabel: 'Place bid',
  };
}
