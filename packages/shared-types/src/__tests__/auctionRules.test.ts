import { describe, it, expect } from 'vitest';
import {
  needsPaymentMethod, minimumBidCents, isDonationItem, usesProxyBidding,
  isBuyNowBid, foldPlayerBidsByItem, bidTone, buildBidConfirmation,
} from '../auctionRules';

// Mirrors apps/api-tests/AuctionBidRulesTests.cs → NeedsPaymentMethodTests.
// If one side changes, this file should fail before the drift reaches a golfer.
describe('needsPaymentMethod', () => {
  it('does not require a card when the golfer has one', () => {
    expect(needsPaymentMethod(true, false)).toBe(false);
  });

  it('does not require a card when the golfer is checked in', () => {
    expect(needsPaymentMethod(false, true)).toBe(false);
  });

  it('requires a card when the golfer has neither', () => {
    expect(needsPaymentMethod(false, false)).toBe(true);
  });

  it('is satisfied when the golfer has both', () => {
    expect(needsPaymentMethod(true, true)).toBe(false);
  });
});

// Mirrors apps/api-tests/AuctionBidRulesTests.cs → MinimumRequiredTests, case
// for case. The first one is the bug that shipped: an unbid $50 item was
// advertised at $5, so every bid the golfer placed came back BID_TOO_LOW.
describe('minimumBidCents', () => {
  const item = (over: Partial<Parameters<typeof minimumBidCents>[0]>) => ({
    auctionType: 'Silent', startingBidCents: 0, bidIncrementCents: 0,
    currentHighBidCents: 0, minimumBidCents: null, ...over,
  });

  it('requires the starting bid on a silent item with no bids yet', () => {
    expect(minimumBidCents(item({
      startingBidCents: 5000, bidIncrementCents: 500,
    }))).toBe(5000);
  });

  it('requires current high + increment once bidding is under way', () => {
    expect(minimumBidCents(item({
      startingBidCents: 1000, bidIncrementCents: 500, currentHighBidCents: 5000,
    }))).toBe(5500);
  });

  it('keeps the starting bid as a floor when it beats high + increment', () => {
    expect(minimumBidCents(item({
      startingBidCents: 10000, bidIncrementCents: 500,
    }))).toBe(10000);
  });

  it('applies the same competitive rule to live items', () => {
    expect(minimumBidCents(item({
      auctionType: 'Live', startingBidCents: 2000,
      bidIncrementCents: 1000, currentHighBidCents: 8000,
    }))).toBe(9000);
  });

  it('uses minimumBidCents on a donation item when set', () => {
    expect(minimumBidCents(item({
      auctionType: 'DonationSilent', startingBidCents: 5000,
      bidIncrementCents: 500, minimumBidCents: 2500,
    }))).toBe(2500);
  });

  it('falls back to the starting bid when a donation sets no minimum', () => {
    expect(minimumBidCents(item({
      auctionType: 'DonationSilent', startingBidCents: 5000, bidIncrementCents: 500,
    }))).toBe(5000);
  });

  it('ignores the running total on a donation item', () => {
    expect(minimumBidCents(item({
      auctionType: 'DonationLive', startingBidCents: 1000, bidIncrementCents: 500,
      currentHighBidCents: 50000, minimumBidCents: 500,
    }))).toBe(500);
  });

  it('is zero when a donation has neither a minimum nor a starting bid', () => {
    expect(minimumBidCents(item({ auctionType: 'DonationSilent' }))).toBe(0);
  });

  it('treats an absent minimumBidCents the same as null', () => {
    expect(minimumBidCents({
      auctionType: 'DonationSilent', startingBidCents: 2500,
      bidIncrementCents: 500, currentHighBidCents: 0,
    })).toBe(2500);
  });
});

