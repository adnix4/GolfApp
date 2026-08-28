'use client';

/**
 * useLiveLeaderboard — SignalR-with-polling-fallback hook for the GFP
 * TournamentHub leaderboard stream.
 *
 * Replaces the ~250 lines of nearly-identical SignalR + polling code that
 * lived in both apps/mobile/app/(scoring)/leaderboard.tsx and
 * apps/web/.../scores/ScoresPoller.tsx.
 *
 * Behavior:
 * - On mount, opens a hub at `${baseUrl}/hubs/tournament` and JoinEvent(eventCode).
 * - Listens for 'LeaderboardRefreshed' { standings } and 'HoleInOneAlert'.
 * - Tracks connection state via onreconnecting/onreconnected/onclose.
 * - Runs an HTTP poll fallback (default 15s) whenever the hub is disconnected.
 *   The initial HTTP fetch runs unconditionally so first paint isn't blocked
 *   on SignalR negotiation.
 * - `disabled` short-circuits both transports (used for offline-mode events).
 *
 * Consumers own the rendering. The hook only manages transport + state.
 *
 * The `'use client'` directive at the top of this file is required for
 * Next.js: the @gfp/shared-types barrel re-exports this module, and without
 * the directive the bundler would refuse to import the barrel from any
 * server component (e.g. apps/web/.../page.tsx → EventSidebar → formatCents).
 * The directive is a no-op in non-Next.js consumers (RN/Expo).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import { AUCTION_HUB_EVENTS, silenceUnhandledHubEvents } from './tournamentHubEvents';

export interface HoleInOneAlert {
  teamName:   string;
  playerName: string;
  holeNumber: number;
}

export interface UseLiveLeaderboardOptions<TStanding> {
  /** Base URL of the API, no trailing slash. */
  baseUrl: string;
  /** Event code to join. When undefined, the hook stays idle. */
  eventCode: string | undefined;
  /** Disable both transports (e.g. offline-mode events on mobile). */
  disabled?: boolean;
  /** Initial standings — pass SSR-loaded data so first paint is hydrated. */
  initialStandings?: TStanding[] | null;
  /** Polling interval in ms when SignalR is disconnected. Default 15_000. */
  pollIntervalMs?: number;
  /**
   * Fetch fresh standings over HTTP. Return null when the call fails so the
   * hook can flag an error state without forcing the caller to throw.
   */
  fetchStandings: (eventCode: string) => Promise<TStanding[] | null>;
  /**
   * Called when the hub emits 'SponsorsChanged' with the event's new
   * SponsorsVersion. Lets a consumer refetch the sponsor list only when it
   * actually changed, reusing this hook's existing SignalR connection instead
   * of opening a second socket. No-op when omitted.
   */
  onSponsorsChanged?: (version: number) => void;
  /**
   * Called when the hub emits any auction-mutating broadcast (a bid, a pledge,
   * an item closing or extending, the live lot advancing). Same reasoning as
   * onSponsorsChanged: the scoreboard is the busiest public page there is, and
   * opening a second socket per viewer just to keep an auction ticker current
   * would double the connection count for a decorative strip.
   *
   * Deliberately carries no payload — bid broadcasts only ever contained
   * partial data, and under proxy bidding the submitted amount is private. This
   * is an invalidation signal; refetch the public snapshot. Fires once per
   * broadcast, so debounce if a burst matters to you.
   */
  onAuctionChanged?: () => void;
}

export interface UseLiveLeaderboardResult<TStanding> {
  /** Latest standings, or null before first successful load. */
  standings: TStanding[] | null;
  /** True until the first standings update lands (HTTP or SignalR). */
  loading: boolean;
  /** True while a SignalR connection is established. */
  connected: boolean;
  /** True when the last HTTP poll failed and we have no live socket. */
  error: boolean;
  /** Timestamp of the most recent successful update. */
  lastUpdated: Date | null;
  /** Active hole-in-one announcement, if any. */
  hioAlert: HoleInOneAlert | null;
  /** Manually clear the current HIO alert (e.g. user tapped the dismiss button). */
  dismissHioAlert: () => void;
  /** Force an immediate HTTP fetch. */
  refresh: () => void;
}

const DEFAULT_POLL_MS = 15_000;

