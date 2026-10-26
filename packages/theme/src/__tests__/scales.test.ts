import { describe, it, expect } from 'vitest';
import { spacing, radius, fontSize } from '../index';

const ascending = (xs: readonly number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]);

describe('spacing', () => {
  it('maps every key to key × 4 (the 4-point grid)', () => {
    for (const [k, v] of Object.entries(spacing)) expect(v).toBe(Number(k) * 4);
  });

  it('keeps the steps the screens use most', () => {
    expect(Object.values(spacing).sort((a, b) => a - b)).toEqual([2, 4, 8, 12, 16, 20, 24, 32, 40, 48]);
  });
});

describe('radius', () => {
  it('ascends, with full large enough to make any control a capsule', () => {
    const steps = Object.values(radius);
    expect(ascending(steps)).toBe(true);
    expect(radius.full).toBeGreaterThanOrEqual(999);
  });
});

describe('fontSize', () => {
  it('ascends, and keeps 14 (admin body) as md', () => {
    expect(ascending(Object.values(fontSize))).toBe(true);
    expect(fontSize.md).toBe(14);
  });
});
