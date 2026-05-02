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

  it('returns the parsed join response on success', async () => {
    mockOk(response);
    const result = await joinEvent('TESTCODE', 'jane@test.com', 'dev-001');
    expect(result.event.eventCode).toBe('TESTCODE');
    expect(result.team.name).toBe('Eagles');
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
    expect(opts).toBeUndefined();
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
    { holeNumber: 2, grossScore: 3, putts: 1, playerShots: { 'p1': 2, 'p2': 1 }, clientTimestampMs: 1_700_000_001_000 },
  ];

  const syncResponse = { accepted: 2, conflicts: 0, conflictDetails: [] };

  it('sends POST to /sync/scores with correct envelope', async () => {
    mockOk(syncResponse);
    await batchSync('ev1', 'tm1', 'dev-001', scores);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/sync/scores');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body.eventId).toBe('ev1');
    expect(body.teamId).toBe('tm1');
    expect(body.deviceId).toBe('dev-001');
    expect(body.scores).toHaveLength(2);
  });

  it('includes playerShots in the score payload (Bug #1 regression)', async () => {
    mockOk(syncResponse);
    await batchSync('ev1', 'tm1', 'dev-001', scores);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // Hole 2 has playerShots
    const hole2 = body.scores.find((s: { holeNumber: number }) => s.holeNumber === 2);
    expect(hole2.playerShots).toEqual({ p1: 2, p2: 1 });
  });

  it('sends null for playerShots when not provided', async () => {
    mockOk(syncResponse);
    await batchSync('ev1', 'tm1', 'dev-001', scores);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const hole1 = body.scores.find((s: { holeNumber: number }) => s.holeNumber === 1);
    expect(hole1.playerShots).toBeNull();
  });

  it('returns the batch sync response', async () => {
    mockOk(syncResponse);
    const result = await batchSync('ev1', 'tm1', 'dev-001', scores);
    expect(result.accepted).toBe(2);
    expect(result.conflicts).toBe(0);
  });

  it('throws when the server returns a sync error', async () => {
    mockErr(409, { error: 'Score conflict detected' });
    await expect(batchSync('ev1', 'tm1', 'dev-001', scores)).rejects.toThrow('Score conflict detected');
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
    expect(opts).toBeUndefined();
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
    await placeBid('item1', 'pl1', 8000);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auction/items/item1/bid');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toMatchObject({ playerId: 'pl1', amountCents: 8000 });
  });

  it('returns the bid response on success', async () => {
    mockOk(BID_RESPONSE);
    const result = await placeBid('item1', 'pl1', 8000);
    expect(result.isWinning).toBe(true);
    expect(result.amountCents).toBe(8000);
  });

  it('throws BID_TOO_LOW when server rejects the amount', async () => {
    mockErr(400, { error: 'BID_TOO_LOW:8500' });
    await expect(placeBid('item1', 'pl1', 500)).rejects.toThrow('BID_TOO_LOW:8500');
  });

  it('throws AUCTION_CLOSED when bidding on a closed item', async () => {
    mockErr(400, { error: 'AUCTION_CLOSED' });
    await expect(placeBid('item1', 'pl1', 9000)).rejects.toThrow('AUCTION_CLOSED');
  });

  it('includes newClosesAt in response when bid triggered an extension', async () => {
    mockOk({ ...BID_RESPONSE, newClosesAt: '2026-06-01T20:00:30Z' });
    const result = await placeBid('item1', 'pl1', 8000);
    expect(result.newClosesAt).toBe('2026-06-01T20:00:30Z');
  });
});

// ── pledge ────────────────────────────────────────────────────────────────────

describe('pledge', () => {
  it('sends POST to /auction/items/{id}/pledge (not /bid)', async () => {
    mockOk(BID_RESPONSE);
    await pledge('item1', 'pl1', 10000);
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auction/items/item1/pledge');
    expect(url).not.toContain('/bid');
  });

  it('sends playerId and amountCents in body', async () => {
    mockOk(BID_RESPONSE);
    await pledge('item1', 'pl1', 10000);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ playerId: 'pl1', amountCents: 10000 });
  });

  it('throws when the pledge amount is below the minimum', async () => {
    mockErr(400, { error: 'BID_TOO_LOW:2500' });
    await expect(pledge('item1', 'pl1', 100)).rejects.toThrow('BID_TOO_LOW:2500');
  });
});

// ── createSetupIntent ─────────────────────────────────────────────────────────

describe('createSetupIntent', () => {
  it('sends POST to /payments/setup-intent with playerId', async () => {
    mockOk({ clientSecret: 'seti_abc_secret_xyz' });
    await createSetupIntent('pl1');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/payments/setup-intent');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toMatchObject({ playerId: 'pl1' });
  });

  it('returns the clientSecret on success', async () => {
    mockOk({ clientSecret: 'seti_abc_secret_xyz' });
    const result = await createSetupIntent('pl1');
    expect(result.clientSecret).toBe('seti_abc_secret_xyz');
  });

  it('throws when player is not found', async () => {
    mockErr(404, { error: 'Player not found' });
    await expect(createSetupIntent('bad-id')).rejects.toThrow('Player not found');
  });
});

// ── confirmSetup ──────────────────────────────────────────────────────────────

describe('confirmSetup', () => {
  it('sends POST to /payments/confirm-setup with playerId and setupIntentId', async () => {
    mockOk({ hasPaymentMethod: true });
    await confirmSetup('pl1', 'seti_abc123');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/payments/confirm-setup');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toMatchObject({
      playerId: 'pl1', setupIntentId: 'seti_abc123',
    });
  });

  it('returns hasPaymentMethod: true on success', async () => {
    mockOk({ hasPaymentMethod: true });
    const result = await confirmSetup('pl1', 'seti_abc123');
    expect(result.hasPaymentMethod).toBe(true);
  });

  it('throws when the SetupIntent has not succeeded yet', async () => {
    mockErr(400, { error: "SetupIntent status is 'requires_action', expected 'succeeded'." });
    await expect(confirmSetup('pl1', 'seti_abc123')).rejects.toThrow("requires_action");
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
    await fetchPlayerBidHistory('pl1');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toContain('/players/pl1/bids');
    expect(opts).toBeUndefined();
  });

  it('returns the bid history array', async () => {
    mockOk([historyItem]);
    const result = await fetchPlayerBidHistory('pl1');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('Winning');
  });

  it('returns an empty array when the player has no bids', async () => {
    mockOk([]);
    const result = await fetchPlayerBidHistory('pl1');
    expect(result).toHaveLength(0);
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
