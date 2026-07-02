'use client';

/**
 * Registry of every client-method name the API's TournamentHub broadcasts to an
 * event group (source of truth: apps/api/Features/RealTime/RealTimeService.cs
 * and LeaderboardBroadcaster.cs).
 *
 * Why this exists: a SignalR connection joined to an event group receives ALL
 * of that group's broadcasts, regardless of which ones the screen cares about.
 * If the server invokes a client method the connection hasn't registered a
 * handler for, SignalR logs `Warning: No client method with the name 'x' found`
 * for EVERY such message — a flood during scoring (ScoreUpdated fires per hole).
 * Each hook registers its real handlers, then calls `silenceUnhandledHubEvents`
 * to no-op the rest so the log stays clean.
 *
 * Keep this list in sync when a new TournamentHub broadcast is added server-side.
 */

import type * as signalR from '@microsoft/signalr';

export const TOURNAMENT_HUB_EVENTS = [
  // scoring / event family
  'ScoreUpdated',
  'LeaderboardRefreshed',
  'HoleInOneAlert',
  'CheckInUpdated',
  'ChallengeUpdated',
  'FundraisingUpdated',
  'SponsorsChanged',
  // auction family
  'BidPlaced',
  'AuctionExtended',
  'ItemClosed',
  'LiveAuctionStarted',
  'LiveItemAdvanced',
  'PledgeReceived',
  'AuctionTotalUpdated',
  'AuctionAmountUpdated',
  'BidderCountUpdated',
] as const;

export type TournamentHubEvent = (typeof TOURNAMENT_HUB_EVENTS)[number];

/**
 * Registers a no-op handler for every TournamentHub broadcast the caller does
 * NOT already handle, so SignalR doesn't warn about unhandled group messages.
 * Call after registering the hook's real handlers.
 */
export function silenceUnhandledHubEvents(
  hub: signalR.HubConnection,
  handled: readonly string[],
): void {
  const handledSet = new Set(handled);
  for (const evt of TOURNAMENT_HUB_EVENTS) {
    if (!handledSet.has(evt)) hub.on(evt, () => { /* intentionally ignored */ });
  }
}
