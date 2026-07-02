'use client';

/**
 * useLiveAuction — SignalR-with-polling-fallback hook for the GFP auction
 * stream, mirroring useLiveLeaderboard.
 *
 * Why signal-driven refetch (not payload patching):
 * The TournamentHub auction events carry only *partial* data — e.g. BidPlaced
 * sends the raw submitted amount, not the item's resulting currentHighBidCents
 * after increment/proxy logic, and donation totals arrive on a separate
 * AuctionTotalUpdated. Reconstructing each item's authoritative fields from
 * those partial payloads is fragile. Auction traffic is low-frequency (unlike
 * per-hole scores), so instead we treat every auction event as an invalidation
 * signal and refetch the full snapshot (items + live session) over HTTP. The
 * displayed amounts then always match server truth — the same guarantee the
 * leaderboard hook gets from its full-standings 'LeaderboardRefreshed' payload.
 *
 * Behavior:
 * - On mount, opens a hub at `${baseUrl}/hubs/tournament` and JoinEvent(eventCode).
 * - Listens for the auction-mutating events (bids, pledges, totals, called
 *   amount, item closed/extended, live session start/advance, bidder count) and
 *   schedules a coalesced refetch on any of them.
 * - Tracks connection state via onreconnecting/onreconnected/onclose.
 * - Runs an HTTP poll fallback (default 15s) whenever the hub is disconnected.
 *   The initial HTTP fetch runs unconditionally so first paint isn't blocked on
 *   SignalR negotiation.
 * - `disabled` short-circuits both transports (used for offline-mode events).
 *
 * Consumers own the rendering. The hook only manages transport + state.
 *
 * The `'use client'` directive matches useLiveLeaderboard — required so the
 * @gfp/shared-types barrel stays importable from Next.js server components. It
 * is a no-op in RN/Expo consumers.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import { silenceUnhandledHubEvents } from './tournamentHubEvents';

export interface UseLiveAuctionOptions<TData> {
  /** Base URL of the API, no trailing slash. */
  baseUrl: string;
  /** Event code to join the hub group. When undefined, the hook stays idle. */
  eventCode: string | undefined;
  /** Disable both transports (e.g. offline-mode events on mobile). */
  disabled?: boolean;
  /** Initial snapshot — pass SSR/cached data so first paint is hydrated. */
  initialData?: TData | null;
  /** Polling interval in ms when SignalR is disconnected. Default 15_000. */
  pollIntervalMs?: number;
  /**
   * Debounce window in ms for coalescing a burst of hub events (a single bid
   * can emit BidPlaced + AuctionTotalUpdated + AuctionExtended) into one
   * refetch. Default 400.
   */
  refetchDebounceMs?: number;
  /**
   * Fetch the full auction snapshot (items + live session). Return null when
   * the call fails so the hook can flag an error state without forcing the
   * caller to throw.
   */
  fetchAuction: (eventCode: string) => Promise<TData | null>;
}

export interface UseLiveAuctionResult<TData> {
  /** Latest snapshot, or null before first successful load. */
  data: TData | null;
  /** True until the first snapshot lands (HTTP or SignalR-triggered refetch). */
  loading: boolean;
  /** True while a SignalR connection is established. */
  connected: boolean;
  /** True when the last HTTP fetch failed and we have no live socket. */
  error: boolean;
  /** Timestamp of the most recent successful update. */
  lastUpdated: Date | null;
  /** Force an immediate HTTP fetch. */
  refresh: () => void;
}

const DEFAULT_POLL_MS = 15_000;
const DEFAULT_DEBOUNCE_MS = 400;

/** Auction hub events that change what the Items/Live tabs display. */
const AUCTION_EVENTS = [
  'BidPlaced',
  'PledgeReceived',
  'AuctionTotalUpdated',
  'AuctionAmountUpdated',
  'ItemClosed',
  'AuctionExtended',
  'LiveAuctionStarted',
  'LiveItemAdvanced',
  'BidderCountUpdated',
] as const;

export function useLiveAuction<TData>(
  opts: UseLiveAuctionOptions<TData>,
): UseLiveAuctionResult<TData> {
  const {
    baseUrl, eventCode, disabled = false,
    initialData = null,
    pollIntervalMs = DEFAULT_POLL_MS,
    refetchDebounceMs = DEFAULT_DEBOUNCE_MS,
    fetchAuction,
  } = opts;

  const [data, setData]               = useState<TData | null>(initialData);
  const [loading, setLoading]         = useState(initialData === null);
  const [connected, setConnected]     = useState(false);
  const [error, setError]             = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(
    initialData !== null ? new Date() : null,
  );

  // Keep the fetcher in a ref so the SignalR effect doesn't re-run when the
  // caller passes a new closure on every render.
  const fetchRef = useRef(fetchAuction);
  useEffect(() => { fetchRef.current = fetchAuction; }, [fetchAuction]);

  const applyFetch = useCallback((code: string) => {
    fetchRef.current(code)
      .then(fresh => {
        if (fresh !== null && fresh !== undefined) {
          setData(fresh);
          setLastUpdated(new Date());
          setError(false);
          setLoading(false);
        } else {
          setError(true);
          setLoading(false);
        }
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  const refresh = useCallback(() => {
    if (!eventCode || disabled) return;
    applyFetch(eventCode);
  }, [eventCode, disabled, applyFetch]);

  // ── SignalR primary transport ───────────────────────────────────────────────
  // Hub events carry only partial data, so each one schedules a coalesced
  // refetch of the authoritative snapshot rather than patching state directly.
  useEffect(() => {
    if (!eventCode || disabled) return;

    let debounceId: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(() => { applyFetch(eventCode); }, refetchDebounceMs);
    };

    const hub = new signalR.HubConnectionBuilder()
      .withUrl(`${baseUrl}/hubs/tournament`)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    for (const evt of AUCTION_EVENTS) hub.on(evt, scheduleRefetch);
    // Silence the score/leaderboard/etc. broadcasts this screen doesn't use —
    // the shared hub fans them to every group member (see tournamentHubEvents).
    silenceUnhandledHubEvents(hub, AUCTION_EVENTS);

    hub.onreconnecting(() => setConnected(false));
    hub.onreconnected(() => {
      setConnected(true);
      hub.invoke('JoinEvent', eventCode).catch(() => {});
      // Catch up on anything missed while the socket was down.
      scheduleRefetch();
    });
    hub.onclose(() => setConnected(false));

    hub.start()
      .then(() => {
        setConnected(true);
        return hub.invoke('JoinEvent', eventCode).catch(() => {});
      })
      .catch(() => setConnected(false));

    return () => {
      if (debounceId) clearTimeout(debounceId);
      hub.stop().catch(() => {});
    };
  }, [baseUrl, eventCode, disabled, refetchDebounceMs, applyFetch]);

  // ── HTTP fallback ──────────────────────────────────────────────────────────
  // Initial fetch fires unconditionally so first paint isn't blocked on the
  // SignalR negotiation handshake. The recurring poll only runs while the hub
  // is disconnected.
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
        if (fresh !== null && fresh !== undefined) {
          setData(fresh);
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

  return { data, loading, connected, error, lastUpdated, refresh };
}
