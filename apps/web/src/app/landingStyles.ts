/**
 * Style objects + injected CSS for the marketing home page (page.tsx).
 *
 * Matches the apps/web idiom: typed inline-style objects referencing the
 * `--color-*` theme variables (emitted by layout.tsx from @gfp/theme), a
 * 1160px centered container, white cards with soft shadow, and a dark
 * `--color-primary` hero band. Responsive column collapsing is done with the
 * injected `landingCss` class rules (media queries can't live in inline styles).
 */
import type { CSSProperties } from 'react';

const CONTAINER = 1160;

export const L: Record<string, CSSProperties> = {
  // ── Shell ──────────────────────────────────────────────────────────────────
  page:      { minHeight: '100vh' },
  container: { maxWidth: CONTAINER, margin: '0 auto', padding: '0 1.25rem', width: '100%' },

  // (Top nav lives in the shared SiteHeader rendered by the root layout.)

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero:      { backgroundColor: 'var(--color-primary)', paddingBottom: '3.5rem' },
  heroInner: { maxWidth: CONTAINER, margin: '0 auto', padding: '3rem 1.25rem 0' },
  heroTag:   { color: '#c8dfb0', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: '1rem' },
  heroTitle: { color: 'var(--color-surface)', fontSize: '2.75rem', fontWeight: 900, lineHeight: 1.1, marginBottom: '1.25rem', maxWidth: 720 },
  heroSub:   { color: 'var(--color-highlight)', fontSize: '1.1rem', lineHeight: 1.6, marginBottom: '2rem', maxWidth: 620 },
  heroCtas:  { display: 'flex', flexWrap: 'wrap', gap: '0.9rem' },

  // ── Buttons ────────────────────────────────────────────────────────────────
  ctaPrimary:     { backgroundColor: 'var(--color-surface)', color: 'var(--color-primary)', fontSize: '1rem', fontWeight: 800, padding: '0.9rem 1.75rem', borderRadius: 12, display: 'inline-block' },
  ctaOutline:     { backgroundColor: 'transparent', color: 'var(--color-surface)', fontSize: '1rem', fontWeight: 700, padding: '0.9rem 1.75rem', borderRadius: 12, border: '1.5px solid var(--color-surface)', display: 'inline-block' },
  ctaOnLight:     { backgroundColor: 'var(--color-primary)', color: '#fff', fontSize: '1rem', fontWeight: 800, padding: '0.9rem 1.75rem', borderRadius: 12, display: 'inline-block' },

  // ── Stats strip ──────────────────────────────────────────────────────────
  stats:     { backgroundColor: '#fff', borderBottom: '1px solid #eee' },
  statsInner:{ maxWidth: CONTAINER, margin: '0 auto', padding: '1.5rem 1.25rem', display: 'flex', flexWrap: 'wrap', gap: '1.25rem' },
  statItem:  { flex: '1 1 140px', textAlign: 'center' },
  statValue: { color: 'var(--color-primary)', fontSize: '1.4rem', fontWeight: 900 },
  statLabel: { color: '#4b5563', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  // ── Sections ───────────────────────────────────────────────────────────────
  section:      { padding: '3.5rem 0' },
  sectionTitle: { color: 'var(--color-primary)', fontSize: '1.9rem', fontWeight: 900, textAlign: 'center', marginBottom: '0.75rem' },
  sectionSub:   { color: '#4b5563', fontSize: '1rem', textAlign: 'center', lineHeight: 1.6, marginBottom: '2.5rem', maxWidth: 640, marginLeft: 'auto', marginRight: 'auto' },

  // ── Feature cards ──────────────────────────────────────────────────────────
  featureCard: { backgroundColor: '#fff', border: '1px solid #e8e8e8', borderRadius: 14, padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  featureIcon: { fontSize: '2rem', marginBottom: '0.75rem' },
  featureTitle:{ color: 'var(--color-primary)', fontSize: '1.05rem', fontWeight: 800, marginBottom: '0.5rem' },
  featureDesc: { color: '#4b5563', fontSize: '0.9rem', lineHeight: 1.5 },

  // ── Lifecycle walkthrough ────────────────────────────────────────────────
  step:       { backgroundColor: '#fff', border: '1px solid #e8e8e8', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' },
  stepShot:   { width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', display: 'block', backgroundColor: 'var(--color-highlight)' },
  stepShotPlaceholder: { width: '100%', aspectRatio: '16 / 10', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-highlight)', color: 'var(--color-primary)', gap: '0.35rem' },
  stepBody:   { padding: '1.25rem 1.5rem 1.5rem' },
  stepBadge:  { display: 'inline-block', backgroundColor: 'var(--color-primary)', color: '#fff', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, padding: '0.25rem 0.6rem', borderRadius: 999, marginBottom: '0.6rem' },
  stepTitle:  { color: 'var(--color-primary)', fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.4rem' },
  stepDesc:   { color: '#4b5563', fontSize: '0.92rem', lineHeight: 1.55 },

  // ── Golfer find-your-event teaser ──────────────────────────────────────────
  golferBand: { backgroundColor: 'var(--color-highlight)' },
  golferInner:{ maxWidth: CONTAINER, margin: '0 auto', padding: '2.5rem 1.25rem', textAlign: 'center' },
  golferTitle:{ color: 'var(--color-primary)', fontSize: '1.5rem', fontWeight: 900, marginBottom: '0.5rem' },
  golferSub:  { color: 'var(--color-primary)', fontSize: '0.98rem', lineHeight: 1.6, marginBottom: '1.5rem', opacity: 0.85, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' },

  // ── Bottom CTA ───────────────────────────────────────────────────────────
  bottomCta:      { backgroundColor: 'var(--color-primary)', textAlign: 'center' },
  bottomCtaInner: { maxWidth: CONTAINER, margin: '0 auto', padding: '3.5rem 1.25rem' },
  bottomCtaTitle: { color: 'var(--color-surface)', fontSize: '1.9rem', fontWeight: 900, marginBottom: '0.75rem' },
  bottomCtaSub:   { color: 'var(--color-highlight)', fontSize: '1rem', lineHeight: 1.6, marginBottom: '1.75rem', maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' },

  // ── Footer ─────────────────────────────────────────────────────────────────
  footer:     { borderTop: '1px solid #eee', backgroundColor: '#fff' },
  footerInner:{ maxWidth: CONTAINER, margin: '0 auto', padding: '1.5rem 1.25rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' },
  footerText: { color: '#4b5563', fontSize: '0.82rem' },
  footerLink: { color: 'var(--color-primary)', fontSize: '0.82rem', fontWeight: 700 },
};

/**
 * Injected once on the page: responsive grids that collapse on small screens
 * (inline styles can't hold media queries), plus hover affordances for CTAs.
 */
export const landingCss = `
.gfp-feature-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
.gfp-step-grid    { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; }
@media (max-width: 900px) {
  .gfp-feature-grid { grid-template-columns: repeat(2, 1fr); }
  .gfp-step-grid    { grid-template-columns: 1fr; max-width: 520px; margin: 0 auto; }
}
@media (max-width: 620px) {
  .gfp-feature-grid { grid-template-columns: 1fr; }
  .gfp-step-grid    { grid-template-columns: 1fr; }
  .gfp-hero-title   { font-size: 2.1rem !important; }
}
.gfp-cta:hover { opacity: 0.92; text-decoration: none; }
`;