describe('isDonationItem', () => {
  it.each(['DonationSilent', 'DonationLive'])('treats %s as a donation', t => {
    expect(isDonationItem(t)).toBe(true);
  });

  it.each(['Silent', 'Live'])('treats %s as competitive', t => {
    expect(isDonationItem(t)).toBe(false);
  });
});

// Mirrors apps/api-tests/AuctionBidRulesTests.cs → UsesProxyBiddingTests. The
// client can't compute the proxy price itself (it never sees other golfers'
// maxes), but it must know WHICH items hide a max, or the bid box tells people
// the amount they typed is what the item now costs.
describe('usesProxyBidding', () => {
  it('applies to silent items', () => {
    expect(usesProxyBidding('Silent')).toBe(true);
  });

  it.each(['Live', 'DonationSilent', 'DonationLive'])('does not apply to %s', t => {
    expect(usesProxyBidding(t)).toBe(false);
  });
});

// Mirrors apps/api-tests/AuctionBidRulesTests.cs → IsBuyNowTests.
describe('isBuyNowBid', () => {
  it('is never a buy-now when the item has no buy-now price', () => {
    expect(isBuyNowBid(null, 100_000)).toBe(false);
    expect(isBuyNowBid(undefined, 100_000)).toBe(false);
  });

  it('is not a buy-now below the price', () => {
    expect(isBuyNowBid(20000, 19999)).toBe(false);
  });

  it('is a buy-now exactly at the price', () => {
    expect(isBuyNowBid(20000, 20000)).toBe(true);
  });

  it('is a buy-now above the price', () => {
    expect(isBuyNowBid(20000, 25000)).toBe(true);
  });
});

describe('foldPlayerBidsByItem', () => {
  const row = (over: Partial<{
    auctionItemId: string; amountCents: number; status: string; placedAt: string;
  }> = {}) => ({
    auctionItemId: 'item-1', amountCents: 5000, status: 'Winning',
    placedAt: '2026-08-02T10:00:00Z', ...over,
  });

  it('returns an empty map for no history', () => {
    expect(foldPlayerBidsByItem([]).size).toBe(0);
  });

  it('collapses several rows on one item to the highest amount', () => {
    const folded = foldPlayerBidsByItem([
      row({ amountCents: 5000 }),
      row({ amountCents: 20000 }),
      row({ amountCents: 7500 }),
    ]);
    expect(folded.get('item-1')?.maxCents).toBe(20000);
  });

  // The regression this fold exists to prevent: the server marks a golfer's
  // older, lower rows "Outbid" even while their top row leads, so taking the
  // most recent row would show a winning card as outbid.
  it('takes the status from the highest row, not the latest one', () => {
    const folded = foldPlayerBidsByItem([
      row({ amountCents: 20000, status: 'Winning', placedAt: '2026-08-02T10:00:00Z' }),
      row({ amountCents: 5000,  status: 'Outbid',  placedAt: '2026-08-02T11:00:00Z' }),
    ]);
    expect(folded.get('item-1')?.status).toBe('Winning');
  });

  it('breaks a tie on amount with the later placement', () => {
    const folded = foldPlayerBidsByItem([
      row({ amountCents: 5000, status: 'Outbid',  placedAt: '2026-08-02T10:00:00Z' }),
      row({ amountCents: 5000, status: 'Winning', placedAt: '2026-08-02T12:00:00Z' }),
    ]);
    expect(folded.get('item-1')?.status).toBe('Winning');
  });

  it('is independent of the order rows arrive in', () => {
    const rows = [
      row({ amountCents: 5000,  status: 'Outbid' }),
      row({ amountCents: 20000, status: 'Winning' }),
    ];
    const forward  = foldPlayerBidsByItem(rows);
    const backward = foldPlayerBidsByItem([...rows].reverse());
    expect(forward.get('item-1')).toEqual(backward.get('item-1'));
  });

  it('keeps items apart', () => {
    const folded = foldPlayerBidsByItem([
      row({ auctionItemId: 'a', amountCents: 5000 }),
      row({ auctionItemId: 'b', amountCents: 9000 }),
    ]);
    expect(folded.size).toBe(2);
    expect(folded.get('a')?.maxCents).toBe(5000);
    expect(folded.get('b')?.maxCents).toBe(9000);
  });
});

