/**
 * Decides whether the scorecard's info chips fit on one line.
 *
 * The row is flexWrap, and a course carrying white/blue/red yardages already
 * renders six chips — two rows on a 375pt screen. Adding the round totals takes
 * it to eight. scorecardLayout budgets a flat 52px for this row, so a wrapped
 * row silently overruns the vertical budget the scorecard is trying to fit
 * into. When the chips won't fit, the caller collapses Par/HCP/yardages behind a
 * "Hole N" button instead.
 *
 * Widths are ESTIMATED, not measured, on purpose. The container's width is
 * measured (it doesn't change when the chips collapse), but reacting to the
 * row's measured *height* would oscillate: collapse → now it fits → expand →
 * wraps again → collapse. A computed decision from a stable input is settled on
 * the first render and stays settled.
 */

export interface ChipSpec {
  label: string;
  value: string;
  /**
   * 'score' is wider (bigger value plus the to-par suffix); 'button' is the
   * Yardages pill that stands in for the collapsed chips — a single label plus
   * a chevron, with no value line.
   */
  variant?: 'info' | 'score' | 'button';
  /** To-par subscript beside the value (e.g. "+1", "E"). Both variants use it. */
  suffix?: string;
}

// Measured off the StyleSheets in scorecardComponents.tsx. Kept here rather than
// imported so this stays a pure module with no React Native dependency.
const INFO_PADDING_X   = 12 * 2;
const SCORE_PADDING_X  = 14 * 2 + 2; // + 1px border each side
const BUTTON_PADDING_X = 10 * 2 + 3; // + 1.5px border each side
const BUTTON_CHAR      = 13 * 0.62;  // holeInfoBtnText
const BUTTON_CHEVRON   = 11 + 4;     // glyph + gap
const GAP              = 8;

// Average glyph width as a fraction of font size, for the system sans stack at
// the weights these chips use. Deliberately a little generous: over-estimating
// collapses one chip early, under-estimating wraps the row and costs ~52px.
const LABEL_CHAR   = 11 * 0.60 + 0.5;  // 11px uppercase, letterSpacing 0.5
const INFO_CHAR    = 16 * 0.62;        // HoleInfoChip value
const SCORE_CHAR   = 22 * 0.64;        // ScoreChip value
const SCORE_SUFFIX_CHAR = 13 * 0.62;   // to-par subscript on the score chip
const INFO_SUFFIX_CHAR  = 11 * 0.62;   // ...and on an info chip, one size down
const SUFFIX_GAP        = 3;

/**
 * Safety margin per chip, absorbing letter-spacing and rounding drift. Kept
 * small: at 4px the five-chip case (a course with no yardages) came out 3px
 * over a 375pt screen and collapsed a row that really fits.
 */
const SLOP = 2;

export function estimateChipWidth(chip: ChipSpec): number {
  if (chip.variant === 'button') {
    return BUTTON_PADDING_X + chip.label.length * BUTTON_CHAR + BUTTON_CHEVRON + SLOP;
  }

  const labelW = chip.label.length * LABEL_CHAR;

  if (chip.variant === 'score') {
    const valueW  = chip.value.length * SCORE_CHAR;
    const suffixW = chip.suffix ? SUFFIX_GAP + chip.suffix.length * SCORE_SUFFIX_CHAR : 0;
    return SCORE_PADDING_X + Math.max(labelW, valueW + suffixW) + SLOP;
  }

  const valueW  = chip.value.length * INFO_CHAR;
  const suffixW = chip.suffix ? SUFFIX_GAP + chip.suffix.length * INFO_SUFFIX_CHAR : 0;
  return INFO_PADDING_X + Math.max(labelW, valueW + suffixW) + SLOP;
}

/**
 * True when every chip sits on a single line at this width.
 *
 * `availableWidth` is the row's measured width — already net of the scroll
 * container's padding.
 */
export function chipsFitOnOneRow(availableWidth: number, chips: ChipSpec[]): boolean {
  if (chips.length === 0) return true;
  // Not measured yet: assume it fits so the first paint matches today's layout
  // rather than flashing the collapsed form.
  if (!(availableWidth > 0)) return true;

  const total =
    chips.reduce((sum, c) => sum + estimateChipWidth(c), 0) + GAP * (chips.length - 1);

  return total <= availableWidth;
}

/** The pill that stands in for the hole detail when yardages are collapsed. */
export const YARDAGES_BUTTON: ChipSpec = { label: 'Yardages', value: '', variant: 'button' };

export interface ChipsRowInput {
  /** Always shown — the hole's score is the point of the screen. */
  score: ChipSpec;
  /** Hole stroke index. Optional; the last thing dropped under pressure. */
  hcp?: ChipSpec | null;
  /** One per tee the course supplies. Empty for a course with no yardage data. */
  yardages: ChipSpec[];
  /** Round and Through — present only once the round is under way. */
  totals: ChipSpec[];
}

export interface ChipsRowLayout {
  chips: ChipSpec[];
  showYardagesButton: boolean;
  showHcp: boolean;
}

/**
 * Picks the richest arrangement of the chips row that still fits on one line.
 *
 *   1. everything inline
 *   2. yardages behind the Yardages button, HCP kept
 *   3. HCP dropped too
 *
 * Yardages collapse BEFORE HCP is dropped. On the league scorecard the hole's
 * stroke index is the one number here that actually drives scoring —
 * LeagueService allocates a net stroke when the index is within the member's
 * course handicap — so it is the last thing to go. This function is written to
 * be shared with that screen rather than re-derived there.
 *
 * Step 2 is skipped when there are no yardages: there would be nothing behind
 * the button. Such a course fits at step 1 anyway.
 */
export function resolveChipsLayout(
  availableWidth: number,
  { score, hcp, yardages, totals }: ChipsRowInput,
): ChipsRowLayout {
  const withHcp = hcp ? [hcp] : [];

  const full = [score, ...withHcp, ...yardages, ...totals];
  if (chipsFitOnOneRow(availableWidth, full)) {
    return { chips: full, showYardagesButton: false, showHcp: !!hcp };
  }

  if (yardages.length > 0) {
    const collapsed = [YARDAGES_BUTTON, score, ...withHcp, ...totals];
    if (chipsFitOnOneRow(availableWidth, collapsed)) {
      return { chips: collapsed, showYardagesButton: true, showHcp: !!hcp };
    }
  }

  // Last rung. If this still overflows the row wraps, which is the least-bad
  // outcome left — there is nothing further to shed.
  const minimal = [
    ...(yardages.length > 0 ? [YARDAGES_BUTTON] : []),
    score,
    ...totals,
  ];
  return { chips: minimal, showYardagesButton: yardages.length > 0, showHcp: false };
}
