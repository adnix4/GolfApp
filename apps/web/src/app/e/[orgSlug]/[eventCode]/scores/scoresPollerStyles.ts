/**
 * Style modules for the public scores poller page.
 *
 * Two visual modes:
 * - `nm` — normal/mobile mode shown at /e/{slug}/{code}/scores
 * - `tv` — high-contrast TV/projection mode triggered by ?tv=1
 *
 * Each is a flat const block so consumers can `{ ...nm.td, textAlign: ... }`
 * cheaply without per-render allocations. The pre-merged cell styles at the
 * bottom (`tvCellStyles`/`nmCellStyles`) skip the spread on the row hot path.
 *
 * `buildThemeCss` parses the org/event themeJson into a CSS-vars string the
 * page injects into a `<style>` block at SSR time (shared with the event
 * landing page so both surfaces emit the same tokens, including the derived
 * `--color-on-primary` / `--color-on-action` label colors).
 */

import { getContrastRatio, mixHex, readableOn, readableTextOn } from '@gfp/theme';

export { buildThemeCss } from '../eventPageStyles';

// ── TV PALETTE ────────────────────────────────────────────────────────────────

/**
 * The neutral dark board TV mode has always used. Every branded value below is
 * derived FROM these, so an event with no theme renders byte-identically to
 * before, and a themed event shifts the same board toward its brand rather
 * than getting a different design.
 */
const TV_BASE = {
  board:   '#0d1117',
  panel:   '#161b22',
  rowEven: '#161b22',
  rowOdd:  '#1c2128',
  border:  '#30363d',
  ink:     '#e6edf3',
  inkDim:  '#8b949e',
} as const;

/** Body text on the board must clear this. Higher than AA's 4.5 on purpose:
 *  the reader is thirty feet away, not eighteen inches. */
const TV_INK_MIN_RATIO   = 7;
/** Column labels and section headings — large or semi-large text, AA is enough. */
const TV_BRAND_MIN_RATIO = 4.5;

/**
 * Tints a neutral dark surface toward the brand, backing the tint off until
 * body text still clears TV_INK_MIN_RATIO against it.
 *
 * A brand color is only ever validated against a LIGHT surface at save time,
 * so nothing stops an organizer from picking near-white. Blending that in at a
 * fixed weight would lift the board until white-on-board text failed. Rather
 * than cap the palette (and silently ignore pale brands), the tint itself
 * yields: it walks the weight down and takes the strongest tint that still
 * reads. Worst case it returns the untinted neutral.
 */
function tint(base: string, brand: string, weight: number): string {
  for (let w = weight; w > 0.005; w -= 0.02) {
    const c = mixHex(brand, base, w);
    if (getContrastRatio(TV_BASE.ink, c) >= TV_INK_MIN_RATIO) return c;
  }
  return base;
}

/**
 * Emits the `--tv-*` custom properties the TV styles below read.
 *
 * Kept as CSS variables rather than computed style objects so the style consts
 * stay module-level constants — the row hot path depends on those being stable
 * references (see the pre-merged cell styles at the bottom of this file).
 *
 * Returns '' for an unthemed event; every consumer carries the neutral value
 * as its var() fallback.
 */
