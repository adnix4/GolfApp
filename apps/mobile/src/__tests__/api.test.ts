import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock authStore before importing api (api reads the store at call-time via getState())
vi.mock('@/lib/authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ accessToken: null })),
  },
}));

import {
  joinEvent, fetchLeaderboard, batchSync, checkConnectivity,
  registerPushToken,
  fetchAuctionItems, placeBid, pledge,
  createSetupIntent, confirmSetup,
  fetchPlayerBidHistory, fetchActiveAuctionSession,
  fetchEventStatus,
  fetchMyCheckout, confirmMyCheckout,
} from '../lib/api';
import type { PendingScore } from '../lib/api';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Helper: create a mock fetch response
function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

// Helper: stub successful mock for most tests
function mockOk(body: unknown) {
  mockFetch.mockResolvedValueOnce(mockResponse(body));
}

function mockErr(status: number, body: unknown = {}) {
  mockFetch.mockResolvedValueOnce(mockResponse(body, status));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── joinEvent ─────────────────────────────────────────────────────────────────

describe('joinEvent', () => {
  const response = {
    event: { id: 'ev1', name: 'Test Event', eventCode: 'TESTCODE', format: 'scramble', startType: 'shotgun', holes: 18, status: 'active', startAt: null },
    team:  { id: 'tm1', name: 'Eagles', startingHole: 5, teeTime: null, players: [] },
    player: { id: 'pl1', firstName: 'Jane', lastName: 'Doe', email: 'jane@test.com' },
    org:   { id: 'org1', name: 'Club', slug: 'club', logoUrl: null, themeJson: null },
    course: null,
    sponsors: [],
  };

  it('sends POST with email and deviceId in body', async () => {
    mockOk(response);
    await joinEvent('TESTCODE', 'jane@test.com', 'dev-001');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/events/TESTCODE/join');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toMatchObject({ email: 'jane@test.com', deviceId: 'dev-001' });
  });

  it('includes the verification code in the body when provided (A3)', async () => {
    mockOk(response);
    await joinEvent('TESTCODE', 'jane@test.com', 'dev-001', '123456');
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(opts.body as string)).toMatchObject({ verificationCode: '123456' });
  });

  it('omits verificationCode from the body when not provided', async () => {
    mockOk(response);
    await joinEvent('TESTCODE', 'jane@test.com', 'dev-001');
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(opts.body as string)).not.toHaveProperty('verificationCode');
  });

  it('returns the parsed join response on success', async () => {
    mockOk(response);
    const result = await joinEvent('TESTCODE', 'jane@test.com', 'dev-001');
    expect(result.event.eventCode).toBe('TESTCODE');
    expect(result.team!.name).toBe('Eagles');
  });

  it('throws an error when the server returns 404', async () => {
    mockErr(404, { error: 'Event not found' });
    await expect(joinEvent('BADCODE', 'jane@test.com', 'dev-001')).rejects.toThrow('Event not found');
  });

  it('throws a generic message when the error body is not JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 500,
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response);
    await expect(joinEvent('CODE', 'a@b.com', 'x')).rejects.toThrow('Join failed (500)');
  });
});

// ── fetchLeaderboard ──────────────────────────────────────────────────────────

describe('fetchLeaderboard', () => {
  const board = {
    eventId: 'ev1', eventName: 'Test', status: 'scoring',
    standings: [{ rank: 1, teamName: 'Eagles', toPar: -4, grossTotal: 68, holesComplete: 18, isComplete: true }],
  };

  it('sends a GET request to the public leaderboard endpoint', async () => {
    mockOk(board);
    await fetchLeaderboard('TESTCODE');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toContain('/pub/events/TESTCODE/leaderboard');
    // Every API call is tagged with the stable install id so the server's
    // rate limiter can bucket per device instead of per venue NAT IP.
    expect((opts?.headers as Record<string, string>)['X-GFP-Device']).toBeTruthy();
  });

  it('returns the leaderboard data on success', async () => {
    mockOk(board);
    const result = await fetchLeaderboard('TESTCODE');
    expect(result.standings).toHaveLength(1);
    expect(result.standings[0].teamName).toBe('Eagles');
  });

  it('throws when the server returns an error', async () => {
    mockErr(503, { error: 'Service unavailable' });
    await expect(fetchLeaderboard('CODE')).rejects.toThrow('Service unavailable');
  });
});

