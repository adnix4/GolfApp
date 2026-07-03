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

export { buildThemeCss } from '../eventPageStyles';

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
  backLink:    { fontSize: '0.8rem', color: 'var(--color-action)', textDecoration: 'none', whiteSpace: 'nowrap' as const },
} as const;

// ── TV MODE ───────────────────────────────────────────────────────────────────

export const tv = {
  page:   { minHeight: '100vh', display: 'flex', flexDirection: 'column' as const, backgroundColor: '#0d1117' },

  header:      { backgroundColor: '#161b22', padding: '1.5rem 2.5rem', borderBottom: '1px solid #30363d' },
  headerInner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem' },
  orgName:     { fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' as const, letterSpacing: 2 },
  eventName:   { fontSize: '2.2rem', fontWeight: 900, color: '#e6edf3' },
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
  th:        { padding: '1rem 1.25rem', fontSize: '0.8rem', fontWeight: 700, color: '#8b949e', textTransform: 'uppercase' as const, letterSpacing: 1, backgroundColor: '#1c2128', borderBottom: '1px solid #30363d' },
  td:        { padding: '1rem 1.25rem', color: '#e6edf3', fontWeight: 600 },

  statusBar:   { padding: '0.625rem 2.5rem', backgroundColor: '#161b22', borderTop: '1px solid #30363d' },
  statusMeta:  { fontSize: '0.85rem', color: '#484f58' },
  statusError: { fontSize: '0.85rem', color: '#f85149', fontWeight: 600 },

  // Sponsor ticker
  ticker:        { padding: '0.875rem 2.5rem', backgroundColor: '#161b22', borderTop: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: '1.25rem' },
  tickerLabel:   { fontSize: '0.65rem', fontWeight: 800, color: '#484f58', textTransform: 'uppercase' as const, letterSpacing: 2, flexShrink: 0 },
  tickerContent: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  tickerLogo:    { height: 28, width: 'auto', objectFit: 'contain' as const, borderRadius: 4, backgroundColor: '#fff', padding: '2px 6px' },
  tickerName:    { fontSize: '1rem', fontWeight: 700, color: '#e6edf3' },
  tickerTagline: { fontSize: '0.85rem', color: '#8b949e' },
} as const;

// ── ROW BACKGROUND ALTERNATION ────────────────────────────────────────────────

export const tvRowStyles = {
  even: { backgroundColor: '#161b22', borderBottom: '1px solid #30363d' } as const,
  odd:  { backgroundColor: '#1c2128', borderBottom: '1px solid #30363d' } as const,
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
