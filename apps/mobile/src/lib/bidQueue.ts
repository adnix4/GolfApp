import { create } from 'zustand';
import { ApiError } from '@gfp/shared-types';
import { getDb } from './db';
import { placeBid, pledge, type BidResponse } from './api';

// ── Offline bid queue ─────────────────────────────────────────────────────────
//
// A bid or pledge confirmed with no connection is saved here and sent once the
// phone is back online (session.tsx flushes it on every status poll). Kept in
// event_cache as one JSON row, like the session, so it survives an app restart
// and works on the web build's storage shim too.
//
// Only Silent lots and silent Fund-a-Need pledges queue. A Live lot is called
// aloud by an auctioneer — a bid arriving minutes later is a bid on a different
// moment of the auction, so live bidding stays online-only.
//
// Every queued bid carries a requestId the server de-duplicates on
// (bids.client_request_id): a resend after a lost response returns the original
// instead of bidding — or for a pledge, donating — twice.

const QUEUE_KEY = 'gfp:pending_bids';

/** A queued bid older than this is dropped unsent: the golfer has had time to change their mind. */
export const QUEUE_MAX_AGE_MS = 30 * 60_000;

export interface QueuedBid {
  requestId:   string;
  eventId:     string;
  playerId:    string;
  itemId:      string;
  itemTitle:   string;
  kind:        'bid' | 'pledge';
  amountCents: number;
  queuedAt:    number;
  /**
   * A send was already tried and got no answer, so it may have landed. An
   * expired bid like this is reported as "check My Bids", not "not sent".
   */
  attempted:   boolean;
}

export type FlushResult =
  | { bid: QueuedBid; outcome: 'placed';   response: BidResponse }
  | { bid: QueuedBid; outcome: 'rejected'; message: string }
  | { bid: QueuedBid; outcome: 'expired' };

/** Auction types a bid may be queued for while offline. */
export function canQueueOffline(auctionType: string): boolean {
  return auctionType === 'Silent' || auctionType === 'DonationSilent';
}

/**
 * True when a failed send is worth retrying: no response at all (fetch threw),
 * a server error, or rate limiting. A 4xx is the server's answer — the bid was
 * refused and resending it would be refused again.
 */
export function isTransientFailure(e: unknown): boolean {
  if (!(e instanceof ApiError)) return true;
  return e.status >= 500 || e.status === 429;
}

/** RFC 4122 v4 id. Not crypto-grade — it only has to be unique per bid. */
export function newRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = Math.random() * 16 | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── UI state ──────────────────────────────────────────────────────────────────

interface BidQueueState { queued: QueuedBid[] }

/** What the auction screen reads to show "waiting to send". */
export const useBidQueue = create<BidQueueState>(() => ({ queued: [] }));

// ── Storage ───────────────────────────────────────────────────────────────────

export async function loadQueuedBids(): Promise<QueuedBid[]> {
  const db  = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM event_cache WHERE key = ?', [QUEUE_KEY],
  );
  let queued: QueuedBid[];
  try { queued = row ? JSON.parse(row.value) : []; } catch { queued = []; }
  useBidQueue.setState({ queued });
  return queued;
}

async function saveQueuedBids(queued: QueuedBid[]): Promise<void> {
  const db = await getDb();
  if (queued.length === 0) {
    await db.runAsync('DELETE FROM event_cache WHERE key = ?', [QUEUE_KEY]);
  } else {
    await db.runAsync(
      'INSERT OR REPLACE INTO event_cache (key, value) VALUES (?, ?)',
      [QUEUE_KEY, JSON.stringify(queued)],
    );
  }
  useBidQueue.setState({ queued });
}

/**
 * Adds a bid to the queue. A newer bid on the same lot replaces the older one
 * (a proxy bid is a maximum, and the latest one is what the golfer means).
 * Pledges never replace each other: two pledges are two gifts, as they are online.
 */
export async function enqueueBid(bid: QueuedBid): Promise<void> {
  const queued = await loadQueuedBids();
  const kept = bid.kind === 'bid'
    ? queued.filter(q => !(q.kind === 'bid' && q.itemId === bid.itemId && q.playerId === bid.playerId))
    : queued;
  await saveQueuedBids([...kept, bid]);
}

/** Drops everything queued for an event (the golfer left it), or everything when no event is named. */
export async function clearQueuedBids(eventId?: string): Promise<void> {
  const queued = eventId ? await loadQueuedBids() : [];
  await saveQueuedBids(queued.filter(q => q.eventId !== eventId));
}

// ── Sending ───────────────────────────────────────────────────────────────────

export interface FlushDeps {
  send: (bid: QueuedBid, sessionToken: string) => Promise<BidResponse>;
  now:  () => number;
}

const defaultDeps: FlushDeps = {
  send: (bid, token) => bid.kind === 'pledge'
    ? pledge(bid.itemId, bid.playerId, bid.amountCents, token, bid.requestId)
    : placeBid(bid.itemId, bid.playerId, bid.amountCents, token, bid.requestId),
  now: () => Date.now(),
};

let flushing: Promise<FlushResult[]> | null = null;

/**
 * Sends this player's queued bids, oldest first. Stops at the first transient
 * failure and keeps it and everything after it for the next attempt. Returns
 * what happened to each bid it finished with, for the caller to tell the golfer.
 * Concurrent calls share one run.
 */
export function flushBidQueue(
  playerId: string, sessionToken: string, deps: FlushDeps = defaultDeps,
): Promise<FlushResult[]> {
  if (flushing) return flushing;
  flushing = (async () => {
    const results: FlushResult[] = [];
    try {
      const queued = await loadQueuedBids();
      const mine   = queued.filter(q => q.playerId === playerId);
      if (mine.length === 0) return results;

      const done = new Set<string>();
      for (const bid of mine) {
        if (deps.now() - bid.queuedAt > QUEUE_MAX_AGE_MS) {
          results.push({ bid, outcome: 'expired' });
          done.add(bid.requestId);
          continue;
        }
        try {
          const response = await deps.send(bid, sessionToken);
          results.push({ bid, outcome: 'placed', response });
          done.add(bid.requestId);
        } catch (e) {
          if (isTransientFailure(e)) break;
          results.push({ bid, outcome: 'rejected', message: e instanceof Error ? e.message : '' });
          done.add(bid.requestId);
        }
      }

      // Re-read before writing: a bid may have been queued while this ran.
      const latest = await loadQueuedBids();
      await saveQueuedBids(latest.filter(q => !done.has(q.requestId)));
      return results;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
