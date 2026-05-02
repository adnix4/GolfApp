import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock() is hoisted above const declarations, so use vi.hoisted() to create
// mockStorage before the factory runs — prevents TDZ ReferenceError.
// Use relative path (not @/ alias) so Vitest matches api.ts's './storage' import.
const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    getAccessToken:  vi.fn(() => null as string | null),
    getRefreshToken: vi.fn(() => null as string | null),
    setAccessToken:  vi.fn(),
    setRefreshToken: vi.fn(),
    clearTokens:     vi.fn(),
  },
}));

vi.mock('../lib/storage', () => ({ storage: mockStorage }));

import { authApi, eventsApi, teamsApi, challengesApi, auctionApi, ApiError } from '../lib/api';

// ── fetch mock ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function mockOk(body: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: true, status,
    json: () => Promise.resolve(body),
  });
}

function mockErr(status: number, body: unknown = {}) {
  mockFetch.mockResolvedValueOnce({
    ok: false, status,
    json: () => Promise.resolve(body),
  });
}

function mockErrNoJson(status: number) {
  mockFetch.mockResolvedValueOnce({
    ok: false, status,
    json: () => Promise.reject(new Error('Not JSON')),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStorage.getAccessToken.mockReturnValue(null);
  mockStorage.getRefreshToken.mockReturnValue(null);
});

// ── authApi.login ─────────────────────────────────────────────────────────────

describe('authApi.login', () => {
  it('sends POST with email and password', async () => {
    mockOk({ accessToken: 'acc', refreshToken: 'ref', orgId: 'org1' });
    await authApi.login('admin@test.com', 'password123');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auth/login');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toMatchObject({
      email: 'admin@test.com', password: 'password123',
    });
  });

  it('does not include Authorization header (public endpoint)', async () => {
    mockOk({ accessToken: 'acc', refreshToken: 'ref', orgId: 'org1' });
    await authApi.login('a@b.com', 'pw');
    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('throws ApiError on 401', async () => {
    mockErr(401, { code: 'INVALID_CREDENTIALS', error: 'Bad password' });
    await expect(authApi.login('a@b.com', 'wrong')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError with correct status and message', async () => {
    mockErr(401, { code: 'INVALID_CREDENTIALS', error: 'Bad password' });
    await expect(authApi.login('a@b.com', 'wrong')).rejects.toMatchObject({
      status:  401,
      message: 'Bad password',
      code:    'INVALID_CREDENTIALS',
    });
  });

  it('falls back to HTTP status in message when error body is not JSON', async () => {
    mockErrNoJson(500);
    await expect(authApi.login('a@b.com', 'pw')).rejects.toMatchObject({ status: 500 });
  });
});

// ── 401 auto-refresh flow ─────────────────────────────────────────────────────

describe('401 auto-refresh', () => {
  it('retries the original request after a successful token refresh', async () => {
    mockStorage.getAccessToken.mockReturnValue('old-token');
    mockStorage.getRefreshToken.mockReturnValue('ref-token');

    mockErr(401);
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve({ accessToken: 'new-acc', refreshToken: 'new-ref' }),
    });
    mockOk([]);

    mockStorage.getAccessToken.mockReturnValue('new-acc');
    const result = await eventsApi.list();
    expect(result).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('clears tokens and throws UNAUTHORIZED when refresh itself fails', async () => {
    mockStorage.getAccessToken.mockReturnValue('old-token');
    mockStorage.getRefreshToken.mockReturnValue('ref-token');

    mockErr(401);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) });

    await expect(eventsApi.list()).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(mockStorage.clearTokens).toHaveBeenCalled();
  });

  it('does NOT clear tokens when retry returns 403 (Bug #3 regression)', async () => {
    mockStorage.getAccessToken.mockReturnValue('old-token');
    mockStorage.getRefreshToken.mockReturnValue('ref-token');

    mockErr(401);
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve({ accessToken: 'new-acc' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 403,
      json: () => Promise.resolve({ code: 'FORBIDDEN', error: 'Not authorized' }),
    });

    mockStorage.getAccessToken.mockReturnValue('new-acc');
    await expect(eventsApi.list()).rejects.toMatchObject({ status: 403 });
    expect(mockStorage.clearTokens).not.toHaveBeenCalled();
  });

  it('skips refresh when no refresh token is stored', async () => {
    mockStorage.getAccessToken.mockReturnValue('acc');
    mockStorage.getRefreshToken.mockReturnValue(null);
    mockErr(401);
    await expect(eventsApi.list()).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockStorage.clearTokens).toHaveBeenCalled();
  });
});

