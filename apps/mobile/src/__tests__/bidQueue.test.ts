import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@gfp/shared-types';

// ── in-memory event_cache ─────────────────────────────────────────────────────
const { kv, mockDb } = vi.hoisted(() => {
  const kv = new Map<string, string>();
  const mockDb = {
    getFirstAsync: vi.fn(async (_sql: string, params: unknown[]) => {
      const v = kv.get(params[0] as string);
      return v !== undefined ? { value: v } : null;
    }),
    runAsync: vi.fn(async (sql: string, params: unknown[]) => {
      if (/^DELETE/i.test(sql.trim())) kv.delete(params[0] as string);
      else kv.set(params[0] as string, params[1] as string);
    }),
  };
  return { kv, mockDb };
});

vi.mock('../lib/db', () => ({ getDb: vi.fn().mockResolvedValue(mockDb) }));
vi.mock('../lib/api', () => ({ placeBid: vi.fn(), pledge: vi.fn() }));

import {
  enqueueBid, loadQueuedBids, clearQueuedBids, flushBidQueue, canQueueOffline,
  isTransientFailure, newRequestId, useBidQueue, QUEUE_MAX_AGE_MS, type QueuedBid,
} from '../lib/bidQueue';
import { describeFlushResults } from '../lib/bidMessages';

const NOW = 1_700_000_000_000;

function bid(over: Partial<QueuedBid> = {}): QueuedBid {
  return {
    requestId: newRequestId(), eventId: 'e1', playerId: 'p1', itemId: 'i1',
    itemTitle: 'Golf Weekend', kind: 'bid', amountCents: 5000, queuedAt: NOW,
    attempted: false, ...over,
  };
}

const ok = (isWinning = true, currentHighBidCents = 5000) => ({
  id: 'b', auctionItemId: 'i1', playerId: 'p1', amountCents: 5000,
  placedAt: '', isWinning, currentHighBidCents, newClosesAt: null,
});

beforeEach(() => { kv.clear(); useBidQueue.setState({ queued: [] }); });

describe('which lots queue offline', () => {
  it('queues Silent lots and silent pledges only', () => {
    expect(canQueueOffline('Silent')).toBe(true);
    expect(canQueueOffline('DonationSilent')).toBe(true);
    expect(canQueueOffline('Live')).toBe(false);
    expect(canQueueOffline('DonationLive')).toBe(false);
  });
});

describe('isTransientFailure', () => {
  it('retries when there was no answer, a 5xx or a 429', () => {
    expect(isTransientFailure(new TypeError('Network request failed'))).toBe(true);
    expect(isTransientFailure(new ApiError(503, 'X', 'down'))).toBe(true);
    expect(isTransientFailure(new ApiError(429, 'X', 'slow down'))).toBe(true);
  });
  it('treats a 4xx as the server\'s final answer', () => {
    expect(isTransientFailure(new ApiError(400, 'X', 'AUCTION_CLOSED'))).toBe(false);
  });
});

