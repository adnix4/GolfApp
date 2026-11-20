/**
 * @gfp/theme — Golf Fundraiser Pro Color System
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS:
 *   The spec requires a 5-token color system that flows from a single source
 *   of truth out to EVERY platform:
 *     • React Native mobile app        → ThemeContext via buildThemeContext()
 *     • Expo Router admin web          → CSS custom properties via buildCSSVars()
 *     • Next.js public leaderboard     → CSS custom properties via buildCSSVars()
 *     • SendGrid email templates       → inline hex substitution ({{PRIMARY_COLOR}})
 *     • PDFs (print scorecards)        → hex values passed to PDF generator
 *
 *   One palette object → four delivery mechanisms → zero drift between surfaces.
 *
 * TOKEN SEMANTICS (what each token means, not just what it looks like):
 *   primary   — dominant brand color; nav, header, footer, primary button fill
 *   action    — call-to-action color; links, active tabs, leaderboard highlights
 *   accent    — supporting brand color; hover states, secondary badges
 *   highlight — selection/attention color; selected states, callout banners
 *   surface   — background color; page bg, card surfaces, email body bg
 *
 * WCAG REQUIREMENT (from spec §6.1):
 *   "Contrast validation blocks theme save if primary text pairing fails."
 *   brand.ts audits the whole palette; the save gates (admin editors and the
 *   API) refuse a blocking failure unless the organizer sets brandPriority.
 */

import { readableTextOn } from './color';
import { brandTextColors } from './brand';
import { neutral } from './status';

// ── TOKEN TYPE ────────────────────────────────────────────────────────────────

/**
 * GFPTheme is the shape of the theme JSONB column in the organizations table.
 * It is also the shape of the per-event config.theme_override JSONB.
 *
 * All color values are CSS hex strings: "#rrggbb".
 */
export interface GFPTheme {
  /** Nav, header, footer, primary button fill */
  primary:   string;
  /** CTAs, links, active tabs, leaderboard highlights */
  action:    string;
  /** Hover states, secondary badges, sponsor strip background */
  accent:    string;
  /** Selected states, callout banners, QR borders */
  highlight: string;
  /** Page backgrounds, card surfaces, email body background */
  surface:   string;
  /**
   * The organizer chose their exact brand colors over the accessibility
   * rules: a failing palette may be saved, and text is drawn in the brand
   * colors as entered instead of the readable companion shades. See brand.ts.
   */
  brandPriority?: boolean;
}

// ── DEFAULT PALETTE ───────────────────────────────────────────────────────────

/**
 * ECO_GREEN_DEFAULT is the out-of-the-box palette every new organization gets.
 * Organizations can override any token by saving a custom GFPTheme to their
 * organizations.theme JSONB column.  NULL in that column = use this default.
 *
 * WCAG contrast ratios for this palette (spec §6.1):
 *   primary (#31572c) on surface (#f4f7de) ≈ 7.4:1  → AAA ✓
 *   action  (#409151) on surface (#f4f7de) ≈ 3.6:1  → fails AA as text, so
 *     link text uses actionText, a darker shade of it (brand.ts)
 *
 * Color names are informal nicknames for developer communication only.
 */
export const ECO_GREEN_DEFAULT: GFPTheme = {
  primary:   '#31572c', // "Dark Forest"  — deep green, high contrast
  action:    '#409151', // "Leaf Green"   — mid green, button fills
  accent:    '#8ba955', // "Sage"         — muted green, decorative use
  highlight: '#ecf39e', // "Pale Lime"    — very light, attention-grabbing
  surface:   '#f4f7de', // "Cream"        — warm off-white background
};

// ── COLOR MATHS + BRAND AUDIT ─────────────────────────────────────────────────

export * from './color';
export * from './brand';

// ── PLATFORM ADAPTERS ─────────────────────────────────────────────────────────

/**
 * buildCSSVars — generates a CSS custom property block from a GFPTheme.
 *
 * WHY THIS APPROACH:
 *   Next.js injects this string into the root layout.tsx at SSR time, so
 *   CSS custom properties are available immediately on first paint — zero
 *   flash of unstyled content.  Expo Router web uses the same mechanism.
 *
 * OUTPUT EXAMPLE:
 *   :root {
 *     --color-primary: #31572c;
 *     --color-action: #409151;
 *     ...
 *   }
 *
 * Then any component can do:  color: var(--color-primary);
 * Text drawn in a brand color uses the derived vars: links are
 * var(--color-action-text), never var(--color-action).
 *
 * @param theme  a GFPTheme (org override or ECO_GREEN_DEFAULT)
 * @returns      a complete CSS :root { } block as a string
 */
export function buildCSSVars(theme: GFPTheme): string {
  const text = brandTextColors(theme);
  return `
:root {
  --color-primary:   ${theme.primary};
  --color-action:    ${theme.action};
  --color-accent:    ${theme.accent};
  --color-highlight: ${theme.highlight};
  --color-surface:   ${theme.surface};
  --color-on-primary: ${readableTextOn(theme.primary)};
  --color-on-action:  ${readableTextOn(theme.action)};
  --color-action-text:    ${text.actionText};
  --color-highlight-text: ${text.highlightText};
  --color-on-highlight:   ${text.highlightLabel};
  --color-on-highlight-muted: ${text.highlightMuted};
}
`.trim();
}