// ── 204 No Content ─────────────────────────────────────────────────────────────

describe('204 No Content handling', () => {
  it('returns undefined for a 204 response without throwing', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: vi.fn() });
    const result = await eventsApi.assignShotgun('ev1', []);
    expect(result).toBeUndefined();
  });
});

// ── challengesApi ─────────────────────────────────────────────────────────────

describe('challengesApi', () => {
  it('upsert sends PUT to the correct hole endpoint', async () => {
    mockOk({ holeNumber: 5, description: 'Closest to Pin', sponsorName: null, winnerId: null, winnerName: null });
    await challengesApi.upsert('ev1', 5, { description: 'Closest to Pin' });
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/challenges/5');
    expect(opts.method).toBe('PUT');
  });

  it('remove sends DELETE to the correct endpoint', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: vi.fn() });
    await challengesApi.remove('ev1', 7);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/challenges/7');
    expect(opts.method).toBe('DELETE');
  });
});

// ── teamsApi.markFeePaid ──────────────────────────────────────────────────────

describe('teamsApi.markFeePaid', () => {
  it('sends POST to the fee-paid endpoint', async () => {
    const team = { id: 't1', name: 'Eagles', entryFeePaid: true, maxPlayers: 4, checkInStatus: 'pending', players: [], eventId: 'ev1', startingHole: null, teeTime: null };
    mockOk(team);
    await teamsApi.markFeePaid('ev1', 't1');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/teams/t1/fee-paid');
    expect(opts.method).toBe('POST');
  });
});

// ── auctionApi ────────────────────────────────────────────────────────────────

const AUCTION_ITEM = {
  id: 'item1', eventId: 'ev1', title: 'Golf Bag', description: 'A nice bag',
  photoUrls: [] as string[], auctionType: 'Silent', status: 'Open',
  startingBidCents: 5000, bidIncrementCents: 500, buyNowPriceCents: null,
  currentHighBidCents: 7500, closesAt: '2026-06-01T20:00:00Z',
  maxExtensionMin: 10, donationDenominations: null, minimumBidCents: null,
  fairMarketValueCents: 5000, goalCents: null, totalRaisedCents: 7500,
};

const SESSION = {
  id: 'sess1', eventId: 'ev1', isActive: true,
  currentItemId: 'item1', currentCalledAmountCents: 15000,
  startedAt: '2026-06-01T18:00:00Z', endedAt: null,
};

