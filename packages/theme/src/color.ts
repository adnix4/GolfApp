/**
 * @gfp/theme — colour maths (WCAG contrast, mixing, readable pairings).
 *
 * Pure functions with no theme knowledge; index.ts re-exports all of it, and
 * brand.ts builds the palette audit on top. Kept separate so brand.ts and
 * index.ts can both import it without importing each other.
 */

/**
 * validateContrast — checks whether two hex colors meet WCAG 2.1 AA contrast.
 *
 * WHY THIS MATTERS:
 *   The theme save gates (admin editors and the API) reject a palette whose
 *   primary text on the surface fails 4.5:1 — unless the organizer has chosen
 *   to prioritize their brand colors (see brand.ts).
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
  return getContrastRatio(foreground, background) >= MIN_TEXT_CONTRAST;
}

/** WCAG 2.1 AA minimum for normal-size text. */
export const MIN_TEXT_CONTRAST = 4.5;

/**
 * getContrastRatio — returns the raw WCAG contrast ratio between two colors.
 * Exposed separately so the UI can display the actual ratio value to the user
 * (e.g. "7.4:1 — Passes AAA").
 */
export function getContrastRatio(colorA: string, colorB: string): number {
  const lumA = relativeLuminance(colorA);
  const lumB = relativeLuminance(colorB);
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
 *   Any component that places text on a brand fill (primary, action,
 *   highlight) must not hardcode '#fff' — a light fill would make the label
 *   invisible.
 *
 * Compares real ratios rather than a luminance cutoff. The old cutoff (0.179)
 * is where white and PURE black tie, but the soft dark label is #1a1a1a, so
 * mid-tone fills fell short: the default Leaf Green action (#409151) got
 * #1a1a1a at 4.47:1 (AX4). Around that luminance neither soft label reaches
 * 4.5:1; pure black always does (≥ 4.58:1 on any fill), so it is the last
 * resort — Leaf Green gets 5.39:1.
 *
 * @param background  hex fill color the text will sit on
 * @returns '#ffffff', '#1a1a1a', or (mid-tone fills only) '#000000'
 */
export function readableTextOn(background: string): string {
  const white = getContrastRatio('#ffffff', background);
  const soft  = getContrastRatio('#1a1a1a', background);
  if (Math.max(white, soft) >= MIN_TEXT_CONTRAST) return white >= soft ? '#ffffff' : '#1a1a1a';
  return white >= getContrastRatio('#000000', background) ? '#ffffff' : '#000000';
}

/**
 * mixHex — blends two hex colors, `weightA` of the way from b to a.
 *
 * Channel-wise in sRGB space (not linear): this is for *tinting a surface*,
 * where matching what a designer expects from a 10%-opacity overlay matters
 * more than photometric correctness. Weight is clamped to [0,1].
 */
export function mixHex(a: string, b: string, weightA: number): string {
  const w  = Math.min(1, Math.max(0, weightA));
  const ca = hexToRGB255(a);
  const cb = hexToRGB255(b);
  const ch = (x: number, y: number) =>
    Math.round(x * w + y * (1 - w)).toString(16).padStart(2, '0');
  return `#${ch(ca.r, cb.r)}${ch(ca.g, cb.g)}${ch(ca.b, cb.b)}`;
}

/**
 * readableOn — nudges a brand color away from a background until the pair
 * clears `minRatio`, keeping as much of the original hue as it can.
 *
 * WHY THIS EXISTS:
 *   readableTextOn answers "black or white?"; this answers "how do I keep the
 *   brand color and still be legible?" Lightening toward white (on a dark
 *   background) or darkening toward near-black (on a light one) preserves the
 *   hue that makes it recognizable as the brand while restoring contrast. Used
 *   for the TV scoreboard and for the derived text companions in brand.ts.
 *
 * Returns the original color untouched when it already clears the ratio.
 */
export function readableOn(color: string, background: string, minRatio = MIN_TEXT_CONTRAST): string {
  const target = relativeLuminance(background) > 0.179 ? '#1a1a1a' : '#ffffff';
  return mixUntil(color, target, c => getContrastRatio(c, background) >= minRatio);
}

/**
 * mixUntil — the least change that satisfies `ok`: walks `color` toward
 * `target` in 2% steps and returns the first candidate that passes (the
 * colour itself when it already does, `target` when nothing short of it does).
 *
 * 2% steps: fine enough that the result still reads as the brand hue, coarse
 * enough to settle in a handful of iterations.
 */
export function mixUntil(color: string, target: string, ok: (candidate: string) => boolean): string {
  for (let step = 0; step <= 50; step++) {
    const candidate = mixHex(color, target, 1 - step / 50);
    if (ok(candidate)) return candidate;
  }
  return target;
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
  return relativeLuminance(surface) >= MIN_SURFACE_LUMINANCE;
}

/** True for a 6-digit '#rrggbb' string — the only form the theme stores. */
export function isHexColor(s: unknown): s is string {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
}

/**
 * relativeLuminance — WCAG relative luminance for a hex color, 0 (black) to
 * 1 (white). Formula source: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToLinearRGB(hex);
  // WCAG luminance coefficients reflect human eye sensitivity to each channel
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * hexToRGB255 — parses a hex color (long or shorthand) into 0–255 channels.
 */
function hexToRGB255(hex: string): { r: number; g: number; b: number } {
  // Strip leading '#' and expand shorthand (#abc → #aabbcc)
  const clean = hex.replace('#', '');
  const full  = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean;

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/**
 * hexToLinearRGB — converts a hex color string to linear (gamma-corrected) RGB.
 * The sRGB gamma curve must be undone before luminance math is valid.
 */
function hexToLinearRGB(hex: string): { r: number; g: number; b: number } {
  const { r, g, b } = hexToRGB255(hex);

  // Apply inverse sRGB gamma: values ≤ 0.04045 use linear scale,
  // values above use the power curve defined by the sRGB spec.
  const linearize = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return { r: linearize(r / 255), g: linearize(g / 255), b: linearize(b / 255) };
}
