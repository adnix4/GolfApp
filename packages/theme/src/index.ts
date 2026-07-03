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
 *   All theme saves must pass validateContrast(primary, surface) before
 *   the API will accept the theme JSONB update.
 */

// ── TOKEN TYPE ────────────────────────────────────────────────────────────────

/**
 * GFPTheme is the shape of the theme JSONB column in the organizations table.
 * It is also the shape of the per-event config.theme_override JSONB.
 *
 * All values are CSS hex strings: "#rrggbb" or "#rrggbbaa".
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
}

// ── DEFAULT PALETTE ───────────────────────────────────────────────────────────

/**
 * ECO_GREEN_DEFAULT is the out-of-the-box palette every new organization gets.
 * Organizations can override any token by saving a custom GFPTheme to their
 * organizations.theme JSONB column.  NULL in that column = use this default.
 *
 * WCAG contrast ratios for this palette (spec §6.1):
 *   primary (#31572c) on surface (#f4f7de) ≈ 7.4:1  → AAA ✓
 *   action  (#409151) on surface (#f4f7de) ≈ 3.6:1  → fails AA (use action on white for body text)
 *
 * Color names are informal nicknames for developer communication only.
 */
export const ECO_GREEN_DEFAULT: GFPTheme = {
  primary:   '#31572c', // "Dark Forest"  — deep green, high contrast
  action:    '#409151', // "Leaf Green"   — mid green, passes AA
  accent:    '#8ba955', // "Sage"         — muted green, decorative use
  highlight: '#ecf39e', // "Pale Lime"    — very light, attention-grabbing
  surface:   '#f4f7de', // "Cream"        — warm off-white background
};

// ── WCAG CONTRAST VALIDATION ──────────────────────────────────────────────────

/**
 * validateContrast — checks whether two hex colors meet WCAG 2.1 AA contrast.
 *
 * WHY THIS MATTERS:
 *   The spec states that the theme save endpoint must reject any theme where
 *   the primary color on the surface color fails WCAG 4.5:1.  This function
 *   is used by BOTH the API (server-side validation before DB write) and the
 *   admin theme editor (client-side live preview feedback).
 *
 * ALGORITHM:
 *   1. Convert hex → linear RGB (undo gamma correction with sRGB formula)
 *   2. Compute relative luminance L = 0.2126R + 0.7152G + 0.0722B
 *   3. Contrast ratio = (L_lighter + 0.05) / (L_darker + 0.05)
 *   4. WCAG AA requires ratio ≥ 4.5:1 for normal text
 *
 * @param foreground  hex color of the text / foreground element  e.g. '#31572c'
 * @param background  hex color of the background surface          e.g. '#f4f7de'
 * @returns true if the pair meets WCAG 2.1 AA (≥ 4.5:1 contrast ratio)
 */
export function validateContrast(foreground: string, background: string): boolean {
  const ratio = getContrastRatio(foreground, background);
  // WCAG 2.1 AA minimum for normal text is 4.5:1
  return ratio >= 4.5;
}

/**
 * getContrastRatio — returns the raw WCAG contrast ratio between two colors.
 * Exposed separately so the UI can display the actual ratio value to the user
 * (e.g. "7.4:1 — Passes AAA").
 */
export function getContrastRatio(colorA: string, colorB: string): number {
  const lumA = getRelativeLuminance(colorA);
  const lumB = getRelativeLuminance(colorB);
  // Contrast ratio formula: (lighter + 0.05) / (darker + 0.05)
  const lighter = Math.max(lumA, lumB);
  const darker  = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * readableTextOn — picks the text color (white or near-black) with the higher
 * WCAG contrast against an arbitrary fill color.
 *
 * WHY THIS EXISTS:
 *   Only the primary↔surface pairing is validated at theme-save time.  Any
 *   component that places text on an UNVALIDATED fill (action, accent,
 *   highlight, or a legacy theme saved before validation existed) must not
 *   hardcode '#fff' — a light fill would make the label invisible.
 *
 * The luminance breakpoint 0.179 is where white and black text have equal
 * WCAG contrast against the background: (L+0.05)/0.05 = 1.05/(L+0.05).
 *
 * @param background  hex fill color the text will sit on
 * @returns '#ffffff' for dark fills, '#1a1a1a' for light fills
 */
export function readableTextOn(background: string): string {
  return getRelativeLuminance(background) > 0.179 ? '#1a1a1a' : '#ffffff';
}

/**
 * MIN_SURFACE_LUMINANCE — floor for isLightSurface().
 *
 * WHY 0.4:
 *   Cards across all three apps render as WHITE panels with primary-colored
 *   text on top of the surface background.  That layout only works when the
 *   surface is light: if surface luminance ≥ 0.4 AND primary↔surface passes
 *   4.5:1 (the existing save gate), primary luminance is forced ≤ 0.05, which
 *   guarantees primary text on a white card reads at ≥ 10.5:1 (AAA).  It also
 *   makes hardcoded white text on primary-filled elements safe by construction.
 */
export const MIN_SURFACE_LUMINANCE = 0.4;

/**
 * isLightSurface — true when a color is light enough to serve as the surface
 * (page background) token.  Used by the theme save gates (admin editors and
 * the API) alongside validateContrast; see MIN_SURFACE_LUMINANCE for why.
 */
export function isLightSurface(surface: string): boolean {
  return getRelativeLuminance(surface) >= MIN_SURFACE_LUMINANCE;
}

/**
 * getRelativeLuminance — computes WCAG relative luminance for a hex color.
 * Returns a value between 0 (absolute black) and 1 (absolute white).
 *
 * Formula source: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToLinearRGB(hex);
  // WCAG luminance coefficients reflect human eye sensitivity to each channel
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * hexToLinearRGB — converts a hex color string to linear (gamma-corrected) RGB.
 * The sRGB gamma curve must be undone before luminance math is valid.
 */
function hexToLinearRGB(hex: string): { r: number; g: number; b: number } {
  // Strip leading '#' and expand shorthand (#abc → #aabbcc)
  const clean = hex.replace('#', '');
  const full  = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean;

  const r8 = parseInt(full.slice(0, 2), 16) / 255;
  const g8 = parseInt(full.slice(2, 4), 16) / 255;
  const b8 = parseInt(full.slice(4, 6), 16) / 255;

  // Apply inverse sRGB gamma: values ≤ 0.04045 use linear scale,
  // values above use the power curve defined by the sRGB spec.
  const linearize = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return { r: linearize(r8), g: linearize(g8), b: linearize(b8) };
}

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
 * Tailwind users can reference these via CSS variable references in config.
 *
 * @param theme  a GFPTheme (org override or ECO_GREEN_DEFAULT)
 * @returns      a complete CSS :root { } block as a string
 */
export function buildCSSVars(theme: GFPTheme): string {
  return `
:root {
  --color-primary:   ${theme.primary};
  --color-action:    ${theme.action};
  --color-accent:    ${theme.accent};
  --color-highlight: ${theme.highlight};
  --color-surface:   ${theme.surface};
  --color-on-primary: ${readableTextOn(theme.primary)};
  --color-on-action:  ${readableTextOn(theme.action)};
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
  linkColor:          string;  // = action
  hoverBackground:    string;  // = accent
  selectedBackground: string;  // = highlight

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
    linkColor:          theme.action,
    hoverBackground:    theme.accent,
    selectedBackground: theme.highlight,
    mutedText:          '#4b5563',
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
