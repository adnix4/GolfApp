import { useEffect, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import { silenceUnhandledHubEvents } from '@gfp/shared-types';

/**
 * One SignalR connection per joined event, held by the session for as long as
 * the golfer is in it. It carries the pushes the phone used to learn by polling
 * GET /pub/events/{code}/status (problemList PF1): every phone at a shotgun
 * start asked every 15–60 s whether scoring had opened, which made that
 * endpoint the API's steadiest load.
 *
 * - EventStatusChanged { status, themeJson }: the organizer changed the event's
 *   lifecycle status or its (resolved) theme. Applied straight from the push.
 * - CheckInUpdated { playerIds }: someone was checked in. Only THIS golfer's
 *   check-in matters to this phone (it unlocks cardless bidding), so the push
 *   is ignored unless its playerIds name us — the whole group hears every
 *   check-in, and refetching on each would turn a check-in rush into a storm.
 * - SponsorsChanged: the sponsor list moved on.
 *   Both are only nudges; the session refetches the status endpoint once.
 *
 * The Standings and Auction screens still open their own connections through
 * useLiveLeaderboard / useLiveAuction while they are on screen.
 */

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';

/**
 * While the hub is connected the status poll is only a safety net for anything
 * not pushed (a card saved on another device, a missed message), so it runs this
 * rarely instead of every 30–60 s.
 */
export const HUB_FALLBACK_POLL_MS = 5 * 60_000;

/**
 * Whether a status-poll tick should fetch: always when the hub is down (the
 * poll is then the only source), otherwise once per HUB_FALLBACK_POLL_MS.
 */
export function statusFetchDue(hubConnected: boolean, lastFetchMs: number, now: number): boolean {
  return !hubConnected || now - lastFetchMs >= HUB_FALLBACK_POLL_MS;
}

/** Whether a CheckInUpdated push names this golfer (ids compared case-insensitively). */
export function isOwnCheckIn(payload: unknown, playerId: string | undefined): boolean {
  if (!playerId) return false;
  const ids = (payload as { playerIds?: unknown } | null)?.playerIds;
  if (!Array.isArray(ids)) return false;
  const me = playerId.toLowerCase();
  return ids.some(id => typeof id === 'string' && id.toLowerCase() === me);
}

export interface EventStatusPush {
  status:    string;
  themeJson: string | null;
}

export interface EventHubHandlers {
  onStatus:    (push: EventStatusPush) => void;
  /** This golfer was checked in, or sponsors changed: refetch the status endpoint once. */
  onNudge:     () => void;
  /** Connected or reconnected: anything pushed while down was missed, so catch up. */
  onConnected: () => void;
}

/** Hub events handled here; every other TournamentHub broadcast is silenced. */
const HANDLED = ['EventStatusChanged', 'CheckInUpdated', 'SponsorsChanged'] as const;

/**
 * Connects while `enabled` and an event code is set; returns whether the hub is
 * connected. Handlers may be fresh closures every render — they are read
 * through a ref, so the connection is not rebuilt.
 */
export function useEventHub(
  eventCode: string | undefined, playerId: string | undefined, enabled: boolean, handlers: EventHubHandlers,
): boolean {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef(handlers);
  useEffect(() => { handlersRef.current = handlers; }, [handlers]);
  const playerIdRef = useRef(playerId);
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);

  useEffect(() => {
    if (!eventCode || !enabled) { setConnected(false); return; }

    const hub = new signalR.HubConnectionBuilder()
      .withUrl(`${BASE}/hubs/tournament`)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    // Block bodies: a handler that returns a value is taken as a reply to the
    // server, which logs "Result given … server is not expecting a result".
    hub.on('EventStatusChanged', (p: Partial<EventStatusPush>) => {
      if (typeof p?.status === 'string') handlersRef.current.onStatus({ status: p.status, themeJson: p.themeJson ?? null });
    });
    hub.on('CheckInUpdated',  (p: unknown) => { if (isOwnCheckIn(p, playerIdRef.current)) handlersRef.current.onNudge(); });
    hub.on('SponsorsChanged', () => { handlersRef.current.onNudge(); });
    silenceUnhandledHubEvents(hub, HANDLED);

    const joined = () => {
      setConnected(true);
      handlersRef.current.onConnected();
    };
    hub.onreconnecting(() => setConnected(false));
    hub.onreconnected(() => {
      hub.invoke('JoinEvent', eventCode).then(joined).catch(() => setConnected(false));
    });
    hub.onclose(() => setConnected(false));

    const started = hub.start()
      .then(() => hub.invoke('JoinEvent', eventCode))
      .then(joined)
      .catch(() => setConnected(false));

    return () => {
      setConnected(false);
      // Stopping mid-negotiation logs an error-level "stopped during
      // negotiation"; wait for start() to settle first (it never rejects).
      started.then(() => hub.stop().catch(() => {}));
    };
  }, [eventCode, enabled]);

  return connected;
}
