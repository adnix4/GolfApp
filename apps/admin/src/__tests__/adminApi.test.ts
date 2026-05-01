import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage so we never touch localStorage in tests
const mockStorage = {
  getAccessToken:  vi.fn(() => null as string | null),
  getRefreshToken: vi.fn(() => null as string | null),
  setAccessToken:  vi.fn(),
  setRefreshToken: vi.fn(),
  clearTokens:     vi.fn(),
};

vi.mock('@/lib/storage', () => ({ storage: mockStorage }));

import { authApi, eventsApi, teamsApi, challengesApi, ApiError } from '../lib/api';

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
    try {
      await authApi.login('a@b.com', 'wrong');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(401);
      expect(apiErr.message).toBe('Bad password');
      expect(apiErr.code).toBe('INVALID_CREDENTIALS');
    }
  });

  it('falls back to HTTP status in message when error body is not JSON', async () => {
    mockErrNoJson(500);
    try {
      await authApi.login('a@b.com', 'pw');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(500);
      expect(apiErr.message).toContain('500');
    }
  });
});

// ── 401 auto-refresh flow ─────────────────────────────────────────────────────

describe('401 auto-refresh', () => {
  it('retries the original request after a successful token refresh', async () => {
    mockStorage.getAccessToken.mockReturnValue('old-token');
    mockStorage.getRefreshToken.mockReturnValue('ref-token');

    // First call → 401
    mockErr(401);
    // Refresh → 200 with new token
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve({ accessToken: 'new-acc', refreshToken: 'new-ref' }),
    });
    // Retry → 200
    mockOk([]);

    mockStorage.getAccessToken.mockReturnValue('new-acc'); // after refresh
    const result = await eventsApi.list();
    expect(result).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(3); // original + refresh + retry
  });

  it('clears tokens and throws UNAUTHORIZED when refresh itself fails', async () => {
    mockStorage.getAccessToken.mockReturnValue('old-token');
    mockStorage.getRefreshToken.mockReturnValue('ref-token');

    mockErr(401);
    // Refresh → 401
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) });

    try {
      await eventsApi.list();
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(401);
      expect(apiErr.code).toBe('UNAUTHORIZED');
      expect(mockStorage.clearTokens).toHaveBeenCalled();
    }
  });

  it('does NOT clear tokens when retry returns 403 (Bug #3 regression)', async () => {
    mockStorage.getAccessToken.mockReturnValue('old-token');
    mockStorage.getRefreshToken.mockReturnValue('ref-token');

    mockErr(401);
    // Refresh succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve({ accessToken: 'new-acc' }),
    });
    // Retry returns 403 (forbidden — valid session, wrong permission)
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 403,
      json: () => Promise.resolve({ code: 'FORBIDDEN', error: 'Not authorized' }),
    });

    mockStorage.getAccessToken.mockReturnValue('new-acc');
    try {
      await eventsApi.list();
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(403);   // must preserve the real error status
      expect(mockStorage.clearTokens).not.toHaveBeenCalled(); // must NOT clear tokens
    }
  });

  it('skips refresh when no refresh token is stored', async () => {
    mockStorage.getAccessToken.mockReturnValue('acc');
    mockStorage.getRefreshToken.mockReturnValue(null);
    mockErr(401);
    await expect(eventsApi.list()).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(mockFetch).toHaveBeenCalledTimes(1); // no refresh attempt
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
