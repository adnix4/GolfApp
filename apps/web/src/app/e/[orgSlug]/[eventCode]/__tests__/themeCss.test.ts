import { describe, it, expect } from 'vitest';
import { getContrastRatio } from '@gfp/theme';
import { buildThemeCss } from '../eventPageStyles';

const vars = (css: string) => Object.fromEntries(css.split(';').map(d => d.split(':') as [string, string]));
const palette = { primary: '#31572c', action: '#7fd18f', accent: '#8ba955', highlight: '#ecf39e', surface: '#ffffff' };

describe('buildThemeCss', () => {
  it('emits a readable action-text shade when the brand action is too light for links', () => {
    const v = vars(buildThemeCss(JSON.stringify(palette)));
    expect(v['--color-action']).toBe('#7fd18f');                // fills keep the brand
    expect(v['--color-action-text']).not.toBe('#7fd18f');
    expect(getContrastRatio(v['--color-action-text'], palette.surface)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(v['--color-highlight-text'], palette.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it('uses the brand as entered when the organizer prioritized it', () => {
    const v = vars(buildThemeCss(JSON.stringify({ ...palette, brandPriority: true })));
    expect(v['--color-action-text']).toBe('#7fd18f');
    expect(v['--color-brandPriority']).toBeUndefined(); // the flag is not a color
  });

  it('returns nothing for a missing or malformed theme', () => {
    expect(buildThemeCss(null)).toBe('');
    expect(buildThemeCss('{nope')).toBe('');
  });
});
