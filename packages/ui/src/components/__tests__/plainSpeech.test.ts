import { describe, it, expect } from 'vitest';
import { hasGlyph, plainSpeech } from '../plainSpeech';

describe('plainSpeech', () => {
  it('drops leading and trailing decoration', () => {
    expect(plainSpeech('🎉 You won 2 items — $40 to pay')).toBe('You won 2 items — $40 to pay');
    expect(plainSpeech('Set Up →')).toBe('Set Up');
    expect(plainSpeech('← Choose a different tournament')).toBe('Choose a different tournament');
    expect(plainSpeech('Admin Has Scanned ✓')).toBe('Admin Has Scanned');
    expect(plainSpeech('⚠️ Card declined')).toBe('Card declined');
    expect(plainSpeech('🏌️ Free agent pool')).toBe('Free agent pool');
  });

  it('keeps punctuation tight where a glyph sat before it', () => {
    expect(plainSpeech('A new code is on its way. ✉️')).toBe('A new code is on its way.');
    expect(plainSpeech('Hide ↑')).toBe('Hide');
  });

  it('says the refresh glyph and a numeric arrow as words', () => {
    expect(plainSpeech('Tap ↻ above to try again.')).toBe('Tap Refresh above to try again.');
    expect(plainSpeech('12.4 → 11.9')).toBe('12.4 to 11.9');
  });

  it('covers every glyph the scorer screens use', () => {
    // From a sweep of apps/mobile: each must go, or the screen reader names it
    // (↻ is said as "Refresh" — tested above).
    const used = ['←', '→', '↑', '↓', '›', '▲', '▼', '⏸', '⚠️', '⛳', '★', '✓', '✎', '✕', '✉️', '☁️',
      '📧', '🏌️', '📬', '🎉', '🔴', '🙋', '🏆', '👥', '🎁', '📊', '📱', '📴', '📡', '🏁', '📍', '💨', '🎯', '🎰', '🤝', '🕳'];
    for (const g of used) expect(plainSpeech(`a ${g} b`), g).toBe('a b');
  });

  it('keeps ordinary typography', () => {
    expect(plainSpeech('Hole 2 — Par 5 · 500 yards • “quoted” $40.00')).toBe('Hole 2 — Par 5 · 500 yards • “quoted” $40.00');
  });

  it('removes a joined emoji sequence whole', () => {
    expect(plainSpeech('👨‍👩‍👧 Family pass')).toBe('Family pass');
  });

  it('leaves plain text alone and empties a glyph-only string', () => {
    expect(plainSpeech('Scores Synced')).toBe('Scores Synced');
    expect(plainSpeech('🏆')).toBe('');
  });
});

describe('hasGlyph', () => {
  it('spots emoji and arrows, not ordinary punctuation', () => {
    expect(hasGlyph('Next →')).toBe(true);
    expect(hasGlyph('📬')).toBe(true);
    expect(hasGlyph('Hole 2 — Par 5 · 500 yards')).toBe(false);
  });
});
