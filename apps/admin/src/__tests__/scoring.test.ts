import { describe, it, expect } from 'vitest';
import { sumPlayerShots, resolveGrossScore } from '../lib/scoring';

describe('sumPlayerShots', () => {
  it('adds every golfer on the hole', () => {
    expect(sumPlayerShots({ a: 4, b: 5, c: 3 })).toBe(12);
  });

  it('treats undefined and empty as zero', () => {
    expect(sumPlayerShots(undefined)).toBe(0);
    expect(sumPlayerShots({})).toBe(0);
  });
});

describe('resolveGrossScore', () => {
  // U1 regression: this is the case that was broken. With a score already on
  // the hole, the old `existingGross ?? total` returned the stale gross, so
  // the team total never moved as strokes were entered.
  it('lets the strokes drive the team score even when a gross already exists', () => {
    expect(resolveGrossScore({ a: 4, b: 5 }, 12)).toBe(9);
  });

  it('sums the strokes when no gross exists yet', () => {
    expect(resolveGrossScore({ a: 4, b: 5 }, null)).toBe(9);
  });

  it('updates as each golfer is entered', () => {
    expect(resolveGrossScore({ a: 4 }, null)).toBe(4);
    expect(resolveGrossScore({ a: 4, b: 5 }, null)).toBe(9);
    expect(resolveGrossScore({ a: 4, b: 5, c: 3 }, null)).toBe(12);
  });

  it('keeps a directly-entered score when no strokes are recorded', () => {
    expect(resolveGrossScore({}, 5)).toBe(5);
    expect(resolveGrossScore(undefined, 5)).toBe(5);
  });

  it('returns null when there is nothing to save', () => {
    expect(resolveGrossScore({}, null)).toBeNull();
    expect(resolveGrossScore(undefined, undefined)).toBeNull();
  });
});
