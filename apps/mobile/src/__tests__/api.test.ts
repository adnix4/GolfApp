import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock authStore before importing api (api reads the store at call-time via getState())
vi.mock('@/lib/authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ accessToken: null })),
  },
}));

import { joinEvent, fetchLeaderboard, batchSync, checkConnectivity } from '../lib/api';
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