// ── batchSync ─────────────────────────────────────────────────────────────────

describe('batchSync', () => {
  const scores: PendingScore[] = [
    { holeNumber: 1, grossScore: 4, putts: 2, clientTimestampMs: 1_700_000_000_000 },
    {
      holeNumber: 2, grossScore: 3, putts: 1, clientTimestampMs: 1_700_000_001_000,
      playerShots: {
        p1: { drive: 1, approach: 1, putt: 0 }, // total = 2
        p2: { drive: 0, approach: 0, putt: 1 }, // total = 1
      },
    },
  ];

  const syncResponse = { accepted: 2, conflicts: 0, conflictDetails: [] };

  it('sends POST to /sync/scores with correct envelope', async () => {
    mockOk(syncResponse);
    await batchSync('ev1', 'tm1', 'dev-001', scores, 'tok-1');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/sync/scores');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body.eventId).toBe('ev1');
    expect(body.teamId).toBe('tm1');
    expect(body.sessionToken).toBe('tok-1');
    expect(body.deviceId).toBe('dev-001');
    expect(body.scores).toHaveLength(2);
  });

  it('includes playerShots in the score payload (Bug #1 regression)', async () => {
    mockOk(syncResponse);
    await batchSync('ev1', 'tm1', 'dev-001', scores, 'tok-1');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // Hole 2 has playerShots
    const hole2 = body.scores.find((s: { holeNumber: number }) => s.holeNumber === 2);
    expect(hole2.playerShots).toEqual({ p1: 2, p2: 1 });
  });

  it('sends null for playerShots when not provided', async () => {
    mockOk(syncResponse);
    await batchSync('ev1', 'tm1', 'dev-001', scores, 'tok-1');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const hole1 = body.scores.find((s: { holeNumber: number }) => s.holeNumber === 1);
    expect(hole1.playerShots).toBeNull();
  });

  it('returns the batch sync response', async () => {
    mockOk(syncResponse);
    const result = await batchSync('ev1', 'tm1', 'dev-001', scores, 'tok-1');
    expect(result.accepted).toBe(2);
    expect(result.conflicts).toBe(0);
  });

  it('throws when the server returns a sync error', async () => {
    mockErr(409, { error: 'Score conflict detected' });
    await expect(batchSync('ev1', 'tm1', 'dev-001', scores, 'tok-1')).rejects.toThrow('Score conflict detected');
  });
});

// ── checkConnectivity ─────────────────────────────────────────────────────────

describe('checkConnectivity', () => {
  it('returns true when the server responds (any status)', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 404)); // 404 still means server is up
    const ok = await checkConnectivity();
    expect(ok).toBe(true);
  });

  it('returns false when the network request throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const ok = await checkConnectivity();
    expect(ok).toBe(false);
  });
});

// ── registerPushToken ─────────────────────────────────────────────────────────

describe('registerPushToken', () => {
  it('sends POST to the push-token endpoint with the token', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 200));
    await registerPushToken('pl1', 'ExponentPushToken[abc123]');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/players/pl1/push-token');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toMatchObject({ token: 'ExponentPushToken[abc123]' });
  });

  it('sends null token to deregister', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 200));
    await registerPushToken('pl1', null);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.token).toBeNull();
  });

  it('throws when the server returns an error', async () => {
    mockErr(500, { error: 'Internal error' });
    await expect(registerPushToken('pl1', 'tok')).rejects.toThrow('Internal error');
  });
});

// ── fetchAuctionItems ─────────────────────────────────────────────────────────

const AUCTION_ITEM = {
  id: 'item1', eventId: 'ev1', title: 'Golf Bag', description: 'A nice bag',
  photoUrls: [], auctionType: 'Silent', status: 'Open',
  startingBidCents: 5000, bidIncrementCents: 500, buyNowPriceCents: null,
  currentHighBidCents: 7500, closesAt: '2026-06-01T20:00:00Z',
  maxExtensionMin: 10, donationDenominations: null, minimumBidCents: null,
  fairMarketValueCents: 5000, goalCents: null, totalRaisedCents: 7500,
};

