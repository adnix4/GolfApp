import { describe, it, expect } from 'vitest';
import { needsPaymentMethod } from '../auctionRules';

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
