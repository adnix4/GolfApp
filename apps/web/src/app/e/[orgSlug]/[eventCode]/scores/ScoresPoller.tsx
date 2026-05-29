'use client';

import { memo, useState, useEffect, useRef } from 'react';
import { useLiveLeaderboard } from '@gfp/shared-types';
import type { PublicEventData, PublicLeaderboard, PublicLeaderboardEntry } from '@/lib/api';

const FALLBACK_POLL_MS = 15_000; // spec: 15-second SSE/HTTP fallback when WebSocket unavailable
const BASE             = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

async function fetchStandings(eventCode: string): Promise<PublicLeaderboardEntry[] | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/pub/events/${eventCode}/leaderboard`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data: PublicLeaderboard = await res.json();
    return data.standings;
  } catch {
    return null;
  }
}

// ── COMPONENT ─────────────────────────────────────────────────────────────────

export default function ScoresPoller({
  event,
  initialLeaderboard,
  eventCode,
  tvMode = false,
}: {
  event:              PublicEventData;
  initialLeaderboard: PublicLeaderboard | null;
  eventCode:          string;
  tvMode?:            boolean;
}) {
  const {
    standings: liveStandings,
    connected,
    error: fetchError,
    lastUpdated,
    hioAlert,
    dismissHioAlert,
  } = useLiveLeaderboard<PublicLeaderboardEntry>({
    baseUrl:          BASE,
    eventCode,
    initialStandings: initialLeaderboard?.standings ?? null,
    pollIntervalMs:   FALLBACK_POLL_MS,
    fetchStandings,
  });

  const tableRef = useRef<HTMLDivElement>(null);

  // Reconstruct the leaderboard object the rest of the page expects — keep
  // the SSR metadata (eventId/eventName/status) and swap in fresh standings.
  const leaderboard: PublicLeaderboard | null = liveStandings === null
    ? initialLeaderboard
    : initialLeaderboard
      ? { ...initialLeaderboard, standings: liveStandings }
      : null;

  // Auto-dismiss the HIO banner after 60s. Mobile dismisses after 10s in its
  // own overlay; this lets each surface tune the dwell time.
  useEffect(() => {
    if (!hioAlert) return;
    const id = setTimeout(dismissHioAlert, 60_000);
    return () => clearTimeout(id);
  }, [hioAlert, dismissHioAlert]);

  // ── TV mode auto-scroll ────────────────────────────────────────────────────
  useEffect(() => {
    if (!tvMode) return;
    let frameId: number;
    let paused    = false;
    let pauseTimer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const el = tableRef.current;
      if (el && !paused && el.scrollHeight > el.clientHeight) {
        el.scrollTop += 0.5;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
          paused = true;
          pauseTimer = setTimeout(() => {
            if (tableRef.current) tableRef.current.scrollTop = 0;
            paused = false;
          }, 4000);
        }
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(pauseTimer);
    };
  }, [tvMode]);

  const isLive      = ['active', 'scoring'].includes(event.status);
  const isCompleted = event.status === 'completed';
  const standings   = leaderboard?.standings ?? [];

  const st = tvMode ? tv : nm;
  const themeCss = buildThemeCss(event.resolvedThemeJson);

  return (
    <>
      <style>{cssKeyframes + (themeCss ? `\n:root{${themeCss}}` : '')}</style>

      {/* ── HOLE-IN-ONE BANNER ── */}
      {hioAlert && (
        <div style={hio.banner}>
          <span style={hio.flag}>⛳</span>
          <div style={hio.textBlock}>
            <span style={hio.label}>Hole in One!</span>
            <span style={hio.text}>
              {hioAlert.playerName} — Hole {hioAlert.holeNumber} · {hioAlert.teamName}
            </span>
          </div>
          <button style={hio.close} onClick={dismissHioAlert}>✕</button>
        </div>
      )}

      <div style={st.page}>

        {/* ── HEADER ── */}
        <header style={st.header}>
          <div style={st.headerInner}>
            <div>
              <p style={st.orgName}>{event.orgName}</p>
              <h1 style={st.eventName}>{event.name}</h1>
            </div>
            <div style={st.badges}>
              {isCompleted && <span style={st.finalBadge}>Final</span>}
              {isLive && (
                <span style={st.liveBadge}>
                  <span style={st.liveDot} />
                  {connected ? 'Live' : 'Live ↻'}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* ── TABLE ── */}
        <main style={st.main}>
          {standings.length === 0 ? (
            <div style={st.empty}>
              <p style={st.emptyIcon}>🏆</p>
              <p style={st.emptyText}>No scores submitted yet.</p>
            </div>
          ) : (
            <div ref={tableRef} style={st.tableWrap}>
              <table style={st.table}>
                <thead>
                  <tr>
                    <th style={{ ...st.th, width: 48, textAlign: 'center' }}>#</th>
                    <th style={{ ...st.th, textAlign: 'left' }}>Team</th>
                    <th style={{ ...st.th, width: 90, textAlign: 'right' }}>To Par</th>
                    <th style={{ ...st.th, width: 80, textAlign: 'right' }}>Gross</th>
                    <th style={{ ...st.th, width: 70, textAlign: 'right' }}>Thru</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((entry, i) => (
                    <Row key={entry.teamId} entry={entry} index={i} tvMode={tvMode} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>

        {/* ── FOOTER (normal mode) ── */}
        {!tvMode && (
          <footer style={nm.footer}>
            <div style={nm.footerInner}>
              <UpdatedAgo
                lastUpdated={lastUpdated}
                connected={connected}
                fetchError={fetchError}
                tvMode={false}
              />
              <a href={`/e/${event.orgSlug}/${eventCode}`} style={nm.backLink}>
                ← Event page
              </a>
            </div>
          </footer>
        )}

        {/* ── TV SPONSOR TICKER ── */}
        {tvMode && event.sponsors.length > 0 && (
          <SponsorTicker sponsors={event.sponsors} />
        )}

        {/* ── TV STATUS BAR ── */}
        {tvMode && (
          <div style={tv.statusBar}>
            <UpdatedAgo
              lastUpdated={lastUpdated}
              connected={connected}
              fetchError={fetchError}
              tvMode={true}
            />
          </div>
        )}

      </div>
    </>
  );
}

// ── UPDATED-AGO TICKER ───────────────────────────────────────────────────────
// Isolated so its 1 s tick re-renders only this span. Keeping it in the parent
// re-rendered the standings table every second — on TV mode with 50+ teams
// that was the dominant CPU cost on the page.

function UpdatedAgo({
  lastUpdated, connected, fetchError, tvMode,
}: {
  lastUpdated: Date | null;
  connected:   boolean;
  fetchError:  boolean;
  tvMode:      boolean;
}) {
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    setSecondsAgo(0);
    const id = setInterval(() => setSecondsAgo(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  if (fetchError) {
    return (
      <span style={tvMode ? tv.statusError : nm.footerError}>
        Connection issue — retrying…
      </span>
    );
  }

  if (!lastUpdated) {
    return <span style={tvMode ? tv.statusMeta : nm.footerMeta}>Loading…</span>;
  }

  const text = tvMode
    ? (connected ? `Live · Updated ${secondsAgo}s ago` : `Updated ${secondsAgo}s ago`)
    : (connected
        ? `Live · Updated ${secondsAgo}s ago`
        : `Updated ${secondsAgo}s ago · polling every ${FALLBACK_POLL_MS / 1000}s`);

  return <span style={tvMode ? tv.statusMeta : nm.footerMeta}>{text}</span>;
}

// ── SPONSOR TICKER (TV mode only) ────────────────────────────────────────────

const TICKER_INTERVAL_MS = 5_000;

function SponsorTicker({ sponsors }: { sponsors: PublicEventData['sponsors'] }) {
  const [idx,     setIdx]     = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (sponsors.length < 2) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % sponsors.length);
        setVisible(true);
      }, 400);
    }, TICKER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [sponsors.length]);

  const sp = sponsors[idx];
  if (!sp) return null;

  return (
    <div style={tv.ticker}>
      <span style={tv.tickerLabel}>SPONSORED BY</span>
      <div style={{ ...tv.tickerContent, opacity: visible ? 1 : 0, transition: 'opacity 0.35s ease' }}>
        {sp.logoUrl && (
          <img
            src={sp.logoUrl}
            alt={sp.name}
            style={tv.tickerLogo}
          />
        )}
        <span style={tv.tickerName}>{sp.name}</span>
        {sp.tagline && <span style={tv.tickerTagline}>— {sp.tagline}</span>}
      </div>
    </div>
  );
}

// ── ROW ───────────────────────────────────────────────────────────────────────
// Memoized with a custom equality check on the fields actually rendered.
// SignalR broadcasts send a fresh standings array per tick, so default
// referential equality wouldn't help — but the per-team fields rarely change,
// so most rows skip render entirely after a single team scores.

const rowEqual = (
  a: { entry: PublicLeaderboardEntry; index: number; tvMode: boolean },
  b: { entry: PublicLeaderboardEntry; index: number; tvMode: boolean },
) =>
  a.tvMode             === b.tvMode &&
  a.index              === b.index &&
  a.entry.rank         === b.entry.rank &&
  a.entry.teamName     === b.entry.teamName &&
  a.entry.toPar        === b.entry.toPar &&
  a.entry.grossTotal   === b.entry.grossTotal &&
  a.entry.holesComplete === b.entry.holesComplete &&
  a.entry.isComplete   === b.entry.isComplete;

const Row = memo(function Row({
  entry, index, tvMode,
}: {
  entry:  PublicLeaderboardEntry;
  index:  number;
  tvMode: boolean;
}) {
  const toParLabel = entry.toPar === 0 ? 'E' : entry.toPar > 0 ? `+${entry.toPar}` : `${entry.toPar}`;
  const toParColor = entry.toPar < 0
    ? (tvMode ? '#3fb950' : '#27ae60')
    : entry.toPar > 0
      ? (tvMode ? '#f85149' : '#e74c3c')
      : (tvMode ? '#e6edf3' : '#1a1a2e');
  const thru = entry.isComplete ? 'F' : String(entry.holesComplete || '—');

  if (tvMode) {
    const rowStyle = index % 2 === 0 ? tvRowStyles.even : tvRowStyles.odd;
    return (
      <tr style={rowStyle}>
        <td style={tvCellStyles.rank}>{entry.rank}</td>
        <td style={tvCellStyles.team}>{entry.teamName}</td>
        <td style={{ ...tvCellStyles.toParBase, color: toParColor }}>{toParLabel}</td>
        <td style={tvCellStyles.rightMuted}>{entry.grossTotal || '—'}</td>
        <td style={tvCellStyles.rightMuted}>{thru}</td>
      </tr>
    );
  }

  const rowStyle = index % 2 === 0 ? nmRowStyles.even : nmRowStyles.odd;
  return (
    <tr style={rowStyle}>
      <td style={nmCellStyles.rank}>{entry.rank}</td>
      <td style={nmCellStyles.team}>{entry.teamName}</td>
      <td style={{ ...nmCellStyles.toParBase, color: toParColor }}>{toParLabel}</td>
      <td style={nmCellStyles.rightMuted}>{entry.grossTotal || '—'}</td>
      <td style={nmCellStyles.rightMutedAlt}>{thru}</td>
    </tr>
  );
}, rowEqual);

// Module-level cell-style constants. Hoisting these out of the render path
// eliminates ~10 object spreads × N rows per leaderboard update.

const tvRowStyles = {
  even: { backgroundColor: '#161b22', borderBottom: '1px solid #30363d' } as const,
  odd:  { backgroundColor: '#1c2128', borderBottom: '1px solid #30363d' } as const,
};

const nmRowStyles = {
  even: { backgroundColor: '#fff',    borderBottom: '1px solid #eee' } as const,
  odd:  { backgroundColor: '#f9fafb', borderBottom: '1px solid #eee' } as const,
};

// ── CSS ───────────────────────────────────────────────────────────────────────

const cssKeyframes = `
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