describe('fetchAuctionItems', () => {
  it('sends GET to the public auction items endpoint', async () => {
    mockOk([AUCTION_ITEM]);
    await fetchAuctionItems('ev1');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toContain('/events/ev1/auction/items/public');
    expect((opts?.headers as Record<string, string>)['X-GFP-Device']).toBeTruthy();
  });

  it('returns the items array on success', async () => {
    mockOk([AUCTION_ITEM]);
    const items = await fetchAuctionItems('ev1');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Golf Bag');
    expect(items[0].currentHighBidCents).toBe(7500);
  });

  it('returns an empty array when no items are open', async () => {
    mockOk([]);
    const items = await fetchAuctionItems('ev1');
    expect(items).toHaveLength(0);
  });

  it('throws when the server returns an error', async () => {
    mockErr(404, { error: 'Event not found' });
    await expect(fetchAuctionItems('ev1')).rejects.toThrow('Event not found');
  });
});

// ── placeBid ──────────────────────────────────────────────────────────────────

const BID_RESPONSE = {
  id: 'bid1', auctionItemId: 'item1', playerId: 'pl1',
  amountCents: 8000, placedAt: '2026-06-01T19:00:00Z',
  isWinning: true, newClosesAt: null,
};

describe('placeBid', () => {
  it('sends POST to /auction/items/{id}/bid with playerId and amountCents', async () => {
    mockOk(BID_RESPONSE);
    await placeBid('item1', 'pl1', 8000, 'tok-1');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auction/items/item1/bid');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toMatchObject({ playerId: 'pl1', amountCents: 8000, sessionToken: 'tok-1' });
  });

  it('returns the bid response on success', async () => {
    mockOk(BID_RESPONSE);
    const result = await placeBid('item1', 'pl1', 8000, 'tok-1');
    expect(result.isWinning).toBe(true);
    expect(result.amountCents).toBe(8000);
  });

  it('throws BID_TOO_LOW when server rejects the amount', async () => {
    mockErr(400, { error: 'BID_TOO_LOW:8500' });
    await expect(placeBid('item1', 'pl1', 500, 'tok-1')).rejects.toThrow('BID_TOO_LOW:8500');
  });

  it('throws AUCTION_CLOSED when bidding on a closed item', async () => {
    mockErr(400, { error: 'AUCTION_CLOSED' });
    await expect(placeBid('item1', 'pl1', 9000, 'tok-1')).rejects.toThrow('AUCTION_CLOSED');
  });

  it('includes newClosesAt in response when bid triggered an extension', async () => {
    mockOk({ ...BID_RESPONSE, newClosesAt: '2026-06-01T20:00:30Z' });
    const result = await placeBid('item1', 'pl1', 8000, 'tok-1');
    expect(result.newClosesAt).toBe('2026-06-01T20:00:30Z');
  });
});

// ── pledge ────────────────────────────────────────────────────────────────────

describe('pledge', () => {
  it('sends POST to /auction/items/{id}/pledge (not /bid)', async () => {
    mockOk(BID_RESPONSE);
    await pledge('item1', 'pl1', 10000, 'tok-1');
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auction/items/item1/pledge');
    expect(url).not.toContain('/bid');
  });

  it('sends playerId and amountCents in body', async () => {
    mockOk(BID_RESPONSE);
    await pledge('item1', 'pl1', 10000, 'tok-1');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ playerId: 'pl1', amountCents: 10000, sessionToken: 'tok-1' });
  });

  it('throws when the pledge amount is below the minimum', async () => {
    mockErr(400, { error: 'BID_TOO_LOW:2500' });
    await expect(pledge('item1', 'pl1', 100, 'tok-1')).rejects.toThrow('BID_TOO_LOW:2500');
  });
});

// ── createSetupIntent ─────────────────────────────────────────────────────────

describe('createSetupIntent', () => {
  it('sends POST to /payments/setup-intent with playerId', async () => {
    mockOk({ clientSecret: 'seti_abc_secret_xyz' });
    await createSetupIntent('pl1', 'tok-1');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/payments/setup-intent');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toMatchObject({ playerId: 'pl1', sessionToken: 'tok-1' });
  });

  it('returns the clientSecret on success', async () => {
    mockOk({ clientSecret: 'seti_abc_secret_xyz' });
    const result = await createSetupIntent('pl1', 'tok-1');
    expect(result.clientSecret).toBe('seti_abc_secret_xyz');
  });

  it('throws when player is not found', async () => {
    mockErr(404, { error: 'Player not found' });
    await expect(createSetupIntent('bad-id', 'tok-1')).rejects.toThrow('Player not found');
  });
});

