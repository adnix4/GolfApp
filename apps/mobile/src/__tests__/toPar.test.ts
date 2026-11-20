import { describe, it, expect } from 'vitest';
import { chipSpeech, formatToPar, spokenToPar, toParColor } from '../lib/toPar';

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

describe('spokenToPar', () => {
  it('reads even, under and over par in words', () => {
    expect(spokenToPar(0)).toBe('even par');
    expect(spokenToPar(-2)).toBe('2 under par');
    expect(spokenToPar(1)).toBe('1 over par');
  });
});

describe('chipSpeech', () => {
  it('reads a score with its to-par', () => expect(chipSpeech('Score', '7', 2)).toBe('Score 7, 2 over par'));
  it('reads an empty score', () => expect(chipSpeech('Score', '—', null)).toBe('Score: none yet'));
  it('spells out the hole handicap', () => expect(chipSpeech('HCP', '2')).toBe('Hole handicap 2'));
  it('reads yardages as tees and yards', () => expect(chipSpeech('White', '500y')).toBe('White tees, 500 yards'));
  it('reads plain chips as label and value', () => {
    expect(chipSpeech('Through', '3')).toBe('Through 3');
    expect(chipSpeech('Round', '30', -2)).toBe('Round 30, 2 under par');
  });
});
