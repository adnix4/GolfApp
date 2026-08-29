import { useMemo } from 'react';

/**
 * Adaptive sizing for the scorecard's shot-entry area.
 *
 * The problem: a full foursome's shot controls need ~950px, while an iPhone SE
 * leaves ~476px between the header and the nav bar. Entering a hole therefore
 * meant scrolling mid-hole, one-handed, on a course.
 *
 * Shrinking alone can't fix it. Fitting four golfers into 476px would drive the
 * +/- buttons far below the 44px minimum touch target, so this degrades
 * structurally instead: roomy keeps today's layout, compact tightens the
 * spacing around controls that stay 44px, and tight renders only the active
 * golfer's controls with the rest collapsed to tappable summary rows.
 *
 * Kept pure and out of the screen so the arithmetic is testable — same reasoning
 * as holeUtils.ts and the admin's lib/scoring.ts.
 */

/**
 * Smallest comfortable touch target. Mirrors MIN_TOUCH_TARGET_COMPACT in
 * packages/ui/src/components/ScoreCard.tsx. No tier may go below it: a control
 * too small to hit reliably is worse than a scroll.
 */
export const MIN_TOUCH_TARGET = 44;

export type ScorecardDensity = 'roomy' | 'compact' | 'tight';

export interface ScorecardLayout {
  density: ScorecardDensity;

  /** Diameter of the +/- buttons. Never below MIN_TOUCH_TARGET. */
  shotButton: number;
  /** Vertical gap between the label, buttons and value inside a shot column. */
  shotGap: number;
  shotLabelFont: number;
  shotValueFont: number;

  avatar: number;
  nameFont: number;
  nameRowMargin: number;
  sectionPaddingTop: number;
  sectionPaddingBottom: number;

  cardPaddingTop: number;
  cardPaddingBottom: number;
  scrollPadding: number;

  /** "Player Shots" heading — dropped once space is short. */
  showCardTitle: boolean;
  /** Render only the active golfer's controls; others collapse to a summary row. */
  collapseInactivePlayers: boolean;
  /** Info chips on one line. */
  compactChrome: boolean;

  /**
   * True when even the tightest tier overflows, so the caller knows the screen
   * will scroll. Not an error — just an honest signal on very short viewports.
   */
  overflows: boolean;
}

/** Per-tier constants. Order matters: roomiest first. */
const TIERS: Record<ScorecardDensity, Omit<ScorecardLayout, 'density' | 'overflows'>> = {
  roomy: {
    shotButton: 44, shotGap: 6, shotLabelFont: 11, shotValueFont: 28,
    avatar: 32, nameFont: 14, nameRowMargin: 12,
    sectionPaddingTop: 12, sectionPaddingBottom: 16,
    cardPaddingTop: 16, cardPaddingBottom: 8, scrollPadding: 16,
    showCardTitle: true, collapseInactivePlayers: false, compactChrome: false,
  },
  compact: {
    shotButton: 44, shotGap: 3, shotLabelFont: 10, shotValueFont: 22,
    avatar: 24, nameFont: 13, nameRowMargin: 6,
    sectionPaddingTop: 4, sectionPaddingBottom: 6,
    cardPaddingTop: 8, cardPaddingBottom: 4, scrollPadding: 8,
    showCardTitle: false, collapseInactivePlayers: false, compactChrome: true,
  },
  tight: {
    shotButton: 44, shotGap: 3, shotLabelFont: 10, shotValueFont: 22,
    avatar: 24, nameFont: 13, nameRowMargin: 6,
    sectionPaddingTop: 6, sectionPaddingBottom: 8,
    cardPaddingTop: 8, cardPaddingBottom: 6, scrollPadding: 8,
    showCardTitle: false, collapseInactivePlayers: true, compactChrome: true,
  },
};

const ORDER: ScorecardDensity[] = ['roomy', 'compact', 'tight'];

/** A collapsed golfer is a single tappable line: name plus shot total. */
const COLLAPSED_ROW_HEIGHT = 36;

/** Text renders taller than its font size; RN's default is ~1.2×. */
const LINE_HEIGHT_RATIO = 1.2;

/**
 * Everything in the scroll area that isn't a golfer's controls: the chips row,
 * the card's padding, and the one shared Drive/Approach/Putt header.
 *
 * Two things used to be in here and no longer are — the sync status bar (now on
 * the header's hole badge) and the per-golfer category labels (now a single
 * shared row). Both were charged per screen or per player; neither is now.
 */
function chromeHeight(t: Omit<ScorecardLayout, 'density' | 'overflows'>): number {
  const chips    = t.compactChrome ? 40 : 52;
  const title    = t.showCardTitle ? Math.round(13 * LINE_HEIGHT_RATIO) + 12 : 0;
  const labelRow = Math.round(t.shotLabelFont * LINE_HEIGHT_RATIO) + 4;
  return chips + 12 + title + labelRow + t.cardPaddingTop + t.cardPaddingBottom
    + t.scrollPadding * 2;
}

/**
 * Height of one golfer's expanded shot controls.
 *
 * The name sits BESIDE the columns, not above them, so a golfer costs only what
 * the controls themselves need. That one change saves ~30px per player — 120px
 * across a foursome, most of what used to make collapsing unavoidable.
 */
function expandedPlayerHeight(t: Omit<ScorecardLayout, 'density' | 'overflows'>): number {
  // [+] + gap + value + gap + [-]  (the category label is now shared, not here)
  const column =
    t.shotButton + t.shotGap +
    Math.round(t.shotValueFont * LINE_HEIGHT_RATIO) + t.shotGap +
    t.shotButton;

  return t.sectionPaddingTop + Math.max(column, t.avatar) + t.sectionPaddingBottom;
}

/**
 * Total height a tier needs for this many golfers. Exported for tests and for
 * anyone reasoning about why a tier was chosen.
 */
export function estimateContentHeight(density: ScorecardDensity, playerCount: number): number {
  const t = TIERS[density];
  const players = Math.max(playerCount, 1);

  const body = t.collapseInactivePlayers
    // One golfer expanded; the rest are one-line summaries.
    ? expandedPlayerHeight(t) + (players - 1) * COLLAPSED_ROW_HEIGHT
    : players * expandedPlayerHeight(t);

  return body + chromeHeight(t);
}

/**
 * Picks the roomiest tier that fits, so a twosome stays comfortable on a phone
 * where a foursome has to tighten.
 *
 * `availableHeight` is what the scroll container actually measured — not a
 * guess at header and safe-area sizes, which vary by device and by whether the
 * hole carries a sponsor or challenge badge.
 *
 * A non-positive height means we haven't measured yet (first render); assume
 * roomy so the screen doesn't visibly reflow from tight to roomy on mount.
 */
export function resolveScorecardLayout(
  availableHeight: number,
  playerCount: number,
): ScorecardLayout {
  if (!(availableHeight > 0)) {
    return { density: 'roomy', ...TIERS.roomy, overflows: false };
  }

  for (const density of ORDER) {
    if (estimateContentHeight(density, playerCount) <= availableHeight) {
      return { density, ...TIERS[density], overflows: false };
    }
  }

  // Nothing fits. Use the tightest tier and let the view scroll rather than
  // shrink a button below MIN_TOUCH_TARGET.
  return { density: 'tight', ...TIERS.tight, overflows: true };
}

/** Memoised wrapper for the screen. */
export function useScorecardLayout(availableHeight: number, playerCount: number): ScorecardLayout {
  return useMemo(
    () => resolveScorecardLayout(availableHeight, playerCount),
    [availableHeight, playerCount],
  );
}
