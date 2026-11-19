import { describe, it, expect } from 'vitest';
import { cssKeyframes, hio, nm, tv } from '../scores/scoresPollerStyles';
import { gridCss, s } from '../eventPageStyles';

// MCAG 2.3.2 / 4.1.3 (problemList AX1): no decorative animation may loop
// forever, and each must stop under prefers-reduced-motion. The elements
// carry className="gfp-motion"; these styles are what make that class work.

/** Seconds an animation shorthand runs, delay included; Infinity if it loops. */
function runSeconds(animation: string): number {
  return Math.max(...animation.split(',').map(part => {
    const tokens = part.trim().split(/\s+/);
    if (tokens.includes('infinite')) return Infinity;
    const times = tokens.filter(t => /^[\d.]+s$/.test(t)).map(parseFloat);
    const [duration = 0, delay = 0] = times;
    const count = Number(tokens.find(t => /^\d+$/.test(t)) ?? 1);
    return delay + duration * count;
  }));
}

const animated: [string, string][] = [
  ['hole-in-one banner', hio.banner.animation],
  ['hole-in-one flag',   hio.flag.animation],
  ['scores live dot',    nm.liveDot.animation],
  ['TV live dot',        tv.liveDot.animation],
  ['event live pulse',   s.livePulse.animation],
];

describe('decorative motion', () => {
  it.each(animated)('%s stops on its own within 5 s', (_name, animation) => {
    expect(runSeconds(animation)).toBeLessThanOrEqual(5);
  });

  it('turns off gfp-motion under prefers-reduced-motion on both pages', () => {
    for (const css of [cssKeyframes, gridCss]) {
      const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
      expect(block).toMatch(/\.gfp-motion\s*\{\s*animation:\s*none\s*!important;/);
    }
  });

  it('measures a looping animation as unbounded (guards the helper)', () => {
    expect(runSeconds('gfp-pulse 1.4s ease-in-out infinite')).toBe(Infinity);
    expect(runSeconds('gfp-hio-flag 0.9s ease-in-out 0.5s 4')).toBeCloseTo(4.1);
  });
});
