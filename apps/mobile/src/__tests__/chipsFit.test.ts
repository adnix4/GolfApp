import { describe, it, expect } from 'vitest';
import {
  chipsFitOnOneRow, estimateChipWidth, resolveChipsLayout, YARDAGES_BUTTON,
  type ChipSpec,
} from '../lib/chipsFit';

// Row width net of the scroll container's padding.
const PHONE_375 = 343;   // iPhone SE / 8 — the smallest supported phone
const TABLET     = 736;

const par:     ChipSpec = { label: 'Par',     value: '4' };
const hcp:     ChipSpec = { label: 'HCP',     value: '4' };
const score:   ChipSpec = { label: 'Score',   value: '5', variant: 'score', suffix: '+1' };
const white:   ChipSpec = { label: 'White',   value: '420y' };
const blue:    ChipSpec = { label: 'Blue',    value: '445y' };
const red:     ChipSpec = { label: 'Red',     value: '370y' };
const through: ChipSpec = { label: 'Through', value: '6' };
const round:   ChipSpec = { label: 'Round',   value: '27', suffix: '+3' };
const yardBtn: ChipSpec = YARDAGES_BUTTON;

// Par moved to the header, so it is no longer a chip. Round precedes Through.
const FULL      = [score, hcp, white, blue, red, round, through];
const COLLAPSED = [yardBtn, score, round, through];

describe('chipsFitOnOneRow', () => {
  // The case that motivated the change: three tee yardages plus the round
  // totals wraps to a second row and quietly costs ~52px of the vertical budget.
  it('does not fit the full set on the smallest supported phone', () => {
    expect(chipsFitOnOneRow(PHONE_375, FULL)).toBe(false);
  });

  it('fits the collapsed set on the smallest supported phone', () => {
    expect(chipsFitOnOneRow(PHONE_375, COLLAPSED)).toBe(true);
  });

  // The collapsed row is the last resort — there is nothing further to fall back
  // to, so it must fit. "Yardages" is a much wider label than the "Hole 13" it
  // replaced, which is why this is pinned.
  it('fits the collapsed row late in a round, when Round and Through are showing', () => {
    expect(chipsFitOnOneRow(PHONE_375, COLLAPSED)).toBe(true);
  });

  it('keeps the full set on a wide screen', () => {
    expect(chipsFitOnOneRow(TABLET, FULL)).toBe(true);
  });

  // A course with no yardages is four chips — no reason to collapse it.
  it('fits a course with no yardage data', () => {
    expect(chipsFitOnOneRow(PHONE_375, [score, hcp, round, through])).toBe(true);
  });

  it('assumes it fits before the row has been measured', () => {
    // Avoids flashing the collapsed form on first paint.
    expect(chipsFitOnOneRow(0, FULL)).toBe(true);
    expect(chipsFitOnOneRow(-1, FULL)).toBe(true);
  });

  it('treats an empty row as fitting', () => {
    expect(chipsFitOnOneRow(PHONE_375, [])).toBe(true);
  });

  it('gets harder to fit as chips are added', () => {
    const widths = [2, 4, 6, 7].map(n => FULL.slice(0, n));
    for (let i = 1; i < widths.length; i++) {
      const prev = widths[i - 1].reduce((s, c) => s + estimateChipWidth(c), 0);
      const cur  = widths[i].reduce((s, c) => s + estimateChipWidth(c), 0);
      expect(cur).toBeGreaterThan(prev);
    }
  });
});

describe('estimateChipWidth', () => {
  it('makes the score chip wider than an info chip with the same value', () => {
    expect(estimateChipWidth(score)).toBeGreaterThan(estimateChipWidth({ label: 'Score', value: '5' }));
  });

  it('accounts for the to-par suffix', () => {
    const withSuffix = estimateChipWidth({ ...score, suffix: '+10' });
    const without    = estimateChipWidth({ ...score, suffix: undefined });
    expect(withSuffix).toBeGreaterThan(without);
  });

  it('sizes from the wider of label and value', () => {
    // "Through" is a long label against a one-character value.
    expect(estimateChipWidth(through)).toBeGreaterThan(estimateChipWidth(par));
  });

  it('accounts for a to-par subscript on an info chip', () => {
    expect(estimateChipWidth(round))
      .toBeGreaterThan(estimateChipWidth({ label: 'Round', value: '27' }));
  });

  it('grows with a longer value', () => {
    expect(estimateChipWidth({ label: 'White', value: '420y' }))
      .toBeGreaterThan(estimateChipWidth({ label: 'White', value: '42y' }));
  });
});

describe('resolveChipsLayout', () => {
  const input = { score, hcp, yardages: [white, blue, red], totals: [round, through] };

  it('keeps everything inline when there is room', () => {
    const r = resolveChipsLayout(TABLET, input);
    expect(r.showYardagesButton).toBe(false);
    expect(r.showHcp).toBe(true);
    expect(r.chips).toHaveLength(7);
  });

  it('collapses the yardages before dropping HCP', () => {
    // Width chosen to fit step 2 but not step 1.
    const step2 = [YARDAGES_BUTTON, score, hcp, round, through]
      .reduce((sum, c) => sum + estimateChipWidth(c), 0) + 8 * 4;
    const r = resolveChipsLayout(Math.ceil(step2), input);
    expect(r.showYardagesButton).toBe(true);
    expect(r.showHcp).toBe(true);
  });

  it('drops HCP only when collapsing the yardages was not enough', () => {
    const r = resolveChipsLayout(PHONE_375, input);
    expect(r.showYardagesButton).toBe(true);
    expect(r.showHcp).toBe(false);
    expect(chipsFitOnOneRow(PHONE_375, r.chips)).toBe(true);
  });

  // Nothing to put behind the button, so it must not appear.
  it('never shows the button for a course with no yardages', () => {
    const r = resolveChipsLayout(PHONE_375, { ...input, yardages: [] });
    expect(r.showYardagesButton).toBe(false);
    expect(r.chips).not.toContain(YARDAGES_BUTTON);
  });

  it('still hides the button on a narrow row with no yardages', () => {
    const r = resolveChipsLayout(120, { ...input, yardages: [] });
    expect(r.showYardagesButton).toBe(false);
    expect(r.showHcp).toBe(false);
  });

  // HCP is what the league scorecard needs — LeagueService allocates a net
  // stroke from the hole's index — so it must never be shed before the yardages.
  it('never sheds HCP while yardages are still inline', () => {
    for (const w of [200, 260, 320, PHONE_375, 420, 520, 620, TABLET]) {
      const r = resolveChipsLayout(w, input);
      const yardagesInline = !r.showYardagesButton;
      if (yardagesInline) expect(r.showHcp).toBe(true);
    }
  });

  it('always keeps the score', () => {
    for (const w of [80, 200, PHONE_375, TABLET]) {
      expect(resolveChipsLayout(w, input).chips).toContain(score);
    }
  });
});
