import { describe, it, expect } from 'vitest';
import { getHoleOrder } from '../lib/holeUtils';

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
