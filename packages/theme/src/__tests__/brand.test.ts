import { describe, it, expect } from 'vitest';
import {
  ECO_GREEN_DEFAULT, auditTheme, brandTextColors, isThemeSaveBlocked, buildThemeContext, buildCSSVars,
  getContrastRatio, isLightSurface, type GFPTheme,
} from '../index';

const theme = (t: Partial<GFPTheme>): GFPTheme => ({ ...ECO_GREEN_DEFAULT, ...t });
const apply = (t: GFPTheme, patch: Partial<GFPTheme>) => ({ ...t, ...patch });

describe('brandTextColors', () => {
  it('pairs a too-light Action with a darker shade for text, keeping the hue', () => {
    const { actionText } = brandTextColors(ECO_GREEN_DEFAULT);
    expect(getContrastRatio(ECO_GREEN_DEFAULT.action, ECO_GREEN_DEFAULT.surface)).toBeLessThan(4.5);
    expect(getContrastRatio(actionText, ECO_GREEN_DEFAULT.surface)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(actionText, '#ffffff')).toBeGreaterThanOrEqual(4.5); // white cards too
    // still green: green channel dominant
    const [r, g, b] = [1, 3, 5].map(i => parseInt(actionText.slice(i, i + 2), 16));
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('leaves a color that already reads untouched', () => {
    const t = theme({ action: '#1d4ed8', highlight: '#ffffff' });
    expect(brandTextColors(t)).toMatchObject({ actionText: '#1d4ed8', highlightText: '#ffffff', highlightLabel: t.primary });
  });

  it('labels a Highlight fill with Primary when it reads, black or white when it does not', () => {
    expect(brandTextColors(ECO_GREEN_DEFAULT).highlightLabel).toBe(ECO_GREEN_DEFAULT.primary);
    expect(brandTextColors(ECO_GREEN_DEFAULT).highlightMuted).toBe('#4b5563');
    const dark = theme({ highlight: '#5a8a54' }); // 2.05:1 against Dark Forest
    const { highlightLabel, highlightMuted } = brandTextColors(dark);
    expect(highlightLabel).not.toBe(dark.primary);
    expect(getContrastRatio(highlightLabel, dark.highlight)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(highlightMuted, dark.highlight)).toBeGreaterThanOrEqual(4.5);
    // brandPriority keeps Primary on the fill; the muted grey (not a brand color) stays readable.
    const exact = brandTextColors({ ...dark, brandPriority: true });
    expect(exact.highlightLabel).toBe(dark.primary);
    expect(getContrastRatio(exact.highlightMuted, dark.highlight)).toBeGreaterThanOrEqual(4.5);
  });

  it('pairs a Highlight that is too dark for header text on Primary', () => {
    const t = theme({ highlight: '#4a7a44' });
    const { highlightText } = brandTextColors(t);
    expect(getContrastRatio(highlightText, t.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it('uses the brand colors exactly when the organizer prioritizes them', () => {
    const t = theme({ brandPriority: true });
    expect(brandTextColors(t)).toMatchObject({ actionText: t.action, highlightText: t.highlight, highlightLabel: t.primary });
    expect(buildThemeContext(t).linkColor).toBe(t.action);
  });

  it('reaches the web as CSS variables', () => {
    const css = buildCSSVars(ECO_GREEN_DEFAULT);
    expect(css).toContain(`--color-action-text:    ${brandTextColors(ECO_GREEN_DEFAULT).actionText}`);
    expect(css).toContain('--color-highlight-text:');
  });
});

describe('auditTheme', () => {
  it('reports only the paired Action text for the default palette — nothing blocks', () => {
    const issues = auditTheme(ECO_GREEN_DEFAULT);
    expect(issues.map(i => [i.id, i.kind])).toEqual([['action-text', 'paired']]);
    expect(issues[0].companion!.ratio).toBeGreaterThanOrEqual(4.5);
    expect(isThemeSaveBlocked(ECO_GREEN_DEFAULT)).toBe(false);
  });

  it('is empty while a token is mid-typing', () => {
    expect(auditTheme(theme({ primary: '#31' }))).toEqual([]);
  });

  it('blocks a Primary that is hard to read on Surface, and both fixes clear it', () => {
    const t = theme({ primary: '#7a9a74', surface: '#ffffff' });
    const issue = auditTheme(t).find(i => i.id === 'primary-on-surface')!;
    expect(issue.kind).toBe('blocking');
    expect(isThemeSaveBlocked(t)).toBe(true);
    expect(issue.fixes.map(f => f.label)).toEqual(['Darker Primary']); // white can't get paler
    for (const f of issue.fixes) expect(isThemeSaveBlocked(apply(t, f.patch))).toBe(false);
  });

  it('offers a paler Surface when one exists', () => {
    const t = theme({ primary: '#4a6a44', surface: '#c8d4b0' });
    const issue = auditTheme(t).find(i => i.id === 'primary-on-surface')!;
    expect(issue.fixes.map(f => f.label)).toEqual(['Darker Primary', 'Paler Surface']);
    for (const f of issue.fixes) expect(isThemeSaveBlocked(apply(t, f.patch))).toBe(false);
  });

  it('blocks a dark Surface and offers a swap when the brand is drawn inverted', () => {
    const t = theme({ primary: '#f4f7de', surface: '#31572c' });
    const issue = auditTheme(t).find(i => i.id === 'surface-too-dark')!;
    expect(issue.kind).toBe('blocking');
    expect(issue.fixes.map(f => f.label)).toEqual(['Swap Primary and Surface', 'Paler Surface']);
    for (const f of issue.fixes) {
      const fixed = apply(t, f.patch);
      expect(isLightSurface(fixed.surface)).toBe(true);
      expect(isThemeSaveBlocked(fixed)).toBe(false);
    }
  });

  it('a paler Surface also darkens Primary when it has to', () => {
    const t = theme({ primary: '#8899aa', surface: '#223344' });
    const fix = auditTheme(t)[0].fixes.find(f => f.label === 'Paler Surface')!;
    expect(fix.patch.primary).toBeDefined();
    expect(isThemeSaveBlocked(apply(t, fix.patch))).toBe(false);
  });

  it('brandPriority accepts the failing palette and stops pairing', () => {
    const t = theme({ primary: '#f4f7de', surface: '#31572c', brandPriority: true });
    const issues = auditTheme(t);
    expect(issues.every(i => i.kind === 'accepted')).toBe(true);
    expect(isThemeSaveBlocked(t)).toBe(false);
    // Paired-by-default issues still offer a fix the organizer can take.
    const action = auditTheme(theme({ brandPriority: true })).find(i => i.id === 'action-text')!;
    expect(action.kind).toBe('accepted');
    expect(action.fixes[0].label).toBe('Darker Action');
  });
});
