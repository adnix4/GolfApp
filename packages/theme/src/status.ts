/**
 * @gfp/theme — status and neutral colours
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS:
 *   The 5 brand tokens in index.ts are per-org; these are not.  Error red,
 *   success green and the form neutrals mean the same thing for every
 *   organisation, and before the shared-classes pilot (2026-10-27) they were
 *   hex literals repeated across admin + mobile: #e74c3c ×98, #27ae60 ×68,
 *   #c0392b ×58, #fdf2f2 ×37, #f39c12 ×35, #fafafa ×30.
 *
 *   Values are the ones the screens already use, so moving a literal onto a
 *   token never changes a pixel.
 */

export const status = {
  /** Error accents: the left rule on an error box, required-field stars */
  danger:     '#e74c3c',
  /** Error message text: darker than `danger` so it reads on `dangerBg` */
  dangerText: '#c0392b',
  /** Error box fill */
  dangerBg:   '#fdf2f2',
  success:    '#27ae60',
  warning:    '#f39c12',
} as const;

export const neutral = {
  /** Text-input fill */
  inputBg: '#fafafa',
  /** Modal / dialog panel fill */
  panel:   '#ffffff',
  /** Dimmed backdrop behind a modal */
  scrim:   'rgba(0,0,0,0.4)',
} as const;
