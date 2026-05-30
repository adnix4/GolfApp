import { describe, it, expect } from 'vitest';
import {
  FORMAT_OPTIONS, FORMAT_LABELS, FORMAT_HINTS,
  START_OPTIONS, START_LABELS, START_HINTS,
  HOLES_OPTIONS,
  fmtAgeGroup,
} from '../eventOptions';

describe('event option tables', () => {
  it('FORMAT_LABELS covers every admin-form format choice', () => {
    for (const f of FORMAT_OPTIONS) {
      expect(FORMAT_LABELS[f]).toBeDefined();
    }
  });

  it('FORMAT_HINTS covers every admin-form format choice', () => {
    for (const f of FORMAT_OPTIONS) {
      expect(FORMAT_HINTS[f]).toBeDefined();
    }
  });

  it('FORMAT_LABELS includes Match for league display even though admin form omits it', () => {
    expect(FORMAT_LABELS.Match).toBe('Match Play');
    expect(FORMAT_OPTIONS).not.toContain('Match');
  });

  it('START_LABELS and START_HINTS cover every start choice', () => {
    for (const s of START_OPTIONS) {
      expect(START_LABELS[s]).toBeDefined();
      expect(START_HINTS[s]).toBeDefined();
    }
  });

  it('HOLES_OPTIONS exposes the canonical 9/18 choice', () => {
    expect(HOLES_OPTIONS).toEqual([9, 18]);
  });
});

describe('fmtAgeGroup', () => {
  it('returns null for null/undefined/empty input', () => {
    expect(fmtAgeGroup(null)).toBeNull();
    expect(fmtAgeGroup(undefined)).toBeNull();
    expect(fmtAgeGroup('')).toBeNull();
  });

  it('formats the three known buckets', () => {
    expect(fmtAgeGroup('Under30')).toBe('Under 30');
    expect(fmtAgeGroup('From30To50')).toBe('30–50');
    expect(fmtAgeGroup('Over50')).toBe('Over 50');
  });

  it('falls back to the raw value for unknown inputs', () => {
    expect(fmtAgeGroup('SeniorPro')).toBe('SeniorPro');
  });
});
