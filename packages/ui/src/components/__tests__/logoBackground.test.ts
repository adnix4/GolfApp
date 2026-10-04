import { describe, it, expect } from 'vitest';
import { getContrastRatio } from '@gfp/theme';
import { LIGHT_LOGO_CONTRAST, LOGO_FALLBACK_BG, pickLogoBackground, representativeColor } from '../logoBackground';

const PRIMARY = '#1b4332'; // a dark event brand colour

describe('representativeColor', () => {
  it('reads each platform\'s own field, with its fallback', () => {
    expect(representativeColor({ platform: 'ios', background: '#111111', primary: '#222222' })).toBe('#111111');
    expect(representativeColor({ platform: 'ios', background: null, primary: '#222222' })).toBe('#222222');
    expect(representativeColor({ platform: 'android', dominant: '#333333', average: '#444444' })).toBe('#333333');
    expect(representativeColor({ platform: 'android', dominant: null, average: '#444444' })).toBe('#444444');
    expect(representativeColor({ platform: 'web', dominant: '#555555' })).toBe('#555555');
  });

  it('is null when the platform reported nothing usable', () => {
    expect(representativeColor({ platform: 'ios' })).toBeNull();
    expect(representativeColor({ platform: 'web', dominant: null })).toBeNull();
  });
});

describe('pickLogoBackground', () => {
  it('puts a dark logo on white', () => {
    expect(pickLogoBackground({ platform: 'web', dominant: '#000000' }, PRIMARY)).toBe(LOGO_FALLBACK_BG);
  });

  // The case the component exists for: sponsors hand over white-on-transparent
  // logos that vanish on a fixed white card.
  it('puts a white or very light logo on the event primary colour', () => {
    expect(pickLogoBackground({ platform: 'web', dominant: '#ffffff' }, PRIMARY)).toBe(PRIMARY);
    expect(pickLogoBackground({ platform: 'ios', background: '#f5f5f5' }, PRIMARY)).toBe(PRIMARY);
  });

  it('switches exactly at the 2:1 contrast line', () => {
    // #aaaaaa is above 2:1 against white (2.32); #bbbbbb is just below (1.92).
    expect(getContrastRatio('#aaaaaa', '#ffffff')).toBeGreaterThanOrEqual(LIGHT_LOGO_CONTRAST);
    expect(getContrastRatio('#bbbbbb', '#ffffff')).toBeLessThan(LIGHT_LOGO_CONTRAST);
    expect(pickLogoBackground({ platform: 'web', dominant: '#aaaaaa' }, PRIMARY)).toBe(LOGO_FALLBACK_BG);
    expect(pickLogoBackground({ platform: 'web', dominant: '#bbbbbb' }, PRIMARY)).toBe(PRIMARY);
  });

  it('falls back to white when nothing was sampled', () => {
    expect(pickLogoBackground({ platform: 'android' }, PRIMARY)).toBe(LOGO_FALLBACK_BG);
  });
});
