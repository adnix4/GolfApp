import { describe, it, expect } from 'vitest';
import { checkoutCounts, checkoutHeadline } from '../lib/checkoutSummary';

const item   = (pickedUpAt: string | null = null) => ({ isPledge: false, pickedUpAt });
const pledge = () => ({ isPledge: true, pickedUpAt: null });

describe('checkoutHeadline', () => {
  it('counts items won', () => {
    expect(checkoutHeadline([item()])).toBe('You won 1 item');
    expect(checkoutHeadline([item(), item()])).toBe('You won 2 items');
  });

  it('adds pledges alongside items', () => {
    expect(checkoutHeadline([item(), pledge()])).toBe('You won 1 item + 1 pledge');
    expect(checkoutHeadline([item(), pledge(), pledge()])).toBe('You won 1 item + 2 pledges');
  });

  it('thanks a golfer who only pledged instead of saying they won', () => {
    expect(checkoutHeadline([pledge()])).toBe('Thank you for your pledge');
    expect(checkoutHeadline([pledge(), pledge()])).toBe('Thank you for your 2 pledges');
  });

  it('is empty for an empty cart', () => {
    expect(checkoutHeadline([])).toBe('');
  });
});

describe('checkoutCounts', () => {
  it('never waits on a pledge to be collected', () => {
    expect(checkoutCounts([pledge()]).awaitingPickup).toBe(false);
  });

  it('waits on an item until it is collected', () => {
    expect(checkoutCounts([item(), pledge()]).awaitingPickup).toBe(true);
    expect(checkoutCounts([item('2026-10-02T12:00:00Z'), pledge()]).awaitingPickup).toBe(false);
  });

  it('splits items from pledges', () => {
    expect(checkoutCounts([item(), item(), pledge()])).toMatchObject({ items: 2, pledges: 1 });
  });
});
