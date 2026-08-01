import { describe, it, expect } from 'vitest';
import { needsPaymentMethod, minimumBidCents, isDonationItem } from '../auctionRules';

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