// ── confirmSetup ──────────────────────────────────────────────────────────────

describe('confirmSetup', () => {
  it('sends POST to /payments/confirm-setup with playerId and setupIntentId', async () => {
    mockOk({ hasPaymentMethod: true });
    await confirmSetup('pl1', 'seti_abc123', 'tok-1');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/payments/confirm-setup');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toMatchObject({
      playerId: 'pl1', setupIntentId: 'seti_abc123', sessionToken: 'tok-1',
    });
  });

  it('returns hasPaymentMethod: true on success', async () => {
    mockOk({ hasPaymentMethod: true });
    const result = await confirmSetup('pl1', 'seti_abc123', 'tok-1');
    expect(result.hasPaymentMethod).toBe(true);
  });

  it('throws when the SetupIntent has not succeeded yet', async () => {
    mockErr(400, { error: "SetupIntent status is 'requires_action', expected 'succeeded'." });
    await expect(confirmSetup('pl1', 'seti_abc123', 'tok-1')).rejects.toThrow("requires_action");
  });
});

// ── fetchPlayerBidHistory ─────────────────────────────────────────────────────

describe('fetchPlayerBidHistory', () => {
  const historyItem = {
    auctionItemId: 'item1', itemTitle: 'Golf Bag',
    amountCents: 8000, status: 'Winning', placedAt: '2026-06-01T19:00:00Z',
  };

  it('sends GET to /players/{id}/bids', async () => {
    mockOk([historyItem]);
    await fetchPlayerBidHistory('pl1', 'tok-abc');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toContain('/players/pl1/bids');
    expect((opts?.headers as Record<string, string>)['X-GFP-Device']).toBeTruthy();
  });

  it('passes the session token — the history exposes private Silent maxima', async () => {
    // Without it the server answers 404, the same as it would for a bad player id.
    mockOk([historyItem]);
    await fetchPlayerBidHistory('pl1', 'tok-abc');
    expect(mockFetch.mock.calls[0][0] as string).toContain('sessionToken=tok-abc');
  });

  it('url-encodes a token containing url-unsafe characters', async () => {
    mockOk([historyItem]);
    await fetchPlayerBidHistory('pl1', 'a+b/c=d');
    expect(mockFetch.mock.calls[0][0] as string).toContain('sessionToken=a%2Bb%2Fc%3Dd');
  });

  it('returns the bid history array', async () => {
    mockOk([historyItem]);
    const result = await fetchPlayerBidHistory('pl1', 'tok');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('Winning');
  });

  it('returns an empty array when the player has no bids', async () => {
    mockOk([]);
    const result = await fetchPlayerBidHistory('pl1', 'tok');
    expect(result).toHaveLength(0);
  });
});

// ── fetchEventStatus ──────────────────────────────────────────────────────────
//
// The optional session auth is what lets a device notice it was checked in —
// check-in happens at the desk after join, so the cached session goes stale and
// the auction bid button would stay locked without this.

describe('fetchEventStatus', () => {
  const status = { status: 'Active', resolvedThemeJson: null, sponsorsVersion: 3 };

  it('polls anonymously with no session headers', async () => {
    mockOk(status);
    const res = await fetchEventStatus('ABCD1234');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toContain('/pub/events/ABCD1234/status');
    const headers = (opts?.headers ?? {}) as Record<string, string>;
    expect(headers['X-GFP-Player-Id']).toBeUndefined();
    expect(res.player).toBeNull();
  });

  it('sends the per-player session headers when given auth', async () => {
    mockOk(status);
    await fetchEventStatus('ABCD1234', { playerId: 'pl1', sessionToken: 'tok-1' });
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit | undefined];
    const headers = (opts?.headers ?? {}) as Record<string, string>;
    expect(headers['X-GFP-Player-Id']).toBe('pl1');
    expect(headers['X-GFP-Session-Token']).toBe('tok-1');
  });

  it('surfaces the player block when the server returns one', async () => {
    mockOk({ ...status, player: { isCheckedIn: true, hasPaymentMethod: false } });
    const res = await fetchEventStatus('ABCD1234', { playerId: 'pl1', sessionToken: 'tok-1' });
    expect(res.player).toEqual({ isCheckedIn: true, hasPaymentMethod: false });
  });

  it('reports a null player block rather than throwing when auth is rejected', async () => {
    mockOk(status);
    const res = await fetchEventStatus('ABCD1234', { playerId: 'pl1', sessionToken: 'stale' });
    expect(res.player).toBeNull();
    expect(res.status).toBe('Active');
  });
});

