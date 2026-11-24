import { describe, it, expect } from 'vitest';
import {
  DWELL_BOTTOM_MS, DWELL_TOP_MS, FADE_MS, PAGE_DWELL_MS, SCROLL_PX_PER_S,
  initialAutoScroll, nextAutoScroll,
  type AutoScrollFrame, type AutoScrollOutput, type AutoScrollState,
} from '../scores/tvAutoScroll';

const FRAME_MS = 16;

/** Steps the auto-scroll frame by frame from `from` for `ms` milliseconds. */
function run(
  from: { state: AutoScrollState; now: number },
  ms: number,
  frame: Partial<Omit<AutoScrollFrame, 'now' | 'dt'>>,
): { state: AutoScrollState; now: number; out: AutoScrollOutput; trace: AutoScrollOutput[] } {
  let { state, now } = from;
  const trace: AutoScrollOutput[] = [];
  let out: AutoScrollOutput = { state, scrollTop: state.pos, opacity: 1 };
  for (let t = 0; t < ms; t += FRAME_MS) {
    now += FRAME_MS;
    out = nextAutoScroll(state, { max: 400, page: 300, reduced: false, ...frame, now, dt: FRAME_MS });
    state = out.state;
    trace.push(out);
  }
  return { state, now, out, trace };
}

const start = () => ({ state: initialAutoScroll(0), now: 0 });

describe('TV auto-scroll', () => {
  it('stays still at the top when the standings fit the screen', () => {
    const r = run(start(), 60_000, { max: 0 });
    expect(r.trace.every(o => o.scrollTop === 0 && o.opacity === 1)).toBe(true);
  });

  it('holds on the leaders before it starts to move', () => {
    const r = run(start(), DWELL_TOP_MS - 100, {});
    expect(r.out.scrollTop).toBe(0);
    expect(r.out.state.phase).toBe('dwell');
  });

  it('glides down at the set speed without skipping', () => {
    const r = run(start(), DWELL_TOP_MS + 5_000, {});
    expect(r.out.state.phase).toBe('scroll');
    // Five seconds of scrolling, give or take the frame it started on.
    expect(r.out.scrollTop).toBeGreaterThan(SCROLL_PX_PER_S * 4.9);
    expect(r.out.scrollTop).toBeLessThan(SCROLL_PX_PER_S * 5.1);
    const steps = r.trace.slice(1).map((o, i) => o.scrollTop - r.trace[i].scrollTop);
    expect(Math.max(...steps)).toBeLessThanOrEqual((SCROLL_PX_PER_S * FRAME_MS) / 1000 + 1e-9);
  });

  it('holds at the bottom, fades out, and comes back in on the leaders', () => {
    const max = 200;
    const glide = (max / SCROLL_PX_PER_S) * 1000;
    let r = run(start(), DWELL_TOP_MS + glide + 100, { max });
    expect(r.out).toMatchObject({ scrollTop: max, opacity: 1 });
    expect(r.out.state.phase).toBe('dwell');

    r = run(r, DWELL_BOTTOM_MS + FADE_MS / 2, { max });
    expect(r.out.state.phase).toBe('fadeOut');
    expect(r.out.scrollTop).toBe(max);
    expect(r.out.opacity).toBeGreaterThan(0);
    expect(r.out.opacity).toBeLessThan(1);

    // The jump to the top happens only once the board is fully faded out.
    r = run(r, FADE_MS * 2, { max });
    const jump = r.trace.findIndex(o => o.scrollTop === 0);
    expect(r.trace[jump].opacity).toBe(0);
    expect(r.out).toMatchObject({ scrollTop: 0, opacity: 1 });
    expect(r.out.state.phase).toBe('dwell');

    // ...and then the cycle starts over with the hold on the leaders.
    r = run(r, DWELL_TOP_MS - FADE_MS, { max });
    expect(r.out.scrollTop).toBe(0);
  });

  it('copes with the table shrinking under it mid-scroll', () => {
    let r = run(start(), DWELL_TOP_MS + 3_000, { max: 400 });
    expect(r.out.scrollTop).toBeGreaterThan(100);
    r = run(r, FRAME_MS, { max: 50 });
    expect(r.out.scrollTop).toBe(50);
    expect(r.out.state.phase).toBe('dwell');
  });

  it('settles back at the top when a refresh makes everything fit', () => {
    let r = run(start(), DWELL_TOP_MS + 3_000, { max: 400 });
    r = run(r, FRAME_MS, { max: 0 });
    expect(r.out).toMatchObject({ scrollTop: 0, opacity: 1 });
  });

  describe('under prefers-reduced-motion', () => {
    it('flips a page at a time and never glides or fades', () => {
      const r = run(start(), PAGE_DWELL_MS * 3 + 100, { max: 500, page: 300, reduced: true });
      const positions = [...new Set(r.trace.map(o => o.scrollTop))];
      // top → one page → clamped to the end → back to the top
      expect(positions).toEqual([0, 300, 500]);
      expect(r.out.scrollTop).toBe(0);
      expect(r.trace.every(o => o.opacity === 1)).toBe(true);
    });

    it('stops a fade that was already running when the setting changed', () => {
      let r = run(start(), DWELL_TOP_MS + 5_100, { max: 200 });
      r = run(r, DWELL_BOTTOM_MS + FADE_MS / 2, { max: 200 });
      expect(r.out.state.phase).toBe('fadeOut');
      r = run(r, FRAME_MS, { max: 200, reduced: true });
      expect(r.out).toMatchObject({ scrollTop: 200, opacity: 1 });
    });
  });
});
