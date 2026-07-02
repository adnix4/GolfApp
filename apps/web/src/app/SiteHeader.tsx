'use client';

/**
 * Persistent site header rendered by the root layout on every page (public
 * marketing, event directory, and event pages). Sticky, brand-consistent, with
 * a mobile hamburger menu.
 *
 * Colors are HARDCODED to the Golf Fundraiser Pro brand (eco-green) rather than
 * the `--color-*` theme vars, so it stays consistent even on event pages that
 * inject a per-event palette at :root — the header reads as platform chrome,
 * distinct from an org's event branding.
 *
 * Hidden in the leaderboard TV/kiosk view (`/scores?tv=1`), which injects
 * `.gfp-site-header{display:none}` — a nav bar doesn't belong on a big-screen
 * display.
 */

import { useState } from 'react';
import { ADMIN_URL } from '@/lib/api';

const BRAND   = '#31572c'; // primary  (eco-green)
const SURFACE = '#f4f7de'; // cream
const ACCENT  = '#8ba955'; // sage
const HILITE  = '#ecf39e'; // pale lime

const REGISTER = `${ADMIN_URL}/register`;
const LOGIN    = `${ADMIN_URL}/login`;

export default function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="gfp-site-header" style={s.header}>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div style={s.inner}>
        <a href="/" style={s.logo} onClick={() => setOpen(false)}>⛳ Golf Fundraiser Pro</a>

        {/* Desktop nav — display is controlled by the .gfp-hdr-desktop class
            (NOT an inline style, which would beat the media query). */}
        <nav className="gfp-hdr-desktop">
          <a href="/events" style={s.link} className="gfp-hdr-link">Find your event</a>
          <a href={LOGIN} style={s.link} className="gfp-hdr-link">Organizer Login</a>
          <a href={REGISTER} style={s.cta} className="gfp-hdr-cta">Sign up your event →</a>
        </nav>

        {/* Mobile toggle */}
        <button
          className="gfp-hdr-mobile"
          style={s.burger}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
        >
          {open ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile dropdown — only rendered when open; the burger that opens it is
          itself mobile-only, so this panel is inherently mobile-only. */}
      {open && (
        <nav className="gfp-hdr-mpanel" style={s.mobilePanel}>
          <a href="/events"  style={s.mobileLink} onClick={() => setOpen(false)}>Find your event</a>
          <a href={LOGIN}    style={s.mobileLink} onClick={() => setOpen(false)}>Organizer Login</a>
          <a href={REGISTER} style={{ ...s.mobileLink, ...s.mobileCta }} onClick={() => setOpen(false)}>Sign up your event →</a>
        </nav>
      )}
    </header>
  );
}

const s: Record<string, React.CSSProperties> = {
  header: { position: 'sticky', top: 0, zIndex: 50, backgroundColor: BRAND, boxShadow: '0 1px 6px rgba(0,0,0,0.18)' },
  inner:  { maxWidth: 1160, margin: '0 auto', padding: '0.7rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' },
  logo:   { color: SURFACE, fontSize: '1.1rem', fontWeight: 800, whiteSpace: 'nowrap' },
  link:   { color: HILITE, fontSize: '0.92rem', fontWeight: 600 },
  cta:    { color: BRAND, backgroundColor: SURFACE, fontSize: '0.92rem', fontWeight: 800, padding: '0.5rem 1rem', borderRadius: 10 },
  burger: { color: SURFACE, background: 'transparent', border: `1.5px solid ${ACCENT}`, borderRadius: 8, fontSize: '1.1rem', lineHeight: 1, padding: '0.35rem 0.6rem', cursor: 'pointer' },
  mobilePanel: { display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.5rem 1.25rem 1rem', backgroundColor: BRAND, borderTop: `1px solid ${ACCENT}44` },
  mobileLink:  { color: HILITE, fontSize: '1rem', fontWeight: 600, padding: '0.7rem 0.25rem' },
  mobileCta:   { color: BRAND, backgroundColor: SURFACE, fontWeight: 800, borderRadius: 10, textAlign: 'center', marginTop: '0.4rem' },
};

const css = `
.gfp-hdr-link:hover, .gfp-hdr-cta:hover { opacity: 0.9; text-decoration: none; }
.gfp-hdr-desktop { display: flex; align-items: center; gap: 1.25rem; }
.gfp-hdr-mobile  { display: none; }
@media (max-width: 720px) {
  .gfp-hdr-desktop { display: none; }
  button.gfp-hdr-mobile { display: inline-flex; align-items: center; }
}
`;
