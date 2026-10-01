import { describe, it, expect } from 'vitest';
import { shouldShowTabs } from '../lib/scoringTabs';

const golfer = { dismissed: false, isGuest: false };

describe('shouldShowTabs', () => {
  it('shows tabs while scoring is open and in test mode', () => {
    expect(shouldShowTabs({ ...golfer, status: 'Scoring' })).toBe(true);
    expect(shouldShowTabs({ ...golfer, status: 'Draft' })).toBe(true);
  });

  it('keeps the tabs after the round ends, so the auction stays reachable', () => {
    expect(shouldShowTabs({ ...golfer, status: 'Completed' })).toBe(true);
  });

  it('shows the waiting wall before scoring opens, until the golfer continues', () => {
    expect(shouldShowTabs({ ...golfer, status: 'Registration' })).toBe(false);
    expect(shouldShowTabs({ ...golfer, status: 'Active' })).toBe(false);
    expect(shouldShowTabs({ status: 'Active', dismissed: true, isGuest: false })).toBe(true);
  });

  it('lets guests straight through, but never into a cancelled event', () => {
    expect(shouldShowTabs({ status: 'Active', dismissed: false, isGuest: true })).toBe(true);
    expect(shouldShowTabs({ status: 'Cancelled', dismissed: true, isGuest: true })).toBe(false);
  });

  it('shows the wall while the status is still unknown', () => {
    expect(shouldShowTabs({ ...golfer, status: null })).toBe(false);
  });
});
