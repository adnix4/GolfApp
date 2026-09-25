import { describe, it, expect } from 'vitest';
import {
  teamHoleGross, stablefordPoints, teamStablefordPoints,
  countingPlayerId, isOwnBallFormat, teamHolePar, aceGolferIds,
} from '../formatScoring';

// Same case table as apps/api-tests/Scores/FormatScoringTests.cs — the two
// implementations must agree (see the header of formatScoring.ts).
const FOURSOME = { a: 4, b: 5, c: 5, d: 6 };

describe('teamHoleGross', () => {
  it.each([
    ['Scramble',   FOURSOME, 20],
    ['BestBall',   FOURSOME, 4],
    ['Stroke',     FOURSOME, 20],
    ['Stableford', FOURSOME, 20],
  ] as const)('%s → %i', (format, shots, expected) => {
    expect(teamHoleGross(format, shots)).toBe(expected);
  });

  it('ignores golfers with no strokes entered (0 is "not yet", not a score)', () => {
    expect(teamHoleGross('BestBall', { a: 0, b: 5 })).toBe(5);
  });

  it('returns null for an empty hole', () => {
    expect(teamHoleGross('Scramble', {})).toBeNull();
    expect(teamHoleGross('BestBall', undefined)).toBeNull();
    expect(teamHoleGross('Stroke', { a: 0 })).toBeNull();
  });
});

describe('stablefordPoints (Rule 21.1)', () => {
  it.each([
    [2, 5], // albatross on a par 5
    [3, 5], // eagle
    [4, 5], // birdie
    [5, 5], // par
    [6, 5], // bogey
    [7, 5], // double bogey
    [9, 5], // worse — never negative
  ])('%i on a par %i', (strokes, par) => {
    expect(stablefordPoints(par, strokes)).toBe(Math.max(0, par - strokes + 2));
  });

  it('scores the table the rule defines', () => {
    expect([2, 3, 4, 5, 6, 7, 8].map(s => stablefordPoints(5, s))).toEqual([5, 4, 3, 2, 1, 0, 0]);
  });
});

describe('teamStablefordPoints', () => {
  it('scores each golfer, then sums — never points off the summed strokes', () => {
    // par 4: 4/5/5/6 → 2 + 1 + 1 + 0
    expect(teamStablefordPoints(FOURSOME, 4)).toBe(4);
  });

  it('is 0 for an empty hole', () => {
    expect(teamStablefordPoints({}, 4)).toBe(0);
  });
});

describe('countingPlayerId', () => {
  it('names the lowest golfer on a Best Ball hole', () => {
    expect(countingPlayerId('BestBall', FOURSOME)).toBe('a');
  });

  it('is null for formats where no single ball counts', () => {
    expect(countingPlayerId('Scramble', FOURSOME)).toBeNull();
    expect(countingPlayerId('Stroke', FOURSOME)).toBeNull();
    expect(countingPlayerId('Stableford', FOURSOME)).toBeNull();
  });

  it('skips golfers at 0', () => {
    expect(countingPlayerId('BestBall', { a: 0, b: 6, c: 5 })).toBe('c');
    expect(countingPlayerId('BestBall', { a: 0 })).toBeNull();
  });
});

describe('isOwnBallFormat', () => {
  it('is false only for Scramble', () => {
    expect(isOwnBallFormat('Scramble')).toBe(false);
    for (const f of ['Stroke', 'Stableford', 'BestBall']) expect(isOwnBallFormat(f)).toBe(true);
  });
});

describe('teamHolePar', () => {
  it('counts one par per golfer on an aggregate row', () => {
    expect(teamHolePar('Stroke', FOURSOME, 4)).toBe(16);
    expect(teamHolePar('Stableford', FOURSOME, 4)).toBe(16);
  });

  it('is the hole par for one-ball rows', () => {
    expect(teamHolePar('Scramble', FOURSOME, 4)).toBe(4);
    expect(teamHolePar('BestBall', FOURSOME, 4)).toBe(4);
    expect(teamHolePar('Stroke', {}, 4)).toBe(4);
  });
});

describe('aceGolferIds', () => {
  it('names golfers at 1 in own-ball formats', () => {
    expect(aceGolferIds('BestBall', { a: 1, b: 4 })).toEqual(['a']);
  });

  it('is empty in a scramble', () => {
    expect(aceGolferIds('Scramble', { a: 1, b: 2 })).toEqual([]);
  });
});