/**
 * ThemeContextValue — the shape of the object that React Native components
 * receive from the ThemeProvider's context.  Components destructure only
 * what they need, keeping them decoupled from the full GFPTheme structure.
 */
export interface ThemeContextValue {
  /** Raw token values */
  colors: GFPTheme;

  /**
   * Derived semantic aliases for common use cases.
   * These map token names to more component-friendly names so components
   * don't need to know which token drives, say, the button background.
   */
  buttonBackground:   string;  // = primary
  buttonLabel:        string;  // = readableTextOn(primary) — never hardcode '#fff'
  ctaBackground:      string;  // = action
  ctaLabel:           string;  // = readableTextOn(action)
  pageBackground:     string;  // = surface
  cardBackground:     string;  // = surface
  linkColor:          string;  // = actionText
  hoverBackground:    string;  // = accent
  selectedBackground: string;  // = highlight

  /**
   * Action as TEXT (links, text buttons) on the page or a white card: a
   * darker shade of action that reads at 4.5:1, or action itself when it
   * already does or the organizer set brandPriority. Fills keep colors.action.
   */
  actionText:         string;
  /** Highlight as TEXT on a primary fill (screen headers). Same rules. */
  highlightText:      string;
  /**
   * Text ON a highlight fill (table headers, selected rows, callouts): primary
   * when it reads there, else black or white. Use instead of colors.primary
   * inside anything filled with colors.highlight.
   */
  highlightLabel:     string;
  /** Secondary text on a highlight fill: mutedText when it reads there. */
  highlightMuted:     string;

  /**
   * Neutral secondary-text color for hints, captions, and metadata.
   * Deliberately NOT a brand token: accent (the old choice at many call
   * sites) is decorative and routinely fails WCAG AA as text — e.g. the
   * default Sage on white is ~2.7:1.  This slate reads ≥ 4.5:1 on white
   * and on any surface passing isLightSurface().
   */
  mutedText:          string;
}

/**
 * buildThemeContext — converts a raw GFPTheme into a ThemeContextValue that
 * React Native components consume via the useTheme() hook.
 *
 * WHY DERIVED ALIASES:
 *   If a designer later decides CTAs should use "accent" instead of "action",
 *   only this function changes — every component that calls useTheme().ctaBackground
 *   automatically gets the new color without touching component code.
 *
 * @param theme  a GFPTheme (org override or ECO_GREEN_DEFAULT)
 * @returns      a ThemeContextValue ready to be placed in React context
 */
export function buildThemeContext(theme: GFPTheme): ThemeContextValue {
  const text = brandTextColors(theme);
  return {
    colors: theme,

    // Semantic mappings — document the intent, not just the value.
    // Label colors are derived per-fill (not from surface) so they stay
    // readable even for legacy themes saved before contrast validation.
    buttonBackground:   theme.primary,
    buttonLabel:        readableTextOn(theme.primary),
    ctaBackground:      theme.action,
    ctaLabel:           readableTextOn(theme.action),
    pageBackground:     theme.surface,
    cardBackground:     theme.surface,
    linkColor:          text.actionText,
    hoverBackground:    theme.accent,
    selectedBackground: theme.highlight,
    actionText:         text.actionText,
    highlightText:      text.highlightText,
    highlightLabel:     text.highlightLabel,
    highlightMuted:     text.highlightMuted,
    mutedText:          neutral.mutedText,
  };
}

/**
 * buildEmailVars — returns a flat object of placeholder-to-hex-value mappings
 * used by the SendGrid template renderer.
 *
 * HOW EMAIL THEMING WORKS:
 *   Email HTML templates stored in the email_templates table contain placeholders
 *   like {{PRIMARY_COLOR}}.  At send time, the API calls buildEmailVars() and
 *   substitutes each placeholder with the org's actual hex value.
 *   This means emails are branded without storing color-specific HTML per org.
 *
 * @param theme  a GFPTheme (org override or ECO_GREEN_DEFAULT)
 * @returns      a record of template variable names to hex color strings
 */
export function buildEmailVars(theme: GFPTheme): Record<string, string> {
  return {
    '{{PRIMARY_COLOR}}':   theme.primary,
    '{{ACTION_COLOR}}':    theme.action,
    '{{ACCENT_COLOR}}':    theme.accent,
    '{{HIGHLIGHT_COLOR}}': theme.highlight,
    '{{SURFACE_COLOR}}':   theme.surface,
  };
}

// ── LAYOUT SCALES ─────────────────────────────────────────────────────────────

export { spacing, radius, fontSize, minTouchTarget } from './scales';
export type { SpacingStep, RadiusStep, FontSizeStep } from './scales';

// ── STATUS + NEUTRAL COLOURS ──────────────────────────────────────────────────

export { status, neutral } from './status';