describe('bidTone', () => {
  it.each(['Winning', 'Won'])('reads %s as winning', s => {
    expect(bidTone({ status: s })).toBe('winning');
  });

  it.each(['Outbid', 'Lost'])('reads %s as outbid', s => {
    expect(bidTone({ status: s })).toBe('outbid');
  });

  it('is neutral for a golfer who has not bid', () => {
    expect(bidTone(undefined)).toBe('none');
    expect(bidTone(null)).toBe('none');
  });

  // Pledges stack rather than compete — there is nothing to win or be outbid on.
  it.each(['Pledged', 'Charged'])('is neutral for %s', s => {
    expect(bidTone({ status: s })).toBe('none');
  });

  it('falls back to neutral on a status this build does not know', () => {
    expect(bidTone({ status: 'Reserved' })).toBe('none');
  });
});

describe('buildBidConfirmation', () => {
  const item = (over: Partial<Parameters<typeof buildBidConfirmation>[0]> = {}) => ({
    title: 'Vortex AMG', auctionType: 'Silent',
    bidIncrementCents: 500, buyNowPriceCents: null, ...over,
  });

  it('calls a silent bid a maximum and names the step', () => {
    const p = buildBidConfirmation(item(), 20000);
    expect(p.title).toBe('Confirm your maximum');
    expect(p.message).toContain('$200.00');
    expect(p.message).toContain('$5.00 steps');
    expect(p.message).toContain('Vortex AMG');
  });

  it('never calls a live bid a maximum, and quotes what they pay', () => {
    const p = buildBidConfirmation(item({ auctionType: 'Live' }), 20000);
    expect(p.title).toBe('Confirm your bid');
    expect(p.message).not.toMatch(/maximum/i);
    expect(p.message).toContain('you pay $200.00');
  });

  it('asks a donation item to confirm a pledge', () => {
    const p = buildBidConfirmation(item({ auctionType: 'DonationSilent' }), 10000);
    expect(p.title).toBe('Confirm your pledge');
    expect(p.message).toContain('Pledge $100.00');
    expect(p.confirmLabel).toBe('Pledge');
  });

  // The two buy-now branches quote DIFFERENT numbers on purpose: a proxy sale
  // bills the posted price, a live one bills the amount typed. See
  // AuctionService.PlaceBidAsync.
  it('quotes the buy-now price — not the typed maximum — on a silent lot', () => {
    const p = buildBidConfirmation(item({ buyNowPriceCents: 30000 }), 50000);
    expect(p.title).toBe('This buys it outright');
    expect(p.message).toContain('you buy it for $300.00');
    expect(p.message).not.toContain('you buy it for $500.00');
  });

  it('quotes the typed amount on a live lot bought outright', () => {
    const p = buildBidConfirmation(
      item({ auctionType: 'Live', buyNowPriceCents: 30000 }), 50000,
    );
    expect(p.message).toContain('you buy it for $500.00');
  });

  it('treats an amount exactly at the buy-now price as a purchase', () => {
    expect(buildBidConfirmation(item({ buyNowPriceCents: 30000 }), 30000).confirmLabel)
      .toBe('Buy it now');
  });

  it('warns a pledge that would close a fund-a-need item', () => {
    const p = buildBidConfirmation(
      item({ auctionType: 'DonationLive', buyNowPriceCents: 25000 }), 25000,
    );
    expect(p.title).toBe('Confirm your pledge');
    expect(p.message).toContain('will close the item');
  });

  it('leaves an ordinary bid free of buy-now wording', () => {
    const p = buildBidConfirmation(item({ buyNowPriceCents: 100000 }), 20000);
    expect(p.message).not.toMatch(/buy/i);
  });
});
