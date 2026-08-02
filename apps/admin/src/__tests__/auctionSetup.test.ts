import { describe, it, expect } from 'vitest';
import { bidIncrementWarning } from '../lib/auctionSetup';

// The warning has to stay quiet on ordinary setups — one that cries wolf on a
// sensible $5-on-$50 lot teaches organizers to ignore the amber box entirely,
// and then it is worth nothing when a $500-on-$25 lot really does need it.
describe('bidIncrementWarning', () => {
  it('says nothing about a conventional 10% increment', () => {
    expect(bidIncrementWarning(5000, 500)).toBeNull();
  });

  it('says nothing at exactly a quarter of the starting bid', () => {
    expect(bidIncrementWarning(10000, 2500)).toBeNull();
  });

  it('warns once the increment passes a quarter of the starting bid', () => {
    const w = bidIncrementWarning(10000, 2600);
    expect(w).toContain('big step');
    // Quotes what the next bidder actually has to pay — the number that makes
    // the problem obvious, rather than restating the increment.
    expect(w).toContain('$126.00');
  });

  it('warns harder when the increment reaches the starting bid', () => {
    const w = bidIncrementWarning(2500, 5000);
    expect(w).toContain('very few bids');
    expect(w).toContain('$75.00');   // second bidder's entry price
    expect(w).toContain('$25.00');   // the starting bid it is being compared to
  });

  it('treats an increment equal to the starting bid as the severe case', () => {
    expect(bidIncrementWarning(5000, 5000)).toContain('very few bids');
  });

  // Roughly a tenth of the opening price, snapped to a figure someone would
  // actually type — $2.50 and $20.00 are arithmetic, $5.00 and $25.00 are
  // increments.
  it.each([
    ['a $25 lot',   2500,   '$5.00'],
    ['a $200 lot',  20000,  '$25.00'],
    ['a $2000 lot', 200000, '$200.00'],
  ])('suggests a tidy figure for %s', (_label, startingBid, expected) => {
    expect(bidIncrementWarning(startingBid, startingBid * 2)).toContain(expected);
  });

  it('never suggests an increment that would itself trip the warning', () => {
    for (const startingBid of [1000, 2500, 5000, 20000, 75000, 200000]) {
      const suggested = /nearer \$([\d,.]+)|around \$([\d,.]+)/
        .exec(bidIncrementWarning(startingBid, startingBid)!);
      const cents = Math.round(parseFloat((suggested![1] ?? suggested![2]).replace(/,/g, '')) * 100);
      expect(bidIncrementWarning(startingBid, cents)).toBeNull();
    }
  });

  // A missing or zero field is mid-typing, not a mistake to shout about.
  it.each([
    ['no increment yet', 5000, 0],
    ['no starting bid yet', 0, 5000],
    ['empty form', 0, 0],
  ])('stays quiet with %s', (_label, starting, increment) => {
    expect(bidIncrementWarning(starting, increment)).toBeNull();
  });
});
