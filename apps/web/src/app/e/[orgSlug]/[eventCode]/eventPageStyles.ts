/**
 * Shared style objects for the public event page surface.
 *
 * `s` — main column / shell / leaderboard styles
 * `w` — sidebar widget styles (thermometer, hole challenges, sponsors)
 * `gridCss` — CSS string injected once at the page root to drive the
 *   responsive 1fr/288px sidebar grid and the live-pill pulse animation.
 *
 * Theme tokens (var(--color-primary) etc.) are emitted by the page itself
 * after parsing the event's themeJson — see buildThemeCss.
 */

export function buildThemeCss(themeJson: string | null): string {
  if (!themeJson) return '';
  try {
    const t = JSON.parse(themeJson) as Record<string, string>;
    return Object.entries(t)
      .filter(([, v]) => /^#[0-9a-fA-F]{6}$/.test(v))
      .map(([k, v]) => `--color-${k}:${v}`)
      .join(';');
  } catch { return ''; }
}

export const gridCss = `
  .gfp-grid {
    display: grid;
    grid-template-columns: 1fr 288px;
    gap: 1.25rem;
    align-items: start;
  }
  @media (max-width: 740px) {
    .gfp-grid { grid-template-columns: 1fr; }
  }
  @keyframes gfp-live-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.4; transform: scale(0.85); }
  }
`;

export const s = {
  page:      { minHeight: '100vh', display: 'flex', flexDirection: 'column' as const },
  header:    { backgroundColor: 'var(--color-primary)', padding: '1.5rem 1rem' },
  headerInner: {
    maxWidth: 1160, margin: '0 auto', display: 'flex', alignItems: 'center',
    gap: '1rem', flexWrap: 'wrap' as const,
  },
  orgLogo:   { height: 48, width: 'auto', borderRadius: 6, backgroundColor: '#fff', padding: '4px 8px' },
  orgName:   { fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' as const, letterSpacing: 1 },
  eventName: { fontSize: '1.5rem', fontWeight: 800, color: '#fff', margin: 0 },
  badge:     { padding: '4px 12px', borderRadius: 14, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginLeft: 'auto' },

  main:    { flex: 1, maxWidth: 1160, margin: '0 auto', width: '100%', padding: '1.5rem 1rem' },
  mainCol: { display: 'flex', flexDirection: 'column' as const, gap: '1.25rem' },
  sidebar: { display: 'flex', flexDirection: 'column' as const, gap: '1rem' },

  card:      { backgroundColor: '#fff', borderRadius: 12, padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  cardHeader:{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' },
  cardHeaderRight: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  cardTitle: { fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '1rem' },
  infoGrid:  { display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' },
  infoItem:  { display: 'flex', gap: '0.75rem', alignItems: 'flex-start' },
  infoIcon:  { fontSize: '1.25rem', lineHeight: 1, marginTop: 2 },
  infoLabel: { fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-accent)', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  infoValue: { fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-primary)', marginTop: 2 },
  ctaRow:    { display: 'flex', gap: '0.75rem', flexWrap: 'wrap' as const, marginBottom: '1rem' },
  ctaBtn:    { display: 'inline-block', padding: '0.75rem 1.5rem', borderRadius: 8, fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', transition: 'opacity 0.15s', textDecoration: 'none' },
  ctaNote:   { fontSize: '0.875rem', color: 'var(--color-accent)' },
  completedBadge: { backgroundColor: '#27ae60', color: '#fff', padding: '3px 10px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 700 },
  liveLink:  { fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-action)', textDecoration: 'none' },

  liveBanner: {
    backgroundColor: '#f0faf4',
    border: '1px solid #b7e4c7',
    borderLeft: '4px solid #27ae60',
    borderRadius: 12,
    padding: '1.125rem 1.375rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap' as const,
  },
  liveBannerInfo:    { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' as const },
  livePill: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    backgroundColor: '#e74c3c', color: '#fff',
    padding: '3px 10px', borderRadius: 12,
    fontSize: '0.75rem', fontWeight: 800, letterSpacing: 0.5,
    flexShrink: 0,
  },
  livePulse: {
    width: 7, height: 7, borderRadius: '50%',
    backgroundColor: '#fff',
    display: 'inline-block',
    animation: 'gfp-live-pulse 1.4s ease-in-out infinite',
  },
  liveBannerText:    { fontSize: '0.9rem', fontWeight: 600, color: '#1a6b3c' },
  liveBannerActions: { display: 'flex', gap: '0.625rem', flexWrap: 'wrap' as const },
  liveBtn: {
    display: 'inline-block',
    padding: '0.5rem 1.125rem',
    borderRadius: 8,
    fontWeight: 700, fontSize: '0.875rem',
    textDecoration: 'none',
    backgroundColor: '#27ae60', color: '#fff',
    whiteSpace: 'nowrap' as const,
  },
  tvBtn: {
    display: 'inline-block',
    padding: '0.5rem 1.125rem',
    borderRadius: 8,
    fontWeight: 700, fontSize: '0.875rem',
    textDecoration: 'none',
    backgroundColor: '#fff', color: '#27ae60',
    border: '1.5px solid #27ae60',
    whiteSpace: 'nowrap' as const,
  },
  placeholder: { color: 'var(--color-accent)', fontSize: '0.95rem', fontStyle: 'italic' },
  table:     { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.95rem' },
  th:        { padding: '0.625rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  td:        { padding: '0.625rem 1rem', fontSize: '0.95rem', color: 'var(--color-primary)' },
  code:      { backgroundColor: '#e8f0e8', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: '0.875rem' },
  footer:    { textAlign: 'center' as const, padding: '1.5rem', fontSize: '0.8rem', color: 'var(--color-accent)', borderTop: '1px solid #eee' },
} as const;

export const w = {
  card:     { backgroundColor: '#fff', borderRadius: 12, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  title:    { fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: '0.875rem' },

  // Thermometer
  totalAmt:   { fontSize: '2rem', fontWeight: 900, color: 'var(--color-primary)', lineHeight: 1 },
  totalLabel: { fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-accent)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: '0.75rem', marginTop: 2 },
  track:      { height: 14, backgroundColor: '#e8f0e8', borderRadius: 7, overflow: 'hidden', marginBottom: '0.5rem' },
  fill:       { height: '100%', backgroundColor: 'var(--color-action)', borderRadius: 7, transition: 'width 0.6s ease' },
  goalRow:    { display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' },
  goalPct:    { fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-action)' },
  goalAmt:    { fontSize: '0.8rem', color: 'var(--color-accent)' },
  subStat:    { fontSize: '0.8rem', color: 'var(--color-accent)', marginTop: '0.5rem' },

  // Hole Challenges
  holeRow:    { display: 'flex', alignItems: 'flex-start', gap: '0.625rem', paddingVertical: '0.5rem', borderTop: '1px solid #f0f0f0', paddingTop: '0.5rem' },
  holeNum:    { fontSize: '0.8rem', fontWeight: 800, color: 'var(--color-primary)', minWidth: 52, paddingTop: 1 },
  holeInfo:   { display: 'flex', flexDirection: 'column' as const, gap: 2 },
  holeDesc:   { fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' },
  holeSponsor:{ fontSize: '0.75rem', color: 'var(--color-accent)' },

  // Sponsors
  sponsorRow:    { display: 'flex', alignItems: 'center', gap: '0.625rem', paddingTop: '0.625rem', borderTop: '1px solid #f0f0f0' },
  sponsorLogo:   { width: 36, height: 36, objectFit: 'contain' as const, borderRadius: 4, flexShrink: 0 },
  sponsorInfo:   { flex: 1, minWidth: 0 },
  sponsorName:   { fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  sponsorTagline:{ fontSize: '0.7rem', color: 'var(--color-accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  tierDot:       { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
} as const;
