'use client';

/**
 * The "quick run through of an event" section. Renders the lifecycle step cards
 * and makes each screenshot clickable — opening an animated lightbox that zooms
 * the image up over a dimmed backdrop (close on backdrop click, the ✕, or Esc).
 *
 * Extracted from the server-rendered home page because the zoom interaction
 * needs client state.
 */

import { useCallback, useEffect, useState } from 'react';
import { L } from './landingStyles';

type Step = { phase: string; title: string; desc: string; shot: string | null };

export default function Walkthrough({ steps }: { steps: Step[] }) {
  const [active, setActive] = useState<{ src: string; alt: string } | null>(null);
  const [shown,  setShown]  = useState(false); // drives the enter/exit transition

  const open = useCallback((src: string, alt: string) => {
    setActive({ src, alt });
    // Two rAFs so the element mounts at its "from" state before transitioning in.
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
  }, []);

  const close = useCallback(() => {
    setShown(false);
    setTimeout(() => setActive(null), 260); // matches the CSS transition duration
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // lock scroll while zoomed
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [active, close]);

  return (
    <section style={{ ...L.section, backgroundColor: '#fff', borderTop: '1px solid #eee', borderBottom: '1px solid #eee' }}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div style={L.container}>
        <h2 style={L.sectionTitle}>A quick run through of an event</h2>
        <p style={L.sectionSub}>From sign-up to the final scorecard — here&apos;s what your tournament looks like, start to finish. Click any screenshot to zoom in.</p>
        <div className="gfp-step-grid">
          {steps.map((s, i) => (
            <div key={s.phase} style={L.step}>
              {s.shot ? (
                <button
                  type="button"
                  className="gfp-shot-btn"
                  onClick={() => open(s.shot!, `${s.title} — ${s.phase}`)}
                  aria-label={`Enlarge the ${s.title} screenshot`}
                  style={shotBtn}
                >
                  <img src={s.shot} alt={`${s.title} — ${s.phase}`} style={L.stepShot} />
                  <span className="gfp-shot-zoom" style={zoomHint} aria-hidden>🔍</span>
                </button>
              ) : (
                <div style={L.stepShotPlaceholder}>
                  <span style={{ fontSize: '1.6rem', fontWeight: 900 }}>{i + 1}</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, opacity: 0.75 }}>Screenshot: {s.phase}</span>
                </div>
              )}
              <div style={L.stepBody}>
                <span style={L.stepBadge}>{s.phase}</span>
                <div style={L.stepTitle}>{s.title}</div>
                <div style={L.stepDesc}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {active && (
        <div
          className="gfp-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={active.alt}
          onClick={close}
          style={{ ...overlay, opacity: shown ? 1 : 0 }}
        >
          <img
            src={active.src}
            alt={active.alt}
            onClick={(e) => { e.stopPropagation(); close(); }}
            style={{ ...lightboxImg, opacity: shown ? 1 : 0, transform: shown ? 'scale(1)' : 'scale(0.85)' }}
          />
          <button className="gfp-lightbox-close" onClick={close} aria-label="Close" style={closeBtn}>✕</button>
        </div>
      )}
    </section>
  );
}

const shotBtn: React.CSSProperties = {
  display: 'block', width: '100%', padding: 0, border: 'none', background: 'transparent',
  cursor: 'zoom-in', position: 'relative', overflow: 'hidden',
};
const zoomHint: React.CSSProperties = {
  position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 999,
  background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 14,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  opacity: 0, transition: 'opacity 0.18s ease',
};
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 200, backgroundColor: 'rgba(0,0,0,0.82)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4vh 4vw',
  cursor: 'zoom-out', transition: 'opacity 0.25s ease',
};
const lightboxImg: React.CSSProperties = {
  maxWidth: '92vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: 12,
  boxShadow: '0 12px 48px rgba(0,0,0,0.5)', cursor: 'zoom-out',
  transition: 'transform 0.26s cubic-bezier(0.34, 1.4, 0.64, 1), opacity 0.26s ease',
};
const closeBtn: React.CSSProperties = {
  position: 'fixed', top: 16, right: 20, width: 42, height: 42, borderRadius: 999,
  background: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)',
  fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const css = `
.gfp-shot-btn img { transition: transform 0.28s ease; }
.gfp-shot-btn:hover img { transform: scale(1.04); }
.gfp-shot-btn:hover .gfp-shot-zoom { opacity: 1; }
.gfp-shot-btn:focus-visible { outline: 3px solid var(--color-action); outline-offset: 2px; }
.gfp-lightbox-close:hover { background: rgba(255,255,255,0.28); }
`;
