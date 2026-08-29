'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveLeaderboard } from '@gfp/shared-types';
import type {
  PublicAuctionItem, PublicEventData, PublicLeaderboard, PublicLeaderboardEntry,
} from '@/lib/api';
import { fetchPublicAuctionItems, fetchPublicEventFresh } from '@/lib/api';
import {
  buildThemeCss, buildTvThemeCss, cssKeyframes, hio, nm, tv,
} from './scoresPollerStyles';
import { ScoresRow } from './ScoresRow';
import EventTicker from './EventTicker';
import UpdatedAgo from './UpdatedAgo';

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
  initialAuctionItems,
  eventCode,
  tvMode = false,
}: {
  event:               PublicEventData;
  initialLeaderboard:  PublicLeaderboard | null;
  initialAuctionItems: PublicAuctionItem[];
  eventCode:           string;
  tvMode?:             boolean;
}) {
  // Live sponsor list — seeded from SSR, refreshed when the event's
  // SponsorsVersion bumps (via the SponsorsChanged signal, or the poll
  // fallback while the socket is down) so a sponsor added mid-event appears
  // on the board without a page reload.
  const [sponsors, setSponsors]     = useState(event.sponsors);
  const sponsorsVersionRef          = useRef(event.sponsorsVersion);

  const refreshSponsors = useCallback(async () => {
    const fresh = await fetchPublicEventFresh(eventCode);
    if (!fresh || fresh.sponsorsVersion === sponsorsVersionRef.current) return;
    sponsorsVersionRef.current = fresh.sponsorsVersion;
    setSponsors(fresh.sponsors);
  }, [eventCode]);

  // Open auction lots for the ticker. Unlike sponsors there's no version
  // counter to compare against, so every signal costs a refetch — hence the
  // debounce: one bid emits BidPlaced and can emit AuctionExtended with it.
  const [auctionItems, setAuctionItems] = useState(initialAuctionItems);
  const auctionDebounceRef              = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshAuction = useCallback(async () => {
    setAuctionItems(await fetchPublicAuctionItems(event.id));
  }, [event.id]);

  const scheduleAuctionRefresh = useCallback(() => {
    if (auctionDebounceRef.current) clearTimeout(auctionDebounceRef.current);
    auctionDebounceRef.current = setTimeout(refreshAuction, 400);
  }, [refreshAuction]);

  useEffect(() => () => {
    if (auctionDebounceRef.current) clearTimeout(auctionDebounceRef.current);
  }, []);

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
    // Signal carries the new version; refetch only when it's ahead of ours.
    onSponsorsChanged: (version) => {
      if (version !== sponsorsVersionRef.current) refreshSponsors();
    },
    // Reuses this hook's socket rather than opening a second one for the ticker.
    onAuctionChanged: scheduleAuctionRefresh,
  });

  // Poll fallback: while the hub is disconnected, check for a sponsor or
  // auction change on the same cadence as the standings fallback. No-op while
  // connected — the SponsorsChanged / auction signals cover that case.
  useEffect(() => {
    if (connected) return;
    const id = setInterval(() => { refreshSponsors(); refreshAuction(); }, FALLBACK_POLL_MS);
    return () => clearInterval(id);
  }, [connected, refreshSponsors, refreshAuction]);

  const tableRef = useRef<HTMLDivElement>(null);

  // Reconstruct the leaderboard object the rest of the page expects — keep
  // the SSR metadata (eventId/eventName/status) and swap in fresh standings.
  const leaderboard: PublicLeaderboard | null = liveStandings === null
    ? initialLeaderboard
    : initialLeaderboard
      ? { ...initialLeaderboard, standings: liveStandings }
      : null;

  // Auto-dismiss the HIO banner after 30s. Mobile dismisses after 5s in its
  // own overlay; this lets each surface tune the dwell time.
  useEffect(() => {
    if (!hioAlert) return;
    const id = setTimeout(dismissHioAlert, 30_000);
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
  const eventUrl    = `/e/${event.orgSlug}/${eventCode}`;

  const st = tvMode ? tv : nm;
  // Brand tokens for both modes; the derived dark-board palette only for TV,
  // where the brand has to survive being placed on a near-black surface.
  const themeCss = [
    buildThemeCss(event.resolvedThemeJson),
    tvMode ? buildTvThemeCss(event.resolvedThemeJson) : '',
  ].filter(Boolean).join(';');

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
            <div style={st.headerLeft}>
              {/* Always-visible way back. TV mode previously had none at all,
                  and in normal mode the only link sat below the whole table. */}
              <a href={eventUrl} style={st.backBtn} aria-label="Back to event page">
                ← Event
              </a>
              {/* TV only: the normal-mode header is a narrow strip above a
                  scrollable page, and the event page one screen away already
                  leads with the logo. A board left running on a screen has no
                  such context — it has to identify itself. */}
              {tvMode && event.resolvedLogoUrl && (
                <img src={event.resolvedLogoUrl} alt="" style={tv.logo} />
              )}
              <div>
                <p style={st.orgName}>{event.orgName}</p>
                <h1 style={st.eventName}>{event.name}</h1>
              </div>
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

        {/* ── SPONSOR + AUCTION TICKER (top, under the header) ── */}
        <EventTicker sponsors={sponsors} auctionItems={auctionItems} tvMode={tvMode} />


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
                    <th style={{ ...st.th, width: 70, textAlign: 'right' }}>Back</th>
                    <th style={{ ...st.th, width: 70, textAlign: 'right' }}>Best Hole</th>
                    <th style={{ ...st.th, width: 70, textAlign: 'right' }}>Best Score</th>
                    <th style={{ ...st.th, width: 80, textAlign: 'right' }}>Gross</th>
                    <th style={{ ...st.th, width: 70, textAlign: 'right' }}>Thru</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((entry, i) => (
                    <ScoresRow key={entry.teamId} entry={entry} index={i} tvMode={tvMode} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>

        {/* ── FOOTER (normal mode) ── */}
        {/* The back link moved into the header; the footer keeps the freshness
            meta so "Updated Ns ago" still sits under the board. */}
        {!tvMode && (
          <footer style={nm.footer}>
            <div style={nm.footerInner}>
              <UpdatedAgo
                lastUpdated={lastUpdated}
                connected={connected}
                fetchError={fetchError}
                tvMode={false}
              />
            </div>
          </footer>
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
