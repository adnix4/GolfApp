import { describe, it, expect } from 'vitest';
import { sumPlayerShots, resolveGrossScore, needsAceConfirmation } from '../lib/scoring';

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

describe('needsAceConfirmation', () => {
  it('asks before announcing an ace', () => {
    expect(needsAceConfirmation(true, 1)).toBe(true);
  });

  it('stays out of the way on an ordinary hole', () => {
    expect(needsAceConfirmation(true, 3)).toBe(false);
    expect(needsAceConfirmation(true, 4)).toBe(false);
  });

  // Reopening publishes nothing and can never raise an alert, so a hole sitting
  // at 1 stroke mid-entry must not prompt on "Edit Score".
  it('never prompts when reopening a hole', () => {
    expect(needsAceConfirmation(false, 1)).toBe(false);
  });

  it('does not prompt on a hole with no score', () => {
    expect(needsAceConfirmation(true, null)).toBe(false);
    expect(needsAceConfirmation(true, undefined)).toBe(false);
    expect(needsAceConfirmation(true, 0)).toBe(false);
  });
});