export function buildTvThemeCss(themeJson: string | null | undefined): string {
  if (!themeJson) return '';
  try {
    const t = JSON.parse(themeJson) as Record<string, string>;
    const hex = (v: string | undefined) => (v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null);

    const primary = hex(t.primary);
    if (!primary) return '';
    // Accent is decorative-only by contract, so the brand's "ink" comes from
    // action when it's set, falling back to primary.
    const brandInkSource = hex(t.action) ?? primary;

    const board   = tint(TV_BASE.board,   primary, 0.10);
    const panel   = tint(TV_BASE.panel,   primary, 0.16);
    const rowEven = tint(TV_BASE.rowEven, primary, 0.10);
    const rowOdd  = tint(TV_BASE.rowOdd,  primary, 0.10);
    const border  = mixHex(primary, TV_BASE.border, 0.35);

    // Brand ink is checked against the LIGHTEST board surface — the one that
    // gives it the least contrast — so a single token is safe everywhere.
    const lightestSurface = [board, panel, rowEven, rowOdd]
      .reduce((a, b) => (getContrastRatio('#000000', b) > getContrastRatio('#000000', a) ? b : a));
    const brandInk = readableOn(brandInkSource, lightestSurface, TV_BRAND_MIN_RATIO);

    // The header is a solid brand block, so its own text is derived against the
    // brand fill — a pale primary flips these to near-black automatically.
    const headerFg = readableTextOn(primary);

    return [
      `--tv-board:${board}`,
      `--tv-panel:${panel}`,
      `--tv-row-even:${rowEven}`,
      `--tv-row-odd:${rowOdd}`,
      `--tv-border:${border}`,
      `--tv-brand-ink:${brandInk}`,
      `--tv-header-bg:${primary}`,
      `--tv-header-fg:${headerFg}`,
      // Dimmed variants of the header text, mixed toward the fill so they stay
      // legible whichever way readableTextOn went.
      `--tv-header-fg-dim:${mixHex(headerFg, primary, 0.7)}`,
      `--tv-header-border:${mixHex(headerFg, primary, 0.4)}`,
    ].join(';');
  } catch { return ''; }
}

// ── KEYFRAMES (injected once into the page <style> block) ─────────────────────

export const cssKeyframes = `
  @keyframes gfp-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.25; }
  }
  @keyframes gfp-hio-slide {
    0%   { transform: translateY(-120%) scale(0.92); opacity: 0; }
    60%  { transform: translateY(4px) scale(1.02);  opacity: 1; }
    100% { transform: translateY(0)   scale(1);      opacity: 1; }
  }
  @keyframes gfp-hio-flag {
    0%, 100% { transform: rotate(-8deg) scale(1);    }
    25%       { transform: rotate(8deg)  scale(1.15); }
    50%       { transform: rotate(-6deg) scale(1.05); }
    75%       { transform: rotate(6deg)  scale(1.12); }
  }
  @keyframes gfp-hio-glow {
    0%, 100% { box-shadow: 0 4px 32px rgba(245,158,11,0.45), 0 0 0 0 rgba(245,158,11,0.3); }
    50%       { box-shadow: 0 4px 48px rgba(245,158,11,0.8), 0 0 0 8px rgba(245,158,11,0);  }
  }
  /* The track renders its cells twice, so travelling exactly -50% lands the
     second copy where the first started — the loop has no visible seam. */
  @keyframes gfp-ticker {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
  /* Motion-sensitive viewers get the same content as a strip they can swipe or
     drag instead of one that moves on its own. */
  @media (prefers-reduced-motion: reduce) {
    .gfp-ticker-track { animation: none !important; }
    .gfp-ticker-viewport { overflow-x: auto !important; }
  }
`;

// ── HOLE-IN-ONE BANNER ────────────────────────────────────────────────────────