describe('newRequestId', () => {
  it('produces distinct v4-shaped ids', () => {
    const a = newRequestId(), b = newRequestId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

describe('enqueueBid', () => {
  it('persists and publishes the queue', async () => {
    await enqueueBid(bid());
    expect(useBidQueue.getState().queued).toHaveLength(1);
    expect(await loadQueuedBids()).toHaveLength(1);
  });

  it('a newer bid on the same lot replaces the older one', async () => {
    await enqueueBid(bid({ amountCents: 5000 }));
    await enqueueBid(bid({ amountCents: 7000 }));
    const q = await loadQueuedBids();
    expect(q).toHaveLength(1);
    expect(q[0].amountCents).toBe(7000);
  });

  it('keeps every pledge — two pledges are two gifts', async () => {
    await enqueueBid(bid({ kind: 'pledge' }));
    await enqueueBid(bid({ kind: 'pledge' }));
    expect(await loadQueuedBids()).toHaveLength(2);
  });

  it('clearQueuedBids drops one event, or everything', async () => {
    await enqueueBid(bid({ eventId: 'e1', itemId: 'a' }));
    await enqueueBid(bid({ eventId: 'e2', itemId: 'b' }));
    await clearQueuedBids('e1');
    expect((await loadQueuedBids()).map(q => q.eventId)).toEqual(['e2']);
    await clearQueuedBids();
    expect(await loadQueuedBids()).toEqual([]);
  });
});

describe('flushBidQueue', () => {
  it('sends with the queued request id and empties the queue', async () => {
    const b = bid();
    await enqueueBid(b);
    const send = vi.fn().mockResolvedValue(ok());
    const results = await flushBidQueue('p1', 'tok', { send, now: () => NOW });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ requestId: b.requestId }), 'tok');
    expect(results.map(r => r.outcome)).toEqual(['placed']);
    expect(await loadQueuedBids()).toEqual([]);
  });

  it('stops at a transient failure and keeps the rest for next time', async () => {
    await enqueueBid(bid({ itemId: 'a' }));
    await enqueueBid(bid({ itemId: 'b' }));
    const send = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
    const results = await flushBidQueue('p1', 'tok', { send, now: () => NOW });
    expect(send).toHaveBeenCalledTimes(1);
    expect(results).toEqual([]);
    expect(await loadQueuedBids()).toHaveLength(2);
  });

  it('drops a refused bid and reports why', async () => {
    await enqueueBid(bid());
    const send = vi.fn().mockRejectedValue(new ApiError(400, 'VALIDATION', 'AUCTION_CLOSED'));
    const results = await flushBidQueue('p1', 'tok', { send, now: () => NOW });
    expect(results[0]).toMatchObject({ outcome: 'rejected', message: 'AUCTION_CLOSED' });
    expect(await loadQueuedBids()).toEqual([]);
  });

  it('expires a bid queued too long ago without sending it', async () => {
    await enqueueBid(bid());
    const send = vi.fn();
    const results = await flushBidQueue('p1', 'tok', { send, now: () => NOW + QUEUE_MAX_AGE_MS + 1 });
    expect(send).not.toHaveBeenCalled();
    expect(results.map(r => r.outcome)).toEqual(['expired']);
    expect(await loadQueuedBids()).toEqual([]);
  });

  it('leaves other players\' bids alone', async () => {
    await enqueueBid(bid({ playerId: 'p2' }));
    const send = vi.fn();
    await flushBidQueue('p1', 'tok', { send, now: () => NOW });
    expect(send).not.toHaveBeenCalled();
    expect(await loadQueuedBids()).toHaveLength(1);
  });

  it('shares one run between overlapping calls', async () => {
    await enqueueBid(bid());
    let release!: () => void;
    const send = vi.fn(() => new Promise<ReturnType<typeof ok>>(r => { release = () => r(ok()); }));
    const a = flushBidQueue('p1', 'tok', { send, now: () => NOW });
    const b = flushBidQueue('p1', 'tok', { send, now: () => NOW });
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    release();
    expect(await a).toBe(await b);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('describeFlushResults', () => {
  it('says nothing when nothing finished', () => {
    expect(describeFlushResults([])).toBeNull();
  });

  it('reports a winning bid with the price', () => {
    const p = describeFlushResults([{ bid: bid(), outcome: 'placed', response: ok(true, 5500) }])!;
    expect(p.title).toBe('Queued bid sent');
    expect(p.message).toContain("You're the high bidder at $55");
    expect(p.highlights).toEqual(['Golf Weekend']);
    expect(p.warning).toBe(false);
  });

  it('warns when a queued bid was refused, without the refresh hint', () => {
    const p = describeFlushResults([{ bid: bid(), outcome: 'rejected', message: 'AUCTION_CLOSED' }])!;
    expect(p.title).toBe('Queued bid not placed');
    expect(p.message).toContain('This item just closed.');
    expect(p.message).not.toContain('Pull down');
    expect(p.warning).toBe(true);
  });

  it('tells the golfer to check My Bids when an expired bid may have landed', () => {
    const p = describeFlushResults([{ bid: bid({ attempted: true }), outcome: 'expired' }])!;
    expect(p.message).toContain('check My Bids');
  });

  it('combines several results into one popup', () => {
    const p = describeFlushResults([
      { bid: bid({ itemTitle: 'A' }), outcome: 'placed', response: ok() },
      { bid: bid({ itemTitle: 'B', kind: 'pledge' }), outcome: 'placed', response: ok() },
    ])!;
    expect(p.title).toBe('Queued bids sent');
    expect(p.message.split('\n')).toHaveLength(2);
    expect(p.highlights).toEqual(['A', 'B']);
  });
});
