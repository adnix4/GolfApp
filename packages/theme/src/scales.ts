/**
 * @gfp/theme — spacing, radius and type scales
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS:
 *   The colour tokens in index.ts stop brand palettes drifting between
 *   surfaces; these stop LAYOUT values drifting between screens.  Before E2
 *   (2026-10-25) admin + mobile carried ~1,670 literal padding/margin/gap
 *   values across 30-odd distinct numbers.
 *
 * HOW THE STEPS WERE PICKED:
 *   From the measured frequency of literals in apps/admin + apps/mobile, not
 *   from a textbook ramp.  12, 8, 4, 16, 20 and 24 were already the most used
 *   spacing values; the in-between ones (6, 10, 14, 18) were snapped to the
 *   nearest step, ties rounding UP so a migration never tightens a touch
 *   target.  14px is the admin web's body size (197 uses), so it is a type
 *   step even though it sits between 13 and 15.
 *
 * WHAT STAYS LITERAL (on purpose, with a comment at the call site if unclear):
 *   0 and 1 (hairlines / optical nudges), negative offsets, layout sizes above
 *   the largest step, and hero numerals at 32px+ (score digits, countdowns).
 *
 * Plain numbers, no react-native import: apps/web and the email builder can
 * use them too.
 */

/**
 * spacing — 4-point grid; key × 4 = pixels (Tailwind convention), so
 * `spacing[3]` is 12.  Only these keys exist: a value between steps uses the
 * nearest one.
 */
export const spacing = {
  0.5: 2,
  1:   4,
  2:   8,
  3:   12,
  4:   16,
  5:   20,
  6:   24,
  8:   32,
  10:  40,
  12:  48,
} as const;

/**
 * radius — corner rounding.  `full` makes a capsule or circle whatever the
 * element's size (RN and CSS both clamp it to half the shorter side).
 */
export const radius = {
  xs:   4,
  sm:   6,
  md:   8,
  lg:   12,
  xl:   16,
  xxl:  20,
  full: 999,
} as const;

/**
 * fontSize — the text-size ramp.  `md` (14) is body text on the admin web;
 * mobile body text is `lg` (15) to `xl` (17).
 */
export const fontSize = {
  xxs:     11,
  xs:      12,
  sm:      13,
  md:      14,
  lg:      15,
  xl:      17,
  xxl:     20,
  title:   22,
  display: 28,
} as const;

export type SpacingStep  = keyof typeof spacing;
export type RadiusStep   = keyof typeof radius;
export type FontSizeStep = keyof typeof fontSize;
