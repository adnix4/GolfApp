import { describe, it, expect } from 'vitest';
import {
  resolveScorecardLayout,
  estimateContentHeight,
  MIN_TOUCH_TARGET,
  type ScorecardDensity,
} from '../lib/scorecardLayout';

// Usable height between the header and the nav bar, measured on the scroll
// container. iPhone SE is the smallest phone the app supports (app.json sets no
// floor, so it inherits SDK 57's iOS 16.4 target = iPhone 8 and later).
//
// ~30px higher than they used to be: the hole counter and sync badge moved from
// their own nav-bar row onto the header's event line, handing that space to the
// scroll area.
const SE          = 506;
const IPHONE_14   = 622;
const PRO_MAX     = 710;

describe('resolveScorecardLayout', () => {
  it('keeps the roomy layout when there is space for it', () => {
    expect(resolveScorecardLayout(1200, 4).density).toBe('roomy');
  });

  it('assumes roomy before the first measurement so the screen does not reflow', () => {
    // onLayout has not fired yet. Starting tight and expanding would flash.
    expect(resolveScorecardLayout(0, 4).density).toBe('roomy');
    expect(resolveScorecardLayout(-1, 4).density).toBe('roomy');
  });

  // The whole point of the change.
  it('fits a full foursome on the smallest supported phone', () => {
    const layout = resolveScorecardLayout(SE, 4);
    expect(estimateContentHeight(layout.density, 4)).toBeLessThanOrEqual(SE);
    expect(layout.overflows).toBe(false);
  });

  it('fits a foursome on a modern phone too', () => {
    const layout = resolveScorecardLayout(IPHONE_14, 4);
    expect(estimateContentHeight(layout.density, 4)).toBeLessThanOrEqual(IPHONE_14);
    expect(layout.overflows).toBe(false);
  });

  // Collapsing is now the exception, not the rule. Moving the name beside the
  // controls and sharing one category-label row freed ~190px across a foursome,
  // which is enough to keep all four expanded on a normal phone.
  it('keeps a foursome expanded on a modern phone', () => {
    expect(resolveScorecardLayout(IPHONE_14, 4).collapseInactivePlayers).toBe(false);
    expect(resolveScorecardLayout(PRO_MAX, 4).collapseInactivePlayers).toBe(false);
  });

  // It is still needed on the smallest supported phone — four sets of 44px
  // controls genuinely do not fit in ~506px, and shrinking them is not an option.
  it('still collapses a foursome on the smallest supported phone', () => {
    expect(resolveScorecardLayout(SE, 4).collapseInactivePlayers).toBe(true);
  });

  it('keeps a threesome expanded even on the smallest phone', () => {
    expect(resolveScorecardLayout(SE, 3).collapseInactivePlayers).toBe(false);
  });

  it('leaves a smaller team roomier at the same screen height', () => {
    const rank: Record<ScorecardDensity, number> = { roomy: 0, compact: 1, tight: 2 };
    const twosome  = resolveScorecardLayout(IPHONE_14, 2);
    const foursome = resolveScorecardLayout(IPHONE_14, 4);
    expect(rank[twosome.density]).toBeLessThan(rank[foursome.density]);
  });

  // The point of the whole exercise: nobody scrolls mid-hole.
  it('fits every team size on every supported phone without overflowing', () => {
    for (const height of [SE, IPHONE_14, PRO_MAX]) {
      for (const players of [1, 2, 3, 4]) {
        const layout = resolveScorecardLayout(height, players);
        expect(layout.overflows).toBe(false);
        expect(estimateContentHeight(layout.density, players)).toBeLessThanOrEqual(height);
      }
    }
  });

  it('gives a bigger screen a roomier layout for the same team', () => {
    const rank: Record<ScorecardDensity, number> = { roomy: 0, compact: 1, tight: 2 };
    expect(rank[resolveScorecardLayout(PRO_MAX, 2).density])
      .toBeLessThanOrEqual(rank[resolveScorecardLayout(SE, 2).density]);
  });

  // A control too small to hit is worse than a scroll.
  it('never shrinks a touch target below the minimum', () => {
    for (const height of [120, 200, SE, IPHONE_14, PRO_MAX, 1200]) {
      for (const players of [1, 2, 3, 4]) {
        expect(resolveScorecardLayout(height, players).shotButton)
          .toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      }
    }
  });

  it('keeps a twosome expanded on the smallest supported phone', () => {
    expect(resolveScorecardLayout(SE, 2).collapseInactivePlayers).toBe(false);
  });

  it('reports overflow instead of shrinking when nothing fits', () => {
    const layout = resolveScorecardLayout(120, 4);
    expect(layout.density).toBe('tight');
    expect(layout.overflows).toBe(true);
    expect(layout.shotButton).toBe(MIN_TOUCH_TARGET);
  });

  it('treats an empty team as one golfer rather than dividing by zero', () => {
    expect(estimateContentHeight('roomy', 0)).toBe(estimateContentHeight('roomy', 1));
  });
});

describe('estimateContentHeight', () => {
  it('grows with the team on the expanded tiers', () => {
    expect(estimateContentHeight('roomy', 4)).toBeGreaterThan(estimateContentHeight('roomy', 2));
    expect(estimateContentHeight('compact', 4)).toBeGreaterThan(estimateContentHeight('compact', 2));
  });

  it('grows only by a summary row per extra golfer once collapsed', () => {
    const three = estimateContentHeight('tight', 3);
    const four  = estimateContentHeight('tight', 4);
    expect(four - three).toBeLessThan(MIN_TOUCH_TARGET);
  });

  it('orders the tiers from roomiest to tightest', () => {
    expect(estimateContentHeight('roomy', 4)).toBeGreaterThan(estimateContentHeight('compact', 4));
    expect(estimateContentHeight('compact', 4)).toBeGreaterThan(estimateContentHeight('tight', 4));
  });
});
