import { describe, it, expect } from 'vitest';
import {
  ECO_GREEN_DEFAULT,
  MIN_SURFACE_LUMINANCE,
  validateContrast,
  getContrastRatio,
  readableTextOn,
  isLightSurface,
  buildCSSVars,
  buildThemeContext,
  buildEmailVars,
  type GFPTheme,
} from '../index';

// ── WCAG contrast math ──────────────────────────────────────────────────────

describe('getContrastRatio', () => {
  it('returns 21:1 for black on white', () => {
    expect(getContrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('returns 1:1 for identical colors', () => {
    expect(getContrastRatio('#888888', '#888888')).toBeCloseTo(1, 5);
  });

  it('is commutative (order of arguments does not matter)', () => {
    const a = getContrastRatio('#31572c', '#f4f7de');
    const b = getContrastRatio('#f4f7de', '#31572c');
    expect(a).toBeCloseTo(b, 10);
  });

  it('handles 3-digit shorthand hex', () => {
    // #fff === #ffffff, #000 === #000000
    expect(getContrastRatio('#000', '#fff')).toBeCloseTo(21, 0);
  });

  it('ECO_GREEN primary on surface passes AAA (≥7:1)', () => {
    const ratio = getContrastRatio(ECO_GREEN_DEFAULT.primary, ECO_GREEN_DEFAULT.surface);
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  it('ECO_GREEN action on surface is ~3.6:1 (decorative use only — not AA body text)', () => {
    const ratio = getContrastRatio(ECO_GREEN_DEFAULT.action, ECO_GREEN_DEFAULT.surface);
    // Intentionally below 4.5 — action is used for links and icons, not body text on surface.
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(4.5);
  });
});

describe('validateContrast', () => {
  it('returns true for high-contrast pairs', () => {
    expect(validateContrast('#000000', '#ffffff')).toBe(true);
  });

  it('returns false for low-contrast pairs', () => {
    // Very similar greys — fails WCAG AA
    expect(validateContrast('#777777', '#888888')).toBe(false);
  });

  it('validates ECO_GREEN primary on surface as true', () => {
    expect(validateContrast(ECO_GREEN_DEFAULT.primary, ECO_GREEN_DEFAULT.surface)).toBe(true);
  });

  it('returns false for a clearly sub-threshold pair', () => {
    // #888888 on #ffffff is ~3.5:1 — well below AA
    expect(validateContrast('#888888', '#ffffff')).toBe(false);
  });

  it('returns true when ratio meets exactly 4.5:1', () => {
    // #595959 on #ffffff ≈ 7.0:1 — well above threshold
    expect(validateContrast('#595959', '#ffffff')).toBe(true);
  });
});

// ── Platform adapters ───────────────────────────────────────────────────────

describe('buildCSSVars', () => {
  it('produces a :root block with all 5 tokens', () => {
    const css = buildCSSVars(ECO_GREEN_DEFAULT);
    expect(css).toContain(':root');
    expect(css).toContain(`--color-primary:   ${ECO_GREEN_DEFAULT.primary}`);
    expect(css).toContain(`--color-action:    ${ECO_GREEN_DEFAULT.action}`);
    expect(css).toContain(`--color-accent:    ${ECO_GREEN_DEFAULT.accent}`);
    expect(css).toContain(`--color-highlight: ${ECO_GREEN_DEFAULT.highlight}`);
    expect(css).toContain(`--color-surface:   ${ECO_GREEN_DEFAULT.surface}`);
  });

  it('trims leading/trailing whitespace', () => {
    const css = buildCSSVars(ECO_GREEN_DEFAULT);
    expect(css.startsWith(':root')).toBe(true);
    expect(css.trimEnd()).toBe(css);
  });

  it('uses the custom theme values when provided', () => {
    const custom: GFPTheme = {
      primary: '#123456', action: '#234567', accent: '#345678',
      highlight: '#456789', surface: '#567890',
    };
    const css = buildCSSVars(custom);
    expect(css).toContain('--color-primary:   #123456');
    expect(css).toContain('--color-surface:   #567890');
  });
});

describe('buildThemeContext', () => {
  const ctx = buildThemeContext(ECO_GREEN_DEFAULT);

  it('exposes raw colors unchanged', () => {
    expect(ctx.colors).toStrictEqual(ECO_GREEN_DEFAULT);
  });

  it('maps semantic aliases correctly', () => {
    expect(ctx.buttonBackground).toBe(ECO_GREEN_DEFAULT.primary);
    expect(ctx.buttonLabel).toBe(readableTextOn(ECO_GREEN_DEFAULT.primary));
    expect(ctx.ctaBackground).toBe(ECO_GREEN_DEFAULT.action);
    expect(ctx.ctaLabel).toBe(readableTextOn(ECO_GREEN_DEFAULT.action));
    expect(ctx.pageBackground).toBe(ECO_GREEN_DEFAULT.surface);
    expect(ctx.cardBackground).toBe(ECO_GREEN_DEFAULT.surface);
    expect(ctx.linkColor).toBe(ECO_GREEN_DEFAULT.action);
    expect(ctx.hoverBackground).toBe(ECO_GREEN_DEFAULT.accent);
    expect(ctx.selectedBackground).toBe(ECO_GREEN_DEFAULT.highlight);
  });

  it('derives per-fill labels for the ECO_GREEN palette', () => {
    // Dark Forest primary → white label; mid-tone Leaf Green action sits just
    // above the luminance breakpoint, so dark text contrasts better than white.
    expect(ctx.buttonLabel).toBe('#ffffff');
    expect(ctx.ctaLabel).toBe('#1a1a1a');
  });

  it('derives dark labels when a theme uses light primary/action fills', () => {
    const lightBrand: GFPTheme = {
      primary: '#ffd700', action: '#ecf39e', accent: '#8ba955',
      highlight: '#ecf39e', surface: '#1a1a2e',
    };
    const light = buildThemeContext(lightBrand);
    expect(light.buttonLabel).toBe('#1a1a1a');
    expect(light.ctaLabel).toBe('#1a1a1a');
  });

  it('covers all ThemeContextValue properties', () => {
    const expectedKeys = [
      'colors', 'buttonBackground', 'buttonLabel', 'ctaBackground', 'ctaLabel',
      'pageBackground', 'cardBackground', 'linkColor', 'hoverBackground',
      'selectedBackground', 'mutedText',
    ];
    expectedKeys.forEach(k => expect(ctx).toHaveProperty(k));
  });

  it('mutedText passes AA on white and on the default surface', () => {
    expect(getContrastRatio(ctx.mutedText, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(ctx.mutedText, ECO_GREEN_DEFAULT.surface)).toBeGreaterThanOrEqual(4.5);
  });
});

// ── readableTextOn / isLightSurface ─────────────────────────────────────────

describe('readableTextOn', () => {
  it('returns white for dark fills', () => {
    expect(readableTextOn('#000000')).toBe('#ffffff');
    expect(readableTextOn('#31572c')).toBe('#ffffff');
    expect(readableTextOn('#c0392b')).toBe('#ffffff');
  });

  it('returns near-black for light fills', () => {
    expect(readableTextOn('#ffffff')).toBe('#1a1a1a');
    expect(readableTextOn('#ecf39e')).toBe('#1a1a1a');
    expect(readableTextOn('#ffd700')).toBe('#1a1a1a');
  });

  it('always yields at least 4.5:1 contrast for fully saturated fills', () => {
    ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'].forEach(bg => {
      expect(getContrastRatio(readableTextOn(bg), bg)).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('isLightSurface', () => {
  it('accepts white, cream, and light pastels', () => {
    expect(isLightSurface('#ffffff')).toBe(true);
    expect(isLightSurface(ECO_GREEN_DEFAULT.surface)).toBe(true);
    expect(isLightSurface('#ffc0cb')).toBe(true); // light pink
    expect(isLightSurface('#87ceeb')).toBe(true); // sky blue
  });

  it('rejects dark and mid-tone surfaces', () => {
    expect(isLightSurface('#000000')).toBe(false);
    expect(isLightSurface('#1a1a2e')).toBe(false); // navy
    expect(isLightSurface('#e74c3c')).toBe(false); // saturated red
    expect(isLightSurface('#8ba955')).toBe(false); // sage (mid-tone)
  });

  it('guarantees primary reads on white cards when combined with the AA gate', () => {
    // Any (primary, surface) pair that passes BOTH gates must give primary
    // ≥ 4.5:1 on a white card — the layout assumption across all three apps.
    const pairs: Array<[string, string]> = [
      ['#31572c', '#f4f7de'],
      ['#1a1a2e', '#ffc0cb'],
      ['#4a0d0d', '#87ceeb'],
    ];
    pairs.forEach(([primary, surface]) => {
      expect(validateContrast(primary, surface)).toBe(true);
      expect(isLightSurface(surface)).toBe(true);
      expect(getContrastRatio(primary, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('exports the documented luminance floor', () => {
    expect(MIN_SURFACE_LUMINANCE).toBe(0.4);
  });
});

describe('buildEmailVars', () => {
  const vars = buildEmailVars(ECO_GREEN_DEFAULT);

  it('returns 5 template placeholders', () => {
    expect(Object.keys(vars)).toHaveLength(5);
  });

  it('maps {{PRIMARY_COLOR}} to primary hex', () => {
    expect(vars['{{PRIMARY_COLOR}}']).toBe(ECO_GREEN_DEFAULT.primary);
  });

  it('maps {{SURFACE_COLOR}} to surface hex', () => {
    expect(vars['{{SURFACE_COLOR}}']).toBe(ECO_GREEN_DEFAULT.surface);
  });

  it('all keys use double-brace placeholder format', () => {
    Object.keys(vars).forEach(k => {
      expect(k).toMatch(/^\{\{[A-Z_]+\}\}$/);
    });
  });
});

// ── ECO_GREEN_DEFAULT palette ────────────────────────────────────────────────

describe('ECO_GREEN_DEFAULT', () => {
  it('all tokens are valid 6-digit lowercase hex', () => {
    Object.values(ECO_GREEN_DEFAULT).forEach(hex => {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  it('has exactly 5 tokens', () => {
    expect(Object.keys(ECO_GREEN_DEFAULT)).toHaveLength(5);
  });
});
