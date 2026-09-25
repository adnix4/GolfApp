import { describe, it, expect } from 'vitest';
import { sumPlayerShots, resolveGrossScore, needsAceConfirmation, aceGolferIds } from '../lib/scoring';

describe('sumPlayerShots', () => {
  it('adds every golfer on the hole', () => {
    expect(sumPlayerShots({ a: 4, b: 5, c: 3 })).toBe(12);
  });

  it('treats undefined and empty as zero', () => {
    expect(sumPlayerShots(undefined)).toBe(0);
    expect(sumPlayerShots({})).toBe(0);
  });
});

describe('resolveGrossScore — Scramble', () => {
  // U1 regression: this is the case that was broken. With a score already on
  // the hole, the old `existingGross ?? total` returned the stale gross, so
  // the team total never moved as strokes were entered.
  it('lets the strokes drive the team score even when a gross already exists', () => {
    expect(resolveGrossScore('Scramble', { a: 4, b: 5 }, 12)).toBe(9);
  });

  it('sums the strokes when no gross exists yet', () => {
    expect(resolveGrossScore('Scramble', { a: 4, b: 5 }, null)).toBe(9);
  });

  it('updates as each golfer is entered', () => {
    expect(resolveGrossScore('Scramble', { a: 4 }, null)).toBe(4);
    expect(resolveGrossScore('Scramble', { a: 4, b: 5 }, null)).toBe(9);
    expect(resolveGrossScore('Scramble', { a: 4, b: 5, c: 3 }, null)).toBe(12);
  });

  it('keeps a directly-entered score when no strokes are recorded', () => {
    expect(resolveGrossScore('Scramble', {}, 5)).toBe(5);
    expect(resolveGrossScore('Scramble', undefined, 5)).toBe(5);
  });

  it('returns null when there is nothing to save', () => {
    expect(resolveGrossScore('Scramble', {}, null)).toBeNull();
    expect(resolveGrossScore('Scramble', undefined, undefined)).toBeNull();
  });
});

// U8: the format picked for the event decides what the strokes add up to.
describe('resolveGrossScore — own-ball formats', () => {
  const foursome = { a: 4, b: 5, c: 5, d: 6 };

  it('Best Ball takes the lowest golfer, not the sum', () => {
    expect(resolveGrossScore('BestBall', foursome, null)).toBe(4);
    // and ignores a stale gross, like the scramble path
    expect(resolveGrossScore('BestBall', foursome, 20)).toBe(4);
  });

  it('Stroke and Stableford store the aggregate on the team row', () => {
    expect(resolveGrossScore('Stroke', foursome, null)).toBe(20);
    expect(resolveGrossScore('Stableford', foursome, null)).toBe(20);
  });

  it('keeps a directly-entered score when no strokes are recorded', () => {
    expect(resolveGrossScore('BestBall', {}, 5)).toBe(5);
  });
});

describe('aceGolferIds', () => {
  it('names the golfers whose own ball went in with one', () => {
    expect(aceGolferIds('BestBall', { a: 1, b: 4 })).toEqual(['a']);
    expect(aceGolferIds('Stroke', { a: 3, b: 1 })).toEqual(['b']);
  });

  it('has no individual aces in a scramble — the team ball is the ace', () => {
    expect(aceGolferIds('Scramble', { a: 1 })).toEqual([]);
  });
});

describe('needsAceConfirmation', () => {
  it('asks before announcing a scramble ace', () => {
    expect(needsAceConfirmation(true, 'Scramble', 1)).toBe(true);
  });

  it('stays out of the way on an ordinary hole', () => {
    expect(needsAceConfirmation(true, 'Scramble', 3)).toBe(false);
    expect(needsAceConfirmation(true, 'Scramble', 4)).toBe(false);
  });

  // Reopening publishes nothing and can never raise an alert, so a hole sitting
  // at 1 stroke mid-entry must not prompt on "Edit Score".
  it('never prompts when reopening a hole', () => {
    expect(needsAceConfirmation(false, 'Scramble', 1)).toBe(false);
    expect(needsAceConfirmation(false, 'Stroke', 5, { a: 1, b: 4 })).toBe(false);
  });

  it('does not prompt on a hole with no score', () => {
    expect(needsAceConfirmation(true, 'Scramble', null)).toBe(false);
    expect(needsAceConfirmation(true, 'Scramble', undefined)).toBe(false);
    expect(needsAceConfirmation(true, 'Scramble', 0)).toBe(false);
  });

  // U8: an aggregate Stroke row is never 1, and a Scramble "1 shot used" by
  // one golfer is not an ace — only an own ball at 1 is.
  it('prompts on a golfer ace in an own-ball format even though the team row is not 1', () => {
    expect(needsAceConfirmation(true, 'Stroke', 9, { a: 1, b: 4, c: 4 })).toBe(true);
    expect(needsAceConfirmation(true, 'Stableford', 5, { a: 1, b: 4 })).toBe(true);
  });

  it('does not prompt when no golfer is at 1', () => {
    expect(needsAceConfirmation(true, 'BestBall', 3, { a: 3, b: 4 })).toBe(false);
  });

  it('does not treat one golfer’s single used shot in a scramble as an ace', () => {
    expect(needsAceConfirmation(true, 'Scramble', 4, { a: 1, b: 2, c: 1 })).toBe(false);
  });
});
