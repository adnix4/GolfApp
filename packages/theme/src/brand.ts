/**
 * @gfp/theme — brand palette audit.
 *
 * Organizers bring their own brand colors. Most failing pairings can be fixed
 * without touching the brand: the color keeps every place it is a FILL, and
 * text that would be drawn IN that color uses a companion shade of the same
 * hue that clears 4.5:1 ("paired"). Two pairings can't be rescued that way,
 * because the brand color itself is the text or the page:
 *
 *   - Primary on Surface: every heading and most body text is Primary on the
 *     page background.
 *   - A dark Surface: pages put white cards on Surface with Primary text, so
 *     a dark Surface turns the whole layout inside out.
 *
 * Those are "blocking": the editors and the API refuse to save them, and offer
 * fixes that keep the hue (a darker Primary, a paler Surface, a swap). The
 * organizer can instead set `brandPriority` on the theme, which accepts the
 * palette as entered: blocking issues become "accepted", and the companion
 * shades are dropped so the brand colors are used exactly everywhere. Labels
 * on fills (readableTextOn: black or white) stay automatic either way — that
 * never changes a brand color.
 */

import type { GFPTheme } from './index';
import {
  MIN_TEXT_CONTRAST, getContrastRatio, isLightSurface, isHexColor, mixUntil, readableOn, readableTextOn,
  relativeLuminance,
} from './color';
import { neutral } from './status';

/** Text colors derived from the brand: what the apps draw text in. */
export interface BrandTextColors {
  /** Links and text buttons on the page and on white cards (Action as text). */
  actionText:     string;
  /** Text on a Primary fill drawn in the Highlight color (mobile headers, web hero). */
  highlightText:  string;
  /** Text ON a Highlight fill (table headers, selected rows, callouts): Primary when it reads. */
  highlightLabel: string;
  /** Secondary text on a Highlight fill: the muted grey when it reads there. */
  highlightMuted: string;
}

/**
 * brandTextColors — the companion shades the apps use for brand-colored text.
 * With brandPriority the organizer's colors are used exactly as entered.
 * highlightMuted is not a brand color, so it is always kept readable.
 */
export function brandTextColors(theme: GFPTheme): BrandTextColors {
  const primaryOnHighlight = getContrastRatio(theme.primary, theme.highlight) >= MIN_TEXT_CONTRAST;
  const highlightLabel = theme.brandPriority || primaryOnHighlight ? theme.primary : readableTextOn(theme.highlight);
  const highlightMuted = getContrastRatio(neutral.mutedText, theme.highlight) >= MIN_TEXT_CONTRAST
    ? neutral.mutedText : readableTextOn(theme.highlight);
  if (theme.brandPriority) return { actionText: theme.action, highlightText: theme.highlight, highlightLabel, highlightMuted };
  return {
    actionText:    readableOn(theme.action, theme.surface),
    highlightText: readableOn(theme.highlight, theme.primary),
    highlightLabel,
    highlightMuted,
  };
}

export type BrandIssueId = 'surface-too-dark' | 'primary-on-surface' | 'action-text' | 'highlight-text';

/**
 *  blocking — save refused until fixed or brandPriority is set.
 *  paired   — the brand color stays; text uses `companion` instead. Nothing to do.
 *  accepted — fails, and the organizer chose their brand colors over it.
 */
export type BrandIssueKind = 'blocking' | 'paired' | 'accepted';

export interface BrandFix {
  /** Button text, e.g. "Darker Primary". */
  label:  string;
  /** The tokens to change. Applying it clears the issue. */
  patch:  Partial<GFPTheme>;
}

export interface BrandIssue {
  id:       BrandIssueId;
  kind:     BrandIssueKind;
  title:    string;
  detail:   string;
  /** Contrast of the brand pairing as entered. */
  ratio:    number;
  /** The shade text uses instead (paired issues only). */
  companion?: { color: string; ratio: number };
  /** Ways to fix it by changing the palette. */
  fixes:    BrandFix[];
}

const fmt = (r: number) => `${(Math.floor(r * 10) / 10).toFixed(1)}:1`;

/**
 * auditTheme — every accessibility problem in a palette, in the order an
 * organizer should deal with them. Empty when the palette passes as entered.
 * Returns [] while any token is not a complete hex color (mid-typing).
 */
