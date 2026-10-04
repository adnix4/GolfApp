import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  deviceHeaders, fetchActiveEvents, fetchPublicEvent, fetchPublicEventStatus, fetchPublicLeaderboard,
} from '../api';

// BASE defaults to the local API when NEXT_PUBLIC_API_URL is unset (as here).
const API = 'http://localhost:5000';

function stubFetch(impl: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn((url: string) => Promise.resolve(impl(url)));
  vi.stubGlobal('fetch', fn);
  return fn;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => { vi.unstubAllGlobals(); });

describe('fetchPublicEvent', () => {
  const event = {
    status: 'Registration',
    resolvedLogoUrl: '/uploads/event-logos/a.png',
    sponsors: [
      { name: 'Local', logoUrl: '/uploads/sponsor-logos/b.png' },
      { name: 'Blob',  logoUrl: 'https://r2.example/c.png' },
    ],
  };

  it('lowercases the status every /e/… page branches on', async () => {
    stubFetch(() => json(event));
    expect((await fetchPublicEvent('ABC'))?.status).toBe('registration');
  });

  // The bug this guards: rendering "/uploads/…" raw resolves it against the web
  // app's own origin and 404s (it hit every relative logo across admin + web).
  it('absolutizes root-relative upload URLs against the API, leaves absolute ones alone', async () => {
    stubFetch(() => json(event));
    const e = await fetchPublicEvent('ABC');
    expect(e?.resolvedLogoUrl).toBe(`${API}/uploads/event-logos/a.png`);
    expect(e?.sponsors.map(s => s.logoUrl)).toEqual([
      `${API}/uploads/sponsor-logos/b.png`,
      'https://r2.example/c.png',
    ]);
  });

  it('keeps a missing logo null instead of inventing a URL', async () => {
    stubFetch(() => json({ ...event, resolvedLogoUrl: null }));
    expect((await fetchPublicEvent('ABC'))?.resolvedLogoUrl).toBeNull();
  });

  it('returns null for an unknown event code', async () => {
    stubFetch(() => json({}, 404));
    expect(await fetchPublicEvent('NOPE')).toBeNull();
  });

  it('returns null rather than throwing on a server error or network failure', async () => {
    stubFetch(() => json({}, 500));
    expect(await fetchPublicEvent('ABC')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await fetchPublicEvent('ABC')).toBeNull();
  });

  it('requests the public event by code from the API', async () => {
    const fetchFn = stubFetch(() => json(event));
    await fetchPublicEvent('XY12');
    expect(fetchFn.mock.calls[0][0]).toBe(`${API}/api/v1/pub/events/XY12`);
  });
});

describe('fetchPublicLeaderboard', () => {
  it('lowercases status and absolutizes the logo', async () => {
    stubFetch(() => json({ status: 'Scoring', resolvedLogoUrl: '/uploads/x.png', standings: [] }));
    const board = await fetchPublicLeaderboard('ABC');
    expect(board).toMatchObject({ status: 'scoring', resolvedLogoUrl: `${API}/uploads/x.png` });
  });

  it('returns null on any failure', async () => {
    stubFetch(() => json({}, 503));
    expect(await fetchPublicLeaderboard('ABC')).toBeNull();
  });
});

describe('fetchActiveEvents', () => {
  it('absolutizes each listing logo', async () => {
    stubFetch(() => json([{ eventCode: 'A', logoUrl: '/uploads/a.png' }, { eventCode: 'B', logoUrl: null }]));
    const events = await fetchActiveEvents();
    expect(events.map(e => e.logoUrl)).toEqual([`${API}/uploads/a.png`, null]);
  });

  it('degrades to an empty directory instead of breaking the page', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('down'))));
    expect(await fetchActiveEvents()).toEqual([]);
    stubFetch(() => json({}, 500));
    expect(await fetchActiveEvents()).toEqual([]);
  });
});

describe('fetchPublicEventStatus', () => {
  it('returns null on failure, which the scoreboard treats as "nothing changed"', async () => {
    stubFetch(() => json({}, 429));
    expect(await fetchPublicEventStatus('ABC')).toBeNull();
  });
});

describe('deviceHeaders', () => {
  // Server-rendered calls come from the web server's own address; a
  // per-browser id would be meaningless there and localStorage would throw.
  it('is empty during SSR (no window)', () => {
    expect(typeof window).toBe('undefined');
    expect(deviceHeaders()).toEqual({});
  });
});
