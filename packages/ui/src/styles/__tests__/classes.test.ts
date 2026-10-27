import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ECO_GREEN_DEFAULT, buildThemeContext, status } from '@gfp/theme';
import { buildClasses } from '../classes';

const eco = buildClasses(buildThemeContext(ECO_GREEN_DEFAULT));

describe('buildClasses', () => {
  it('takes every colour from a token, never a literal', () => {
    const src = readFileSync(join(__dirname, '..', 'classes.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(src).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('carries the org brand colours, so a call site adds none', () => {
    const navy = buildClasses(buildThemeContext({
      ...ECO_GREEN_DEFAULT, primary: '#1b2a4a', accent: '#c9a227',
    }));
    expect(navy.title.color).toBe('#1b2a4a');
    expect(navy.fieldLabel.color).toBe('#1b2a4a');
    expect(navy.input.borderColor).toBe('#c9a227');
    expect(navy.cancelBtn.borderColor).toBe('#c9a227');
    expect(navy.submitBtn.backgroundColor).toBe('#1b2a4a');
  });

  it('labels the submit button with buttonLabel, which flips on a light primary', () => {
    expect(eco.submitText.color).toBe('#ffffff');
    const pale = buildClasses(buildThemeContext({ ...ECO_GREEN_DEFAULT, primary: '#f5e663' }));
    expect(pale.submitText.color).toBe('#1a1a1a');
  });

  it('keeps status colours the same for every org', () => {
    const other = buildClasses(buildThemeContext({ ...ECO_GREEN_DEFAULT, primary: '#7a1f1f' }));
    expect(other.errorText.color).toBe(status.dangerText);
    expect(other.errorBox).toEqual(eco.errorBox);
  });
});