export function useLiveLeaderboard<TStanding>(
  opts: UseLiveLeaderboardOptions<TStanding>,
): UseLiveLeaderboardResult<TStanding> {
  const {
    baseUrl, eventCode, disabled = false,
    initialStandings = null,
    pollIntervalMs = DEFAULT_POLL_MS,
    fetchStandings,
    onSponsorsChanged,
    onAuctionChanged,
  } = opts;

  const [standings, setStandings]     = useState<TStanding[] | null>(initialStandings);
  const [loading, setLoading]         = useState(initialStandings === null);
  const [connected, setConnected]     = useState(false);
  const [error, setError]             = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(
    initialStandings !== null ? new Date() : null,
  );
  const [hioAlert, setHioAlert]       = useState<HoleInOneAlert | null>(null);

  // Keep the fetcher in a ref so the SignalR effect doesn't re-run when the
  // caller passes a new closure on every render.
  const fetchRef = useRef(fetchStandings);
  useEffect(() => { fetchRef.current = fetchStandings; }, [fetchStandings]);

  // Keep the sponsors-changed callback in a ref too, so passing a fresh closure
  // each render doesn't tear down and rebuild the SignalR connection below.
  const sponsorsChangedRef = useRef(onSponsorsChanged);
  useEffect(() => { sponsorsChangedRef.current = onSponsorsChanged; }, [onSponsorsChanged]);

  const auctionChangedRef = useRef(onAuctionChanged);
  useEffect(() => { auctionChangedRef.current = onAuctionChanged; }, [onAuctionChanged]);

  const refresh = useCallback(() => {
    if (!eventCode || disabled) return;
    fetchRef.current(eventCode)
      .then(fresh => {
        if (fresh) {
          setStandings(fresh);
          setLastUpdated(new Date());
          setError(false);
          setLoading(false);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true));
  }, [eventCode, disabled]);

  const dismissHioAlert = useCallback(() => setHioAlert(null), []);

  // ── SignalR primary transport ───────────────────────────────────────────────
  useEffect(() => {
    if (!eventCode || disabled) return;

    const hub = new signalR.HubConnectionBuilder()
      .withUrl(`${baseUrl}/hubs/tournament`)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    hub.on('LeaderboardRefreshed', (payload: { standings?: TStanding[] }) => {
      if (!payload?.standings) return;
      setStandings(payload.standings);
      setLastUpdated(new Date());
      setError(false);
      setLoading(false);
    });

    hub.on('HoleInOneAlert', (alert: HoleInOneAlert) => setHioAlert(alert));

    hub.on('SponsorsChanged', (payload: { version?: number }) => {
      sponsorsChangedRef.current?.(payload?.version ?? 0);
    });

    // Every auction broadcast collapses to the same "something moved" signal.
    // Registered unconditionally: reading the ref here to decide would freeze
    // the decision at mount, and these handlers are a no-op when no consumer
    // asked for them — the same thing silenceUnhandledHubEvents would install.
    for (const evt of AUCTION_HUB_EVENTS) {
      hub.on(evt, () => { auctionChangedRef.current?.(); });
    }

    // The server also broadcasts ScoreUpdated (per hole) and the check-in events
    // to this same group; this screen only consumes the coalesced
    // LeaderboardRefreshed, so no-op the rest to avoid SignalR "no client method
    // found" warnings on every score.
    silenceUnhandledHubEvents(hub, [
      'LeaderboardRefreshed', 'HoleInOneAlert', 'SponsorsChanged', ...AUCTION_HUB_EVENTS,
    ]);

    hub.onreconnecting(() => setConnected(false));
    hub.onreconnected(() => {
      setConnected(true);
      hub.invoke('JoinEvent', eventCode).catch(() => {});
    });
    hub.onclose(() => setConnected(false));

    const started = hub.start()
      .then(() => {
        setConnected(true);
        return hub.invoke('JoinEvent', eventCode).catch(() => {});
      })
      .catch(() => setConnected(false));

    return () => {
      // Wait for start() to settle before tearing down. React StrictMode (dev)
      // mounts -> unmounts -> remounts, and stopping a connection that is still
      // negotiating makes SignalR log "The connection was stopped during
      // negotiation" at error level — indistinguishable in the console from a
      // real negotiation failure. `started` never rejects (both paths are
      // handled above), so this always runs.
      started.then(() => hub.stop().catch(() => {}));
    };
  }, [baseUrl, eventCode, disabled]);

  // ── HTTP fallback ──────────────────────────────────────────────────────────
  // Initial fetch fires unconditionally so first paint isn't blocked on the
  // SignalR negotiation handshake. The recurring poll only runs while the
  // hub is disconnected.
  useEffect(() => {
    if (!eventCode || disabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function tick() {
      try {
        const fresh = await fetchRef.current(eventCode!);
        if (cancelled) return;
        if (fresh) {
          setStandings(fresh);
          setLastUpdated(new Date());
          setError(false);
          setLoading(false);
        } else {
          setError(true);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }

    tick();
    const id = setInterval(() => { if (!connected) tick(); }, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [eventCode, disabled, connected, pollIntervalMs]);

  return {
    standings,
    loading,
    connected,
    error,
    lastUpdated,
    hioAlert,
    dismissHioAlert,
    refresh,
  };
}