export function auditTheme(theme: GFPTheme): BrandIssue[] {
  const { primary, action, highlight, surface } = theme;
  if (![primary, action, theme.accent, highlight, surface].every(isHexColor)) return [];
  const priority = !!theme.brandPriority;
  const hard: BrandIssueKind = priority ? 'accepted' : 'blocking';
  const issues: BrandIssue[] = [];

  const surfaceLight = isLightSurface(surface);
  const primaryRatio = getContrastRatio(primary, surface);

  if (!surfaceLight) {
    // A paler tint of the same Surface, then Primary darkened against it if needed.
    const paleSurface = mixUntil(surface, '#ffffff', isLightSurface);
    const fixedPrimary = readableOn(primary, paleSurface);
    const fixes: BrandFix[] = [{
      label: 'Paler Surface',
      patch: fixedPrimary === primary ? { surface: paleSurface } : { surface: paleSurface, primary: fixedPrimary },
    }];
    // A light Primary on a dark Surface is often the brand drawn "inverted".
    if (isLightSurface(primary) && primaryRatio >= MIN_TEXT_CONTRAST) {
      fixes.unshift({ label: 'Swap Primary and Surface', patch: { primary: surface, surface: primary } });
    }
    issues.push({
      id: 'surface-too-dark', kind: hard, ratio: primaryRatio, fixes,
      title: 'Surface is too dark',
      detail: 'Pages show white cards on the Surface color with text in Primary, so Surface needs to be a light tint.',
    });
  } else if (primaryRatio < MIN_TEXT_CONTRAST) {
    const fixes: BrandFix[] = [{ label: 'Darker Primary', patch: { primary: readableOn(primary, surface) } }];
    const paleSurface = mixUntil(surface, '#ffffff', c => getContrastRatio(primary, c) >= MIN_TEXT_CONTRAST);
    if (getContrastRatio(primary, paleSurface) >= MIN_TEXT_CONTRAST) fixes.push({ label: 'Paler Surface', patch: { surface: paleSurface } });
    issues.push({
      id: 'primary-on-surface', kind: hard, ratio: primaryRatio, fixes,
      title: 'Primary text is hard to read',
      detail: `Headings and most text are Primary on the Surface color: ${fmt(primaryRatio)}, below the ${MIN_TEXT_CONTRAST}:1 minimum.`,
    });
  }

  const actionRatio = getContrastRatio(action, surface);
  if (actionRatio < MIN_TEXT_CONTRAST) {
    const shade = readableOn(action, surface);
    // On a light Surface the shade is darker; on a dark one (only possible with
    // brandPriority, or while a dark Surface is still being fixed) it is lighter.
    const way = relativeLuminance(shade) < relativeLuminance(action) ? 'darker' : 'lighter';
    issues.push(priority ? {
      id: 'action-text', kind: 'accepted', ratio: actionRatio,
      fixes: [{ label: `${way === 'darker' ? 'Darker' : 'Lighter'} Action`, patch: { action: shade } }],
      title: 'Action is hard to read as text',
      detail: `Links and text buttons use your Action color as entered: ${fmt(actionRatio)}, below ${MIN_TEXT_CONTRAST}:1.`,
    } : {
      id: 'action-text', kind: 'paired', ratio: actionRatio, fixes: [],
      companion: { color: shade, ratio: getContrastRatio(shade, surface) },
      title: `Action text uses a ${way} shade`,
      detail: `Your Action color is ${fmt(actionRatio)} on Surface, so links and text buttons use a ${way} shade of it. Buttons filled with Action keep your exact color.`,
    });
  }

  // Highlight and Primary meet both ways round: Highlight text on a Primary
  // header, and Primary text on a Highlight fill (table headers, selected
  // rows). Contrast is symmetric, so one ratio covers both.
  const highlightRatio = getContrastRatio(highlight, primary);
  if (highlightRatio < MIN_TEXT_CONTRAST) {
    const shade = readableOn(highlight, primary);
    const label = readableTextOn(highlight);
    const labelName = label === '#ffffff' ? 'white' : 'black';
    issues.push(priority ? {
      id: 'highlight-text', kind: 'accepted', ratio: highlightRatio, fixes: [{ label: 'Adjusted Highlight', patch: { highlight: shade } }],
      title: 'Highlight and Primary are hard to read together',
      detail: `Header text in Highlight on Primary, and Primary text on Highlight areas, are ${fmt(highlightRatio)} — below ${MIN_TEXT_CONTRAST}:1.`,
    } : {
      id: 'highlight-text', kind: 'paired', ratio: highlightRatio, fixes: [],
      companion: { color: shade, ratio: getContrastRatio(shade, primary) },
      title: 'Header text uses an adjusted Highlight',
      detail: `Your Highlight color is ${fmt(highlightRatio)} against Primary, so header text uses an adjusted shade of it, `
        + `and table headers and selected rows use ${labelName} text on Highlight. Highlighted fills keep your exact color.`,
    });
  }

  return issues;
}

/** True when the palette can't be saved as it stands (a blocking issue, no brandPriority). */
export function isThemeSaveBlocked(theme: GFPTheme): boolean {
  return auditTheme(theme).some(i => i.kind === 'blocking');
}
