'use client';

import { useEffect, type RefObject } from 'react';

/**
 * TV-mode standings auto-scroll.
 *
 * A board left running on a screen has nobody at it to scroll, so when the
 * standings are taller than the screen the board cycles through them by
 * itself: it holds on the leaders, glides down to the last row, holds there,
 * fades out, and fades back in on the leaders again.
 *
 * Under prefers-reduced-motion the glide becomes a page flip: the board shows
 * a screenful, holds it long enough to read, then jumps to the next one. The
 * whole field is still shown, but nothing slides.
 *
 * The timing is a pure function (`nextAutoScroll`) so it can be tested
 * without a DOM. The hook only measures the element and applies the result.
 */

/** Glide speed. About two-thirds of a row a second: readable while it moves. */
export const SCROLL_PX_PER_S    = 40;
/** Hold on the leaders. They are what most of the room looks up for. */
export const DWELL_TOP_MS       = 6_000;
/** Hold on the last rows before starting over. */
export const DWELL_BOTTOM_MS    = 4_000;
/** Fade out and back in for the jump to the top, instead of a fast scroll up. */
export const FADE_MS            = 500;
/** Reduced motion: how long each page stays on screen. */
export const PAGE_DWELL_MS      = 8_000;

export type AutoScrollPhase = 'dwell' | 'scroll' | 'fadeOut' | 'fadeIn';

export interface AutoScrollState {
  phase:      AutoScrollPhase;
  /** When the current phase started, in performance.now() milliseconds. */
  phaseStart: number;
  /** Scroll position as a float. scrollTop can round, so this is the source of truth. */
  pos:        number;
}

export interface AutoScrollFrame {
  now:     number;
  /** Time since the last frame in ms, already clamped by the caller. */
  dt:      number;
  /** scrollHeight - clientHeight. Zero or less means the table fits. */
  max:     number;
  /** Distance of one page flip (reduced motion only). */
  page:    number;
  reduced: boolean;
}

export interface AutoScrollOutput {
  state:     AutoScrollState;
  scrollTop: number;
  opacity:   number;
}

export function initialAutoScroll(now: number): AutoScrollState {
  return { phase: 'dwell', phaseStart: now, pos: 0 };
}

/** Works out the next frame: where the table should be scrolled and how opaque it should be. */
export function nextAutoScroll(s: AutoScrollState, f: AutoScrollFrame): AutoScrollOutput {
  const at = (phase: AutoScrollPhase, pos: number): AutoScrollState =>
    ({ phase, phaseStart: f.now, pos });

  // Everything fits (or a refresh removed rows until it did): sit still at the top.
  if (f.max <= 1) {
    const state = s.phase === 'dwell' && s.pos === 0 ? s : at('dwell', 0);
    return { state, scrollTop: 0, opacity: 1 };
  }

  // A refresh can shorten the table while we're further down than its new end.
  const pos     = Math.min(s.pos, f.max);
  const elapsed = f.now - s.phaseStart;
  const atEnd   = pos >= f.max - 0.5;

  if (f.reduced) {
    // Page flip: hold each screenful, then jump with no animation. A fade or
    // glide that was already running when the setting changed just stops here.
    if (s.phase !== 'dwell') return { state: at('dwell', pos), scrollTop: pos, opacity: 1 };
    if (elapsed < PAGE_DWELL_MS) return { state: { ...s, pos }, scrollTop: pos, opacity: 1 };
    const next = atEnd ? 0 : Math.min(pos + Math.max(f.page, 1), f.max);
    return { state: at('dwell', next), scrollTop: next, opacity: 1 };
  }

  switch (s.phase) {
    case 'dwell': {
      const hold = pos === 0 ? DWELL_TOP_MS : DWELL_BOTTOM_MS;
      if (elapsed < hold) return { state: { ...s, pos }, scrollTop: pos, opacity: 1 };
      // At the top: start the glide. Anywhere else (the bottom, or wherever a
      // reduced-motion page flip left it): fade out and start over.
      return pos === 0
        ? { state: at('scroll', 0), scrollTop: 0, opacity: 1 }
        : { state: at('fadeOut', pos), scrollTop: pos, opacity: 1 };
    }
    case 'scroll': {
      const next = Math.min(pos + (SCROLL_PX_PER_S * f.dt) / 1000, f.max);
      if (next >= f.max - 0.5) return { state: at('dwell', f.max), scrollTop: f.max, opacity: 1 };
      return { state: { ...s, pos: next }, scrollTop: next, opacity: 1 };
    }
    case 'fadeOut': {
      if (elapsed < FADE_MS) return { state: { ...s, pos }, scrollTop: pos, opacity: 1 - elapsed / FADE_MS };
      // Fully faded out: jump to the top where nobody can see it happen.
      return { state: at('fadeIn', 0), scrollTop: 0, opacity: 0 };
    }
    case 'fadeIn': {
      if (elapsed < FADE_MS) return { state: { ...s, pos: 0 }, scrollTop: 0, opacity: elapsed / FADE_MS };
      return { state: at('dwell', 0), scrollTop: 0, opacity: 1 };
    }
  }
}

/**
 * Runs the auto-scroll on `ref` while `enabled`. The element must clip its
 * overflow (overflow: hidden) and have a bounded height, or there is nothing
 * to scroll. Its <thead> should be sticky so the column labels stay put.
 */
export function useTvAutoScroll(ref: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');

    let last  = performance.now();
    let state = initialAutoScroll(last);
    let frame = requestAnimationFrame(tick);
    // The table element swaps (team ↔ golfer board, empty ↔ rows), so the last
    // one touched is the one whose opacity the cleanup must restore.
    let touched: HTMLElement | null = null;

    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      // A background tab pauses rAF. Clamping stops the board jumping a whole
      // screen when it comes back.
      const dt = Math.min(Math.max(now - last, 0), 100);
      last = now;

      const el = ref.current;
      if (!el) return;
      if (touched && touched !== el) touched.style.opacity = '';
      touched = el;

      const head = el.querySelector('thead')?.getBoundingClientRect().height ?? 0;
      const row  = el.querySelector('tbody tr')?.getBoundingClientRect().height ?? 0;
      const out  = nextAutoScroll(state, {
        now,
        dt,
        max:     el.scrollHeight - el.clientHeight,
        // One screen of rows, minus a row of overlap so the last row of the
        // previous page is still there as a point of reference.
        page:    el.clientHeight - head - row,
        reduced: media.matches,
      });
      state = out.state;

      if (Math.abs(el.scrollTop - out.scrollTop) >= 0.5) el.scrollTop = out.scrollTop;
      const opacity = out.opacity >= 1 ? '' : out.opacity.toFixed(3);
      if (el.style.opacity !== opacity) el.style.opacity = opacity;
    }

    return () => {
      cancelAnimationFrame(frame);
      if (touched) touched.style.opacity = '';
    };
  }, [ref, enabled]);
}
