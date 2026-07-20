'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// ── DEVICE-AWARE JOIN HAND-OFF ────────────────────────────────────────────────
// Web-first: registration (names + entry fee payment) lives on the event page
// and works in any browser, so that's the default everywhere. The scorer app's
// value is on event day, and it's promoted post-registration — not as a
// gatekeeper in front of it.
//   • Desktop — forward straight to the web registration section.
//   • iOS / Android — primary "Continue to registration" (web), plus a
//     secondary "already have the app?" button that fires the GFP Scorer deep
//     link (gfp://join?preEventId=…) for returning players. No automatic
//     deep-link attempt: for golfers without the app that's a guaranteed
//     dead-end pause, and they're the majority.
// Detection is client-side (user agent) — the email's Register button and the
// registration QR both land here, from any device.

interface SmartJoinProps {
  orgSlug:   string;
  eventCode: string;
  eventId:   string;
  eventName: string;
  orgName:   string;
  logoUrl:   string | null;
}

type Device = 'ios' | 'android' | 'desktop';

function detectDevice(): Device {
  const ua = navigator.userAgent;
  // iPadOS 13+ masquerades as macOS but is still a touch device.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

// Store listings — unset until the app is published (see .env.example).
const IOS_STORE_URL     = process.env.NEXT_PUBLIC_IOS_APP_URL     ?? '';
const ANDROID_STORE_URL = process.env.NEXT_PUBLIC_ANDROID_APP_URL ?? '';

export default function SmartJoin({
  orgSlug, eventCode, eventId, eventName, orgName, logoUrl,
}: SmartJoinProps) {
  const router = useRouter();
  const [device,        setDevice]        = useState<Device | null>(null);
  const [appNotOpened,  setAppNotOpened]  = useState(false);
  const appOpened = useRef(false);

  const deepLink = `gfp://join?preEventId=${encodeURIComponent(eventId)}`;
  const eventPageUrl = `/e/${orgSlug}/${eventCode}#register`;

  function tryOpenApp() {
    setAppNotOpened(false);
    window.location.href = deepLink;
    // If the app takes over, the page is hidden/backgrounded and the timer's
    // check sees it; if nothing handled the scheme, say so and point back to web.
    window.setTimeout(() => {
      if (!document.hidden && !appOpened.current) setAppNotOpened(true);
    }, 1800);
  }

  useEffect(() => {
    const onHide = () => { appOpened.current = true; };
    document.addEventListener('visibilitychange', onHide);

    const d = detectDevice();
    setDevice(d);
    if (d === 'desktop') {
      router.replace(eventPageUrl); // registration lives on the event page
    }
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []); // mount-only by design: detect once, hand off once

  const storeUrl = device === 'ios' ? IOS_STORE_URL : device === 'android' ? ANDROID_STORE_URL : '';

  return (
    <main style={s.page}>
      <div style={s.card}>
        {logoUrl && <img src={logoUrl} alt={orgName} style={s.logo} />}
        <p style={s.eyebrow}>{orgName}</p>
        <h1 style={s.title}>{eventName}</h1>

        {device === 'desktop' || device === null ? (
          <>
            <p style={s.status}>Taking you to registration…</p>
            <a href={eventPageUrl} style={s.linkBtn}>Continue to the event page →</a>
          </>
        ) : (
          <>
            <p style={s.status}>Register right here in your browser — it only takes a minute.</p>
            <div style={s.btnCol}>
              <a href={eventPageUrl} style={s.primaryBtn}>Continue to registration →</a>
              <button onClick={tryOpenApp} style={s.outlineBtn}>
                Already have the GFP Scorer app? Open it
              </button>
              {appNotOpened && (
                storeUrl ? (
                  <a href={storeUrl} style={s.outlineBtn}>
                    {device === 'ios' ? 'Get it on the App Store' : 'Get it on Google Play'}
                  </a>
                ) : (
                  <p style={s.note}>
                    The app didn&apos;t open — no problem, registering in the browser works just as well.
                  </p>
                )
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '1.5rem', backgroundColor: '#f4f5f3',
  },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: '2.25rem 1.75rem',
    width: '100%', maxWidth: 420, textAlign: 'center',
    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
  },
  logo:    { height: 64, objectFit: 'contain', marginBottom: '1rem' },
  eyebrow: { fontSize: '0.75rem', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#888', margin: '0 0 0.375rem' },
  title:   { fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-primary, #1a1a2e)', margin: '0 0 1rem', lineHeight: 1.25 },
  status:  { fontSize: '0.95rem', color: '#4b5563', lineHeight: 1.5, margin: '0 0 1.25rem' },

  btnCol: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  primaryBtn: {
    padding: '0.85rem 1.25rem', borderRadius: 10, border: 'none', cursor: 'pointer',
    backgroundColor: 'var(--color-primary, #1a1a2e)', color: 'var(--color-on-primary, #fff)',
    fontSize: '1rem', fontWeight: 700, display: 'block', textDecoration: 'none',
  },
  outlineBtn: {
    padding: '0.85rem 1.25rem', borderRadius: 10, cursor: 'pointer', display: 'block',
    border: '2px solid var(--color-primary, #1a1a2e)', color: 'var(--color-primary, #1a1a2e)',
    fontSize: '0.95rem', fontWeight: 700, textDecoration: 'none', backgroundColor: 'transparent',
  },
  linkBtn: {
    display: 'inline-block', fontSize: '0.95rem', fontWeight: 700,
    color: 'var(--color-primary, #1a1a2e)', textDecoration: 'none',
  },
  note: { fontSize: '0.8rem', color: '#888', margin: 0 },
};