describe('auctionApi.createItem', () => {
  it('sends POST to the auction items endpoint with the payload', async () => {
    mockOk(AUCTION_ITEM);
    await auctionApi.createItem('ev1', {
      title: 'Golf Bag', description: 'A nice bag',
      auctionType: 'Silent', startingBidCents: 5000,
      fairMarketValueCents: 5000,
    });
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/events/ev1/auction/items');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body.title).toBe('Golf Bag');
    expect(body.auctionType).toBe('Silent');
    expect(body.startingBidCents).toBe(5000);
  });

  it('returns the created AuctionItem on success', async () => {
    mockOk(AUCTION_ITEM);
    const item = await auctionApi.createItem('ev1', {
      title: 'Golf Bag', auctionType: 'Silent',
      startingBidCents: 5000, fairMarketValueCents: 5000,
      description: '',
    });
    expect(item.id).toBe('item1');
    expect(item.status).toBe('Open');
  });

  it('throws ApiError on validation failure', async () => {
    mockErr(400, { code: 'VALIDATION_ERROR', error: 'Title is required' });
    await expect(auctionApi.createItem('ev1', {
      title: '', auctionType: 'Silent', startingBidCents: 0,
      fairMarketValueCents: 0, description: '',
    })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('auctionApi.updateItem', () => {
  it('sends PATCH to the specific item endpoint', async () => {
    mockOk({ ...AUCTION_ITEM, title: 'Updated Bag' });
    await auctionApi.updateItem('ev1', 'item1', { title: 'Updated Bag' });
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/events/ev1/auction/items/item1');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body as string)).toMatchObject({ title: 'Updated Bag' });
  });
});

describe('auctionApi.deleteItem', () => {
  it('sends DELETE to the specific item endpoint', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: vi.fn() });
    await auctionApi.deleteItem('ev1', 'item1');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/events/ev1/auction/items/item1');
    expect(opts.method).toBe('DELETE');
  });

  it('throws when trying to delete a closed item', async () => {
    mockErr(400, { code: 'VALIDATION_ERROR', error: 'Cannot delete a closed auction item.' });
    await expect(auctionApi.deleteItem('ev1', 'item1')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('auctionApi.awardItem', () => {
  it('sends POST to /auction/items/{id}/award with playerId and amountCents', async () => {
    mockOk({ awarded: true });
    await auctionApi.awardItem('item1', 'pl1', 25000);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auction/items/item1/award');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toMatchObject({ playerId: 'pl1', amountCents: 25000 });
  });

  it('returns { awarded: true } on success', async () => {
    mockOk({ awarded: true });
    const result = await auctionApi.awardItem('item1', 'pl1', 25000);
    expect(result.awarded).toBe(true);
  });

  it('throws when the item is already closed', async () => {
    mockErr(400, { code: 'VALIDATION_ERROR', error: 'Item is already closed.' });
    await expect(auctionApi.awardItem('item1', 'pl1', 25000)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('auctionApi.updateCalledAmount', () => {
  it('sends POST to /events/{id}/auction/sessions/called-amount with amountCents', async () => {
    mockOk(SESSION);
    await auctionApi.updateCalledAmount('ev1', 20000);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/events/ev1/auction/sessions/called-amount');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toMatchObject({ amountCents: 20000 });
  });

  it('returns the updated session', async () => {
    mockOk({ ...SESSION, currentCalledAmountCents: 20000 });
    const result = await auctionApi.updateCalledAmount('ev1', 20000);
    expect(result.currentCalledAmountCents).toBe(20000);
  });
});

describe('auctionApi.getActiveSession', () => {
  it('returns the session when one is active', async () => {
    mockOk(SESSION);
    const result = await auctionApi.getActiveSession('ev1');
    expect(result).not.toBeNull();
    expect(result!.isActive).toBe(true);
    expect(result!.currentItemId).toBe('item1');
  });

  it('returns null on 204 (no active session)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: vi.fn() });
    const result = await auctionApi.getActiveSession('ev1');
    expect(result).toBeNull();
  });
});

describe('auctionApi.startSession', () => {
  it('sends POST to /events/{id}/auction/sessions/start', async () => {
    mockOk(SESSION);
    await auctionApi.startSession('ev1');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/events/ev1/auction/sessions/start');
    expect(opts.method).toBe('POST');
  });

  it('returns the new session', async () => {
    mockOk(SESSION);
    const result = await auctionApi.startSession('ev1');
    expect(result.isActive).toBe(true);
    expect(result.eventId).toBe('ev1');
  });
});

describe('auctionApi.nextItem', () => {
  it('sends POST to /events/{id}/auction/sessions/next-item', async () => {
    mockOk({ ...SESSION, currentItemId: 'item2' });
    await auctionApi.nextItem('ev1');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/events/ev1/auction/sessions/next-item');
    expect(opts.method).toBe('POST');
  });

  it('returns the session with the new currentItemId', async () => {
    mockOk({ ...SESSION, currentItemId: 'item2', currentCalledAmountCents: 5000 });
    const result = await auctionApi.nextItem('ev1');
    expect(result.currentItemId).toBe('item2');
    expect(result.currentCalledAmountCents).toBe(5000);
  });
});