export const hio = {
  banner: {
    position: 'fixed' as const,
    top: 0, left: 0, right: 0,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    padding: '1.125rem 1.5rem',
    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #f59e0b 100%)',
    backgroundSize: '200% 100%',
    color: '#1c1917',
    animation: 'gfp-hio-slide 0.45s cubic-bezier(0.34,1.56,0.64,1), gfp-hio-glow 1.8s ease-in-out 0.5s infinite',
  },
  flag: {
    fontSize: '1.75rem',
    display: 'inline-block',
    animation: 'gfp-hio-flag 0.9s ease-in-out 0.5s infinite',
  },
  textBlock: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center' },
  label: { fontSize: '0.65rem', fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase' as const, opacity: 0.7 },
  text: { fontSize: '1.1rem', fontWeight: 900, letterSpacing: 0.5 },
  close: {
    position: 'absolute' as const, right: '1rem',
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '1.1rem', color: '#1c1917', lineHeight: 1, opacity: 0.6,
    padding: '4px 8px',
  },
} as const;

// ── NORMAL MODE ───────────────────────────────────────────────────────────────

export const nm = {
  page:   { minHeight: '100vh', display: 'flex', flexDirection: 'column' as const, backgroundColor: '#f5f7fa' },

  header:      { backgroundColor: 'var(--color-primary)', padding: '1.25rem 1.5rem' },
  headerInner: { maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 },
  // Outlined against the primary header so it reads as a control, not a label.
  backBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
    padding: '6px 12px', borderRadius: 8,
    border: '1.5px solid rgba(255,255,255,0.45)',
    color: 'var(--color-on-primary, #fff)', textDecoration: 'none',
    fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap' as const,
  },
  orgName:     { fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-on-primary, #fff)', opacity: 0.7, textTransform: 'uppercase' as const, letterSpacing: 1 },
  eventName:   { fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-on-primary, #fff)' },
  badges:      { display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 },
  liveBadge:   { display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#e74c3c', color: '#fff', padding: '4px 12px', borderRadius: 14, fontSize: '0.8rem', fontWeight: 700, letterSpacing: 0.5 },
  liveDot:     { width: 8, height: 8, borderRadius: '50%', backgroundColor: '#fff', animation: 'gfp-pulse 1.4s ease-in-out infinite', display: 'inline-block' },
  finalBadge:  { backgroundColor: '#27ae60', color: '#fff', padding: '4px 12px', borderRadius: 14, fontSize: '0.8rem', fontWeight: 700 },

  main:      { flex: 1, maxWidth: 960, margin: '0 auto', width: '100%', padding: '1.5rem 1rem' },

  empty:     { textAlign: 'center' as const, padding: '4rem 1rem' },
  emptyIcon: { fontSize: '3rem', marginBottom: '0.75rem' },
  emptyText: { fontSize: '1.1rem', color: '#4b5563', fontStyle: 'italic' as const },

  tableWrap: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' },
  table:     { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.95rem' },
  th:        { padding: '0.75rem 1rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase' as const, letterSpacing: 0.5, backgroundColor: 'var(--color-highlight)', borderBottom: '2px solid #e8e8e8' },
  td:        { padding: '0.75rem 1rem', color: 'var(--color-primary)' },

  footer:      { borderTop: '1px solid #e0e0e0', padding: '0.875rem 1.5rem', backgroundColor: '#fff' },
  footerInner: { maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' },
  footerMeta:  { fontSize: '0.8rem', color: '#4b5563' },
  footerError: { fontSize: '0.8rem', color: '#e74c3c', fontWeight: 600 },

  // Ticker — full-bleed under the header, so it reads as part of the board
  // rather than a card floating in the content column.
  ticker:         { backgroundColor: '#fff', borderBottom: '1px solid #e0e0e0', padding: '0.5rem 0' },
  tickerViewport: { overflow: 'hidden' },
  tickerCell:     { display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0 2.25rem' },
  // Section break. Wide enough that the eye reads "that run ended" before the
  // next heading arrives — a cell-sized space would just look like a long name.
  tickerGap:      { display: 'inline-block', width: '5rem' },
  tickerHeading:  { fontSize: '1.05rem', fontWeight: 900, letterSpacing: 0.5, textTransform: 'uppercase' as const, color: 'var(--color-primary)', whiteSpace: 'nowrap' as const },
  tickerChip:     { fontSize: '0.6rem', fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: 'var(--color-primary)', opacity: 0.55 },
  tickerLogo:     { height: 22, width: 'auto', objectFit: 'contain' as const },
  // Auction lot photo. Fixed box + cover, unlike the sponsor logo's free width:
  // lot photos are uncropped organizer uploads in any aspect ratio, and letting
  // them size themselves would make the track jump between cells.
  tickerThumb:    { height: 26, width: 38, objectFit: 'cover' as const, borderRadius: 4, backgroundColor: '#f1f3f5' },
  tickerName:     { fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary)' },
  tickerTagline:  { fontSize: '0.8rem', color: '#4b5563' },
  tickerPrice:    { fontSize: '0.85rem', fontWeight: 800, color: '#0f7a3d' },
  tickerSep:      { color: '#c9ced6' },
} as const;

// ── TV MODE ───────────────────────────────────────────────────────────────────

export const tv = {
  page:   { minHeight: '100vh', display: 'flex', flexDirection: 'column' as const, backgroundColor: 'var(--tv-board, #0d1117)' },

  // Solid brand block. It carries the logo and the event name, which makes it
  // the one place on the board where the brand is stated rather than hinted.
  header:      { backgroundColor: 'var(--tv-header-bg, #161b22)', padding: '1.5rem 2.5rem', borderBottom: '1px solid var(--tv-border, #30363d)' },
  headerInner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem' },
  headerLeft:  { display: 'flex', alignItems: 'center', gap: '1.5rem', minWidth: 0 },
  // White chip behind the logo: event logos are uploaded as-is, and a dark
  // wordmark with a transparent background would vanish into a dark brand fill.
  logo:        { height: 64, width: 'auto', maxWidth: 220, objectFit: 'contain' as const, borderRadius: 8, backgroundColor: '#fff', padding: '6px 10px', flexShrink: 0 },
  // TV mode had no way back at all before this.
  backBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
    padding: '10px 18px', borderRadius: 10,
    border: '1.5px solid var(--tv-header-border, #30363d)', backgroundColor: 'transparent',
    color: 'var(--tv-header-fg, #e6edf3)', textDecoration: 'none',
    fontSize: '1rem', fontWeight: 700, whiteSpace: 'nowrap' as const,
  },
  orgName:     { fontSize: '0.85rem', fontWeight: 600, color: 'var(--tv-header-fg-dim, rgba(255,255,255,0.45))', textTransform: 'uppercase' as const, letterSpacing: 2 },
  eventName:   { fontSize: '2.2rem', fontWeight: 900, color: 'var(--tv-header-fg, #e6edf3)' },
  badges:      { display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 },
  liveBadge:   { display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#da3633', color: '#fff', padding: '6px 16px', borderRadius: 16, fontSize: '0.95rem', fontWeight: 800, letterSpacing: 1 },
  liveDot:     { width: 10, height: 10, borderRadius: '50%', backgroundColor: '#fff', animation: 'gfp-pulse 1.4s ease-in-out infinite', display: 'inline-block' },
  finalBadge:  { backgroundColor: '#238636', color: '#fff', padding: '6px 16px', borderRadius: 16, fontSize: '0.95rem', fontWeight: 800 },

  main:      { flex: 1, padding: '1.5rem 2.5rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' as const },

  empty:     { textAlign: 'center' as const, padding: '6rem 1rem' },
  emptyIcon: { fontSize: '4rem', marginBottom: '1rem' },
  emptyText: { fontSize: '1.5rem', color: '#8b949e', fontStyle: 'italic' as const },

  tableWrap: { backgroundColor: 'transparent', borderRadius: 12, overflow: 'hidden', flex: 1 },
  table:     { width: '100%', borderCollapse: 'collapse' as const, fontSize: '1.1rem' },
  // Column labels carry the brand color; the scores themselves stay near-white,
  // because a number a room is reading at a glance should be maximum contrast.
  th:        { padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--tv-brand-ink, #8b949e)', textTransform: 'uppercase' as const, letterSpacing: 1, backgroundColor: 'var(--tv-row-odd, #1c2128)', borderBottom: '1px solid var(--tv-border, #30363d)' },
  td:        { padding: '1rem 1.25rem', color: '#e6edf3', fontWeight: 600 },

  statusBar:   { padding: '0.625rem 2.5rem', backgroundColor: 'var(--tv-panel, #161b22)', borderTop: '1px solid var(--tv-border, #30363d)' },
  statusMeta:  { fontSize: '0.85rem', color: '#484f58' },
  statusError: { fontSize: '0.85rem', color: '#f85149', fontWeight: 600 },

  // Ticker — runs across the TOP, directly under the header, so the divider
  // sits on its bottom edge. flexShrink:0 keeps it off the table's height
  // budget; the table is the thing that scrolls in TV mode.
  ticker:         { padding: '0.75rem 0', backgroundColor: 'var(--tv-panel, #161b22)', borderBottom: '1px solid var(--tv-border, #30363d)', flexShrink: 0 },
  tickerViewport: { overflow: 'hidden' },
  tickerCell:     { display: 'inline-flex', alignItems: 'center', gap: '0.75rem', padding: '0 3.5rem' },
  tickerGap:      { display: 'inline-block', width: '10rem' },
  // Deliberately the loudest thing in the strip — bigger than a sponsor name or
  // a lot title — so a room glancing up gets the instruction before the list.
  tickerHeading:  { fontSize: '1.6rem', fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase' as const, color: 'var(--tv-brand-ink, #f5f7fa)', whiteSpace: 'nowrap' as const },
  tickerChip:     { fontSize: '0.65rem', fontWeight: 800, color: '#484f58', textTransform: 'uppercase' as const, letterSpacing: 2 },
  tickerLogo:     { height: 28, width: 'auto', objectFit: 'contain' as const, borderRadius: 4, backgroundColor: '#fff', padding: '2px 6px' },
  // Bigger than the sponsor logo here on purpose: a lot photo is the thing a
  // guest across the room decides to bid on, and it has to read at that range.
  tickerThumb:    { height: 44, width: 64, objectFit: 'cover' as const, borderRadius: 6, backgroundColor: 'var(--tv-row-odd, #21262d)' },
  tickerName:     { fontSize: '1rem', fontWeight: 700, color: '#e6edf3' },
  tickerTagline:  { fontSize: '0.85rem', color: '#8b949e' },
  tickerPrice:    { fontSize: '1rem', fontWeight: 800, color: '#3fb950' },
  tickerSep:      { color: 'var(--tv-border, #30363d)' },
} as const;

// ── ROW BACKGROUND ALTERNATION ────────────────────────────────────────────────

export const tvRowStyles = {
  even: { backgroundColor: 'var(--tv-row-even, #161b22)', borderBottom: '1px solid var(--tv-border, #30363d)' } as const,
  odd:  { backgroundColor: 'var(--tv-row-odd, #1c2128)',  borderBottom: '1px solid var(--tv-border, #30363d)' } as const,
};

export const nmRowStyles = {
  even: { backgroundColor: '#fff',    borderBottom: '1px solid #eee' } as const,
  odd:  { backgroundColor: '#f9fafb', borderBottom: '1px solid #eee' } as const,
};

// ── PRE-MERGED CELL STYLES ────────────────────────────────────────────────────
// Hoisted out of the Row render so per-row cell `style` props are stable
// references. Only the toPar cell still allocates per row (color depends on
// the team's score) — and that one merges into toParBase.

export const tvCellStyles = {
  rank:        { ...tv.td, textAlign: 'center' as const, color: '#8b949e' },
  team:        { ...tv.td, fontWeight: 700 as const },
  toParBase:   { ...tv.td, textAlign: 'right' as const, fontWeight: 900 as const, fontSize: '1.3rem' },
  rightMuted:  { ...tv.td, textAlign: 'right' as const, color: '#8b949e' },
} as const;

export const nmCellStyles = {
  rank:           { ...nm.td, textAlign: 'center' as const, fontWeight: 700 as const, color: '#555' },
  team:           { ...nm.td, fontWeight: 600 as const },
  toParBase:      { ...nm.td, textAlign: 'right' as const, fontWeight: 800 as const, fontSize: '1.05rem' },
  rightMuted:     { ...nm.td, textAlign: 'right' as const, color: '#555' },
  rightMutedAlt:  { ...nm.td, textAlign: 'right' as const, color: '#888' },
} as const;
