import { describe, it, expect } from 'vitest';
import {
  auctionStatusColor, auctionStatusLabel, isAuctionStatusFinal,
  endAuctionCopy, endAuctionResult, settleCopy, formatCents,
} from '../lib/auctionEnd';
import type { AuctionEndSummary } from '../lib/api';

function summary(over: Partial<AuctionEndSummary> = {}): AuctionEndSummary {
  return {
    lotsClosed: 0, lotsSold: 0, lotsUnsold: 0,
    winnersCreated: 0, outstandingCents: 0, winnersWithoutCard: 0,
    liveSessionEnded: false, liveLotsAwaitingAward: [],
    ...over,
  };
}

const lot = (title: string, currentHighBidCents = 0) =>
  ({ itemId: title, title, currentHighBidCents });

describe('auction status palette', () => {
  it('gives every lifecycle status a colour and a plain-English label', () => {
    for (const s of ['Open', 'Extended', 'Closed', 'Awarded', 'Unsold', 'Cancelled']) {
      expect(auctionStatusColor(s)).toMatch(/^#[0-9a-f]{6}$/i);
      expect(auctionStatusLabel(s)).toBeTruthy();
    }
  });

  it('reads Closed as "Sold" and Unsold as "No bids"', () => {
    // The two used to be indistinguishable grey text, which is exactly the
    // confusion the Unsold status was added to remove.
    expect(auctionStatusLabel('Closed')).toBe('Sold');
    expect(auctionStatusLabel('Unsold')).toBe('No bids');
    expect(auctionStatusColor('Closed')).not.toBe(auctionStatusColor('Unsold'));
  });

  it('falls back gracefully for a status it does not know', () => {
    expect(auctionStatusColor('Martian')).toBe('#aaa');
    expect(auctionStatusLabel('Martian')).toBe('Martian');
  });

  it('treats only the terminal states as final', () => {
    expect(isAuctionStatusFinal('Open')).toBe(false);
    expect(isAuctionStatusFinal('Extended')).toBe(false);   // still taking bids
    expect(isAuctionStatusFinal('Closed')).toBe(true);
    expect(isAuctionStatusFinal('Unsold')).toBe(true);
    expect(isAuctionStatusFinal('Awarded')).toBe(true);
    expect(isAuctionStatusFinal('Cancelled')).toBe(true);
  });
});

describe('formatCents', () => {
  it('formats whole and part dollars', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(3500)).toBe('$35.00');
    expect(formatCents(75512)).toBe('$755.12');
  });
});

describe('endAuctionCopy', () => {
  it('says how many lots close and how many sold', () => {
    const c = endAuctionCopy(summary({
      lotsClosed: 5, lotsSold: 4, lotsUnsold: 1,
      winnersCreated: 4, outstandingCents: 75500,
    }));
    expect(c.title).toBe('End the auction?');
    expect(c.confirmText).toBe('End Auction');
    expect(c.message).toContain('5 lots will close now');
    expect(c.message).toContain('4 lots will be sold');
    expect(c.message).toContain('1 will close with no bids');
    expect(c.message).toContain('$755.00 to take at checkout');
  });

  it('warns how many winners have no card on file', () => {
    // Check-in waives the saved-card rule for bidding, so this is routine — but
    // it is the desk's problem, and better known before settling than after.
    const c = endAuctionCopy(summary({
      lotsClosed: 2, lotsSold: 2, winnersCreated: 2,
      outstandingCents: 5000, winnersWithoutCard: 3,
    }));
    expect(c.message).toContain('3 winners have no card on file');
    expect(c.message).toContain('cash or check');
  });

  it('singularizes a lone cardless winner', () => {
    expect(endAuctionCopy(summary({ lotsClosed: 1, lotsSold: 1, winnersCreated: 1, winnersWithoutCard: 1 })).message)
      .toContain('1 winner has no card on file');
  });

  it('names the live lots being left for a manual award', () => {
    const c = endAuctionCopy(summary({
      liveLotsAwaitingAward: [lot('Weekend Away', 20000), lot('Signed Driver')],
    }));
    expect(c.message).toContain('2 live lots will stay open');
    expect(c.message).toContain('• Weekend Away');
    expect(c.message).toContain('• Signed Driver');
  });

  it('truncates a long list of parked live lots', () => {
    const many = Array.from({ length: 11 }, (_, i) => lot(`Lot ${i + 1}`));
    const c = endAuctionCopy(summary({ liveLotsAwaitingAward: many }));
    expect(c.message).toContain('• Lot 8');
    expect(c.message).not.toContain('• Lot 9');
    expect(c.message).toContain('…and 3 more');
  });

  it('mentions the live session when one is running', () => {
    expect(endAuctionCopy(summary({ liveSessionEnded: true })).message)
      .toContain('live auction session will end');
  });

  it('always warns that the action cannot be undone', () => {
    expect(endAuctionCopy(summary()).message).toContain('cannot be undone');
  });

  it('says plainly when there is nothing left to close', () => {
    expect(endAuctionCopy(summary()).message).toContain('No lots are still taking bids.');
  });
});

describe('endAuctionResult', () => {
  it('summarises what just happened, including work still to do', () => {
    const r = endAuctionResult(summary({
      lotsClosed: 4, lotsSold: 3, lotsUnsold: 1,
      winnersCreated: 3, outstandingCents: 12000,
      liveLotsAwaitingAward: [lot('Weekend Away')],
    }));
    expect(r).toContain('4 lots closed');
    expect(r).toContain('1 with no bids');
    expect(r).toContain('$120.00 to collect at checkout');
    expect(r).toContain('1 live lot still to award');
  });

  it('says so when the auction was already over', () => {
    expect(endAuctionResult(summary()))
      .toBe('Nothing left to close — the auction was already over.');
  });
});

describe('settleCopy', () => {
  it('warns that a card is about to be charged', () => {
    const c = settleCopy('Dana Winner', 3500, 'Card', false);
    expect(c.title).toBe('Take $35.00 from Dana Winner?');
    expect(c.message).toContain('saved card will be charged');
    expect(c.confirmText).toBe('Charge Card');
  });

  it('makes clear that cash and check never touch a card', () => {
    const c = settleCopy('Dana Winner', 3500, 'Cash', false);
    expect(c.message).toContain('Record $35.00 received by cash');
    expect(c.message).toContain('No card will be charged');
    expect(c.confirmText).toBe('Record Cash');
  });

  it('mentions handover only when it is also happening', () => {
    expect(settleCopy('D', 100, 'Check', true).message).toContain('marked as collected');
    expect(settleCopy('D', 100, 'Check', false).message).not.toContain('collected');
  });
});
