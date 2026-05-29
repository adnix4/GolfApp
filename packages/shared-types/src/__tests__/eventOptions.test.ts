import { describe, it, expect } from 'vitest';
import {
  FORMAT_OPTIONS, FORMAT_LABELS, FORMAT_HINTS,
  START_OPTIONS, START_LABELS, START_HINTS,
  HOLES_OPTIONS,
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