// ── HOLE-IN-ONE BANNER STYLES ─────────────────────────────────────────────────

const hio = {
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

// ── NORMAL MODE STYLES ────────────────────────────────────────────────────────

const nm = {
  page:   { minHeight: '100vh', display: 'flex', flexDirection: 'column' as const, backgroundColor: '#f5f7fa' },

  header:      { backgroundColor: 'var(--color-primary)', padding: '1.25rem 1.5rem' },
  headerInner: { maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' },
  orgName:     { fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' as const, letterSpacing: 1 },
  eventName:   { fontSize: '1.4rem', fontWeight: 800, color: '#fff' },
  badges:      { display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 },
  liveBadge:   { display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#e74c3c', color: '#fff', padding: '4px 12px', borderRadius: 14, fontSize: '0.8rem', fontWeight: 700, letterSpacing: 0.5 },
  liveDot:     { width: 8, height: 8, borderRadius: '50%', backgroundColor: '#fff', animation: 'gfp-pulse 1.4s ease-in-out infinite', display: 'inline-block' },
  finalBadge:  { backgroundColor: '#27ae60', color: '#fff', padding: '4px 12px', borderRadius: 14, fontSize: '0.8rem', fontWeight: 700 },

  main:      { flex: 1, maxWidth: 960, margin: '0 auto', width: '100%', padding: '1.5rem 1rem' },

  empty:     { textAlign: 'center' as const, padding: '4rem 1rem' },
  emptyIcon: { fontSize: '3rem', marginBottom: '0.75rem' },
  emptyText: { fontSize: '1.1rem', color: 'var(--color-accent)', fontStyle: 'italic' as const },

  tableWrap: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' },
  table:     { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.95rem' },
  th:        { padding: '0.75rem 1rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase' as const, letterSpacing: 0.5, backgroundColor: 'var(--color-highlight)', borderBottom: '2px solid #e8e8e8' },
  td:        { padding: '0.75rem 1rem', color: 'var(--color-primary)' },

  footer:      { borderTop: '1px solid #e0e0e0', padding: '0.875rem 1.5rem', backgroundColor: '#fff' },
  footerInner: { maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' },
  footerMeta:  { fontSize: '0.8rem', color: 'var(--color-accent)' },
  footerError: { fontSize: '0.8rem', color: '#e74c3c', fontWeight: 600 },
  backLink:    { fontSize: '0.8rem', color: 'var(--color-action)', textDecoration: 'none', whiteSpace: 'nowrap' as const },
} as const;

// ── THEME CSS HELPER ──────────────────────────────────────────────────────────

function buildThemeCss(themeJson: string | null | undefined): string {
  if (!themeJson) return '';
  try {
    const t = JSON.parse(themeJson) as Record<string, string>;
    return Object.entries(t)
      .filter(([, v]) => /^#[0-9a-fA-F]{6}$/.test(v))
      .map(([k, v]) => `--color-${k}:${v}`)
      .join(';');
  } catch { return ''; }
}

// ── TV MODE STYLES ────────────────────────────────────────────────────────────

const tv = {
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

// ── PRE-MERGED CELL STYLES ────────────────────────────────────────────────────
// Hoisted out of Row's render so the per-row cell `style` props are stable
// references. Only the toPar cell still allocates per row (color depends on
// the team's score) — and that one merges into toParBase.

const tvCellStyles = {
  rank:        { ...tv.td, textAlign: 'center' as const, color: '#8b949e' },
  team:        { ...tv.td, fontWeight: 700 as const },
  toParBase:   { ...tv.td, textAlign: 'right' as const, fontWeight: 900 as const, fontSize: '1.3rem' },
  rightMuted:  { ...tv.td, textAlign: 'right' as const, color: '#8b949e' },
} as const;

const nmCellStyles = {
  rank:           { ...nm.td, textAlign: 'center' as const, fontWeight: 700 as const, color: '#555' },
  team:           { ...nm.td, fontWeight: 600 as const },
  toParBase:      { ...nm.td, textAlign: 'right' as const, fontWeight: 800 as const, fontSize: '1.05rem' },
  rightMuted:     { ...nm.td, textAlign: 'right' as const, color: '#555' },
  rightMutedAlt:  { ...nm.td, textAlign: 'right' as const, color: '#888' },
} as const;
