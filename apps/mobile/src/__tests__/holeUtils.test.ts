import { describe, it, expect } from 'vitest';
import { getHoleOrder, isAdminTotal, shotTotal, splitAdminTotal, strokesByPlayer, toBreakdown } from '../lib/holeUtils';

describe('getHoleOrder', () => {
  // ── Standard starts (no shotgun) ──────────────────────────────────────────

  it('returns [1..18] when startingHole is null (tee-time event)', () => {
    expect(getHoleOrder(null, 18)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });

  it('returns [1..9] when startingHole is null on a 9-hole course', () => {
    expect(getHoleOrder(null, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('returns [1..18] when startingHole is 1 (same as tee-time)', () => {
    expect(getHoleOrder(1, 18)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });

  // ── Mid-course shotgun starts ─────────────────────────────────────────────

  it('wraps correctly for a shotgun start on hole 10 (18 holes)', () => {
    const order = getHoleOrder(10, 18);
    expect(order).toHaveLength(18);
    expect(order[0]).toBe(10);
    expect(order[8]).toBe(18);   // 10+8 = 18
    expect(order[9]).toBe(1);    // wraps to hole 1
    expect(order[17]).toBe(9);   // last hole is 9
  });

  it('wraps correctly for a shotgun start on hole 18 (18 holes)', () => {
    const order = getHoleOrder(18, 18);
    expect(order[0]).toBe(18);
    expect(order[1]).toBe(1);
    expect(order[17]).toBe(17);
  });

  it('wraps correctly for hole 6 on a 9-hole course', () => {
    const order = getHoleOrder(6, 9);
    expect(order).toEqual([6, 7, 8, 9, 1, 2, 3, 4, 5]);
  });

  it('wraps correctly for the last hole on a 9-hole course', () => {
    const order = getHoleOrder(9, 9);
    expect(order).toEqual([9, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  // ── Invariants ────────────────────────────────────────────────────────────

  it('always returns exactly totalHoles elements', () => {
    expect(getHoleOrder(5, 18)).toHaveLength(18);
    expect(getHoleOrder(3, 9)).toHaveLength(9);
    expect(getHoleOrder(null, 18)).toHaveLength(18);
  });

  it('always contains every hole number exactly once', () => {
    for (let start = 1; start <= 18; start++) {
      const order = getHoleOrder(start, 18);
      const sorted = [...order].sort((a, b) => a - b);
      expect(sorted).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    }
  });

  it('always starts with the given startingHole', () => {
    for (let start = 1; start <= 9; start++) {
      expect(getHoleOrder(start, 9)[0]).toBe(start);
    }
  });
});

describe('per-golfer shot entries', () => {
  const split = { drive: 1, approach: 2, putt: 1 };

  it('totals a split and an organizer-entered total alike', () => {
    expect(shotTotal(split)).toBe(4);
    expect(shotTotal(3)).toBe(3);
    expect(shotTotal(undefined)).toBe(0);
    expect(strokesByPlayer({ p1: split, p2: 3 })).toEqual({ p1: 4, p2: 3 });
  });

  it('tells an organizer total from a split', () => {
    expect(isAdminTotal(3)).toBe(true);
    expect(isAdminTotal(split)).toBe(false);
    expect(isAdminTotal(undefined)).toBe(false);
  });

  it('gives steppers nothing to show for an organizer total', () => {
    expect(toBreakdown(3)).toEqual({ drive: 0, approach: 0, putt: 0 });
    expect(toBreakdown(split)).toBe(split);
  });

  it('opens an organizer total for editing without changing it', () => {
    for (const total of [1, 2, 4, 9]) {
      const opened = splitAdminTotal(total);
      expect(shotTotal(opened)).toBe(total);
      expect(opened.drive).toBe(1);
    }
    expect(splitAdminTotal(0)).toEqual({ drive: 0, approach: 0, putt: 0 });
  });
});