// ── fetchActiveAuctionSession ─────────────────────────────────────────────────

describe('fetchActiveAuctionSession', () => {
  const session = {
    id: 'sess1', eventId: 'ev1', isActive: true,
    currentItemId: 'item1', currentCalledAmountCents: 15000,
    startedAt: '2026-06-01T18:00:00Z', endedAt: null,
  };

  it('returns the session when one is active', async () => {
    mockOk(session);
    const result = await fetchActiveAuctionSession('ev1');
    expect(result).not.toBeNull();
    expect(result!.isActive).toBe(true);
    expect(result!.currentCalledAmountCents).toBe(15000);
  });

  it('returns null on 204 (no active session)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: vi.fn() });
    const result = await fetchActiveAuctionSession('ev1');
    expect(result).toBeNull();
  });

  it('returns null on error (non-blocking — attendee screen should not crash)', async () => {
    mockErr(500, { error: 'Internal error' });
    const result = await fetchActiveAuctionSession('ev1');
    expect(result).toBeNull();
  });
});

// ── Auction checkout ──────────────────────────────────────────────────────────
//
// Closing a lot no longer charges the winner — they settle at the desk, or
// confirm their saved card here first.

describe('fetchMyCheckout', () => {
  const cart = {
    playerId: 'p1', playerName: 'Dana Winner', playerEmail: 'd@t.com',
    hasPaymentMethod: false,
    totalCents: 3500, settledCents: 0, outstandingCents: 3500,
    lines: [{
      winnerId: 'w1', auctionItemId: 'i1', itemTitle: 'Signed Flag',
      amountCents: 3500, chargeStatus: 'Pending',
      settlementMethod: null, checkedOutAt: null, pickedUpAt: null,
    }],
  };

  it('passes the session token, which is the whole authorization', async () => {
    // Golfers have no password, so without this the request cannot identify them.
    mockOk(cart);
    await fetchMyCheckout('p1', 'tok-abc');
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/players/p1/auction/checkout');
    expect(url).toContain('sessionToken=tok-abc');
  });

  it('url-encodes a token containing url-unsafe characters', async () => {
    mockOk(cart);
    await fetchMyCheckout('p1', 'a+b/c=d');
    expect(mockFetch.mock.calls[0][0] as string).toContain('sessionToken=a%2Bb%2Fc%3Dd');
  });

  it('returns the cart with its outstanding balance', async () => {
    mockOk(cart);
    const result = await fetchMyCheckout('p1', 'tok');
    expect(result.outstandingCents).toBe(3500);
    expect(result.lines[0].itemTitle).toBe('Signed Flag');
  });

  it('throws when the token is rejected', async () => {
    mockErr(404, { error: 'Player not found' });
    await expect(fetchMyCheckout('p1', 'wrong')).rejects.toThrow('Player not found');
  });
});

describe('confirmMyCheckout', () => {
  it('posts the session token in the body', async () => {
    mockOk({ settled: 1, failed: 0, settledCents: 3500, cart: {} });
    await confirmMyCheckout('p1', 'tok-abc');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/players/p1/auction/checkout/confirm');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ sessionToken: 'tok-abc' });
  });

  it('surfaces NO_PAYMENT_METHOD so the screen can route to card setup', async () => {
    mockErr(400, { error: 'NO_PAYMENT_METHOD' });
    await expect(confirmMyCheckout('p1', 'tok')).rejects.toThrow('NO_PAYMENT_METHOD');
  });

  it('reports a declined card rather than pretending it settled', async () => {
    mockOk({ settled: 0, failed: 1, settledCents: 0, cart: { outstandingCents: 3500 } });
    const result = await confirmMyCheckout('p1', 'tok');
    expect(result.failed).toBe(1);
    expect(result.settledCents).toBe(0);
  });
});
