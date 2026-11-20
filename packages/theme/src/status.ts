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
  // Text versions. The fills above are under 3:1 on white, so text in them
  // fails; these clear 4.5:1 on white, the cream default surface and their
  // own tinted boxes (dangerText 4.96 on dangerBg). AX4.
  /** Success message text: 5.05:1 on white, 4.62 on cream */
  successText: '#1a7f43',
  /** Warning message text: 5.93:1 on white, 5.42 on cream */
  warningText: '#8a5a00',
  /** Informational / neutral-action text (blue): 5.28:1 on white, 4.83 on cream */
  infoText:    '#1f6fb2',
} as const;

export const neutral = {
  /**
   * Secondary text: hints, captions, metadata, empty states. 7.56:1 on white,
   * 6.91 on cream. Also theme.mutedText; this static copy is for StyleSheets.
   */
  mutedText:   '#4b5563',
  /** Input placeholder: lighter than typed text, still 4.63:1 on inputBg. */
  placeholder: '#6b7280',
  /** Text-input fill */
  inputBg: '#fafafa',
  /** Modal / dialog panel fill */
  panel:   '#ffffff',
  /** Dimmed backdrop behind a modal */
  scrim:   'rgba(0,0,0,0.4)',
} as const;
