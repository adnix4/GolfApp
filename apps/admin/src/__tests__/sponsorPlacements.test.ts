import { describe, it, expect } from 'vitest';
import { mergeSponsorPlacements } from '../lib/sponsorPlacements';

describe('mergeSponsorPlacements', () => {
  it('keeps the landing-page opt-out when only the holes change', () => {
    const merged = mergeSponsorPlacements({ landingPage: false, holeNumbers: [3] }, [3, 7]);
    expect(merged).toEqual({ landingPage: false, holeNumbers: [3, 7] });
  });

  it('keeps every other placement flag', () => {
    const merged = mergeSponsorPlacements(
      { leaderboard: true, emailHeader: false, landingPage: true, holeNumbers: [1] },
      [],
    );
    expect(merged).toEqual({ leaderboard: true, emailHeader: false, landingPage: true, holeNumbers: [] });
  });

  it('starts from nothing for a new sponsor', () => {
    expect(mergeSponsorPlacements(undefined, [5])).toEqual({ holeNumbers: [5] });
    expect(mergeSponsorPlacements(null, [])).toEqual({ holeNumbers: [] });
  });

  it('does not modify the existing object', () => {
    const existing = { landingPage: false, holeNumbers: [2] };
    mergeSponsorPlacements(existing, [4]);
    expect(existing).toEqual({ landingPage: false, holeNumbers: [2] });
  });
});
