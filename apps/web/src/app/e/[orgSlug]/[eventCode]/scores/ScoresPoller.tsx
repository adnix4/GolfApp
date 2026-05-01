'use client';

import { useState, useEffect, useRef } from 'react';
import type { PublicEventData, PublicLeaderboard, PublicLeaderboardEntry } from '@/lib/api';

const POLL_MS = 15_000;
const BASE    = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

async function pollLeaderboard(eventCode: string): Promise<PublicLeaderboard | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/pub/events/${eventCode}/leaderboard`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
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
  const [leaderboard, setLeaderboard] = useState(initialLeaderboard);
  const [lastUpdated, setLastUpdated] = useState(() => new Date());
  const [secondsAgo,  setSecondsAgo]  = useState(0);
  const [fetchError,  setFetchError]  = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // 15 s leaderboard poll
  useEffect(() => {
    const poll = async () => {
      const data = await pollLeaderboard(eventCode);
      if (data) {
        setLeaderboard(data);
        setLastUpdated(new Date());
        setSecondsAgo(0);
        setFetchError(false);
      } else {
        setFetchError(true);
      }
    };
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [eventCode]);

  // 1 s "Updated Xs ago" ticker — resets whenever lastUpdated changes
  useEffect(() => {
    setSecondsAgo(0);
    const id = setInterval(() => setSecondsAgo(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  // TV mode — auto-scroll table when content overflows, loop with pause
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

  // Countdown bar: shrinks from 100% → 0% over POLL_MS
  const countdownPct = Math.max(0, 100 - (secondsAgo / (POLL_MS / 1000)) * 100);

  const st = tvMode ? tv : nm;

  return (
    <>
      <style>{cssKeyframes}</style>
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
                  Live
                </span>
              )}
            </div>
          </div>
        </header>

        {/* ── COUNTDOWN BAR (TV only) ── */}
        {tvMode && (
          <div style={tv.countdownTrack}>
            <div style={{ ...tv.countdownFill, width: `${countdownPct}%` }} />
          </div>
        )}

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
                    <Row key={i} entry={entry} index={i} tvMode={tvMode} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>

        {/* ── FOOTER (normal mode only) ── */}
        {!tvMode && (
          <footer style={nm.footer}>
            <div style={nm.footerInner}>
              <span style={fetchError ? nm.footerError : nm.footerMeta}>
                {fetchError
                  ? 'Connection issue — retrying…'
                  : `Updated ${secondsAgo}s ago · Auto-refreshes every ${POLL_MS / 1000}s`}
              </span>
              <a href={`/e/${event.orgSlug}/${eventCode}`} style={nm.backLink}>
                ← Event page
              </a>
            </div>
          </footer>
        )}

        {/* ── TV STATUS BAR ── */}
        {tvMode && (
          <div style={tv.statusBar}>
            {fetchError
              ? <span style={tv.statusError}>Connection issue — retrying…</span>
              : <span style={tv.statusMeta}>Updated {secondsAgo}s ago</span>}
          </div>
        )}

      </div>
    </>
  );
}

// ── ROW ───────────────────────────────────────────────────────────────────────

function Row({
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
    const isEven = index % 2 === 0;
    return (
      <tr style={{ backgroundColor: isEven ? '#161b22' : '#1c2128', borderBottom: '1px solid #30363d' }}>
        <td style={{ ...tv.td, textAlign: 'center', color: '#8b949e' }}>{entry.rank}</td>
        <td style={{ ...tv.td, fontWeight: 700 }}>{entry.teamName}</td>
        <td style={{ ...tv.td, textAlign: 'right', fontWeight: 900, fontSize: '1.3rem', color: toParColor }}>
          {toParLabel}
        </td>
        <td style={{ ...tv.td, textAlign: 'right', color: '#8b949e' }}>{entry.grossTotal || '—'}</td>
        <td style={{ ...tv.td, textAlign: 'right', color: '#8b949e' }}>{thru}</td>
      </tr>
    );
  }

  const isEven = index % 2 === 0;
  return (
    <tr style={{ backgroundColor: isEven ? '#fff' : '#f9fafb', borderBottom: '1px solid #eee' }}>
      <td style={{ ...nm.td, textAlign: 'center', fontWeight: 700, color: '#555' }}>{entry.rank}</td>
      <td style={{ ...nm.td, fontWeight: 600 }}>{entry.teamName}</td>
      <td style={{ ...nm.td, textAlign: 'right', fontWeight: 800, fontSize: '1.05rem', color: toParColor }}>
        {toParLabel}
      </td>
      <td style={{ ...nm.td, textAlign: 'right', color: '#555' }}>{entry.grossTotal || '—'}</td>
      <td style={{ ...nm.td, textAlign: 'right', color: '#888' }}>{thru}</td>
    </tr>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const cssKeyframes = `
  @keyframes gfp-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.25; }
  }
`;

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

  countdownTrack: { height: 4, backgroundColor: '#21262d' },
  countdownFill:  { height: '100%', backgroundColor: '#2ea043', transition: 'width 1s linear' },

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
} as const;
