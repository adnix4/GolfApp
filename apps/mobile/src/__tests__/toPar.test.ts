import { describe, it, expect } from 'vitest';
import { formatToPar, toParColor } from '../lib/toPar';

const MUTED = '#4b5563';

describe('formatToPar', () => {
  it('writes even par as E, not 0', () => {
    expect(formatToPar(0)).toBe('E');
  });

  it('signs over-par scores', () => {
    expect(formatToPar(1)).toBe('+1');
    expect(formatToPar(12)).toBe('+12');
  });

  it('keeps the minus on under-par scores', () => {
    expect(formatToPar(-1)).toBe('-1');
    expect(formatToPar(-4)).toBe('-4');
  });

  // Nothing scored yet is not "+0" — there is no comparison to make.
  it('shows a dash when there is no score', () => {
    expect(formatToPar(null)).toBe('—');
  });
});

describe('toParColor', () => {
  it('greens an under-par score and reds an over-par one', () => {
    expect(toParColor(-2, MUTED)).toBe('#27ae60');
    expect(toParColor(3, MUTED)).toBe('#e74c3c');
  });

  it('mutes even par and no score', () => {
    expect(toParColor(0, MUTED)).toBe(MUTED);
    expect(toParColor(null, MUTED)).toBe(MUTED);
  });

  // The theming contract keeps these two fixed rather than deriving them from
  // the brand palette — "under par" must never read as a warning.
  it('does not take its colors from the passed theme value', () => {
    expect(toParColor(-1, '#ff00ff')).toBe('#27ae60');
    expect(toParColor(1, '#ff00ff')).toBe('#e74c3c');
  });
});
