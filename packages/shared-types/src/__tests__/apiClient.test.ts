import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ApiError, parseApiError, createApiClient, resolveMediaUrl, type TokenStorage,
} from '../apiClient';

function mockResponse(body: unknown, status = 200, jsonRejects = false): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => jsonRejects
      ? Promise.reject(new Error('not json'))
      : Promise.resolve(body),
  } as unknown as Response;
}

describe('parseApiError', () => {
  it('extracts { error, code } from GFP-style error bodies', async () => {
    const e = await parseApiError(mockResponse({ error: 'Name taken', code: 'NAME_EXISTS' }, 409));
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(409);
    expect(e.code).toBe('NAME_EXISTS');
    expect(e.message).toBe('Name taken');
  });

  it('expands ASP.NET ValidationProblemDetails fields', async () => {
    const e = await parseApiError(mockResponse({
      title: 'One or more validation errors occurred',
      errors: { Name: ['required'], Email: ['must be valid', 'too long'] },
    }, 400));
    expect(e.message).toMatch(/Name: required/);
    expect(e.message).toMatch(/Email: must be valid, too long/);
  });

  it('falls back to HTTP status when body is not JSON', async () => {
    const e = await parseApiError(mockResponse(null, 500, true));
    expect(e.message).toBe('HTTP 500');
    expect(e.code).toBe('UNKNOWN_ERROR');
  });

  it('uses { detail } when no other fields present', async () => {
    const e = await parseApiError(mockResponse({ detail: 'Upload too large' }, 413));
    expect(e.message).toBe('Upload too large');
  });
});

describe('createApiClient', () => {
  const baseUrl = 'https://api.test';

  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  function makeStorage(initial: { access?: string; refresh?: string } = {}): TokenStorage {
    let access = initial.access ?? null;
    let refresh = initial.refresh ?? null;
    return {
      getAccessToken:  () => access,
      setAccessToken:  (t) => { access = t; },
      getRefreshToken: () => refresh,
      setRefreshToken: (t) => { refresh = t; },
      clearTokens:     () => { access = null; refresh = null; },
    };
  }

  it('attaches Bearer header for authed calls', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
    const client = createApiClient({ baseUrl, storage: makeStorage({ access: 'TOKEN' }) });
    await client.request('/api/v1/events');
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN');
  });

  it('omits Bearer header for public:true calls', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
    const client = createApiClient({ baseUrl, storage: makeStorage({ access: 'TOKEN' }) });
    await client.request('/api/v1/pub/events', { public: true });
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('retries with refreshed token on 401 and returns retried response', async () => {
    const storage = makeStorage({ access: 'OLD', refresh: 'REFRESH' });
    fetchMock
      .mockResolvedValueOnce(mockResponse({}, 401))                                  // initial call
      .mockResolvedValueOnce(mockResponse({ accessToken: 'NEW' }, 200))              // refresh
      .mockResolvedValueOnce(mockResponse({ value: 42 }, 200));                      // retry

    const client = createApiClient({ baseUrl, storage });
    const result = await client.request<{ value: number }>('/api/v1/protected');
    expect(result.value).toBe(42);
    expect(await storage.getAccessToken()).toBe('NEW');
  });

  it('clears tokens + throws 401 when refresh fails', async () => {
    const storage = makeStorage({ access: 'OLD', refresh: 'REFRESH' });
    fetchMock
      .mockResolvedValueOnce(mockResponse({}, 401))                                  // initial call
      .mockResolvedValueOnce(mockResponse({}, 400));                                 // refresh fails

    const client = createApiClient({ baseUrl, storage });
    await expect(client.request('/api/v1/protected')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(await storage.getAccessToken()).toBeNull();
  });

  it('throws ApiError on non-2xx without attempting refresh on public calls', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ error: 'Not found' }, 404));
    const client = createApiClient({ baseUrl, storage: makeStorage() });
    await expect(client.request('/api/v1/pub/x', { public: true })).rejects.toMatchObject({
      status: 404,
      message: 'Not found',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns undefined for 204 No Content', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({}, 204));
    const client = createApiClient({ baseUrl });
    const result = await client.request('/api/v1/pub/ping', { public: true });
    expect(result).toBeUndefined();
  });

  it('resolveUrl handles relative and absolute URLs', () => {
    const client = createApiClient({ baseUrl });
    expect(client.resolveUrl('/api/v1/x')).toBe('https://api.test/api/v1/x');
    expect(client.resolveUrl('https://cdn.test/img.png')).toBe('https://cdn.test/img.png');
  });
});

describe('resolveMediaUrl', () => {
  const BASE = 'http://localhost:5000';

  // The bug this exists to prevent: normalising logos to our own storage turned
  // every logo URL root-relative, and the admin, web and mobile render sites all
  // passed them straight to <img>/<Image>. They then resolved against whichever
  // origin the app was served from — not the API — and 404'd into a blank frame.
  it('prefixes a root-relative upload path with the API base', () => {
    expect(resolveMediaUrl('/uploads/sponsor-logos/abc.png', BASE))
      .toBe('http://localhost:5000/uploads/sponsor-logos/abc.png');
  });

  it('leaves an absolute URL alone', () => {
    const external = 'https://res.cloudinary.com/x/image/upload/abc';
    expect(resolveMediaUrl(external, BASE)).toBe(external);
  });

  it('leaves a data URI alone', () => {
    expect(resolveMediaUrl('data:image/png;base64,AAAA', BASE))
      .toBe('data:image/png;base64,AAAA');
  });

  it('does not double the slash when the base has a trailing one', () => {
    expect(resolveMediaUrl('/uploads/a.png', 'http://localhost:5000/'))
      .toBe('http://localhost:5000/uploads/a.png');
  });

  it('returns an empty string for null, undefined or blank', () => {
    expect(resolveMediaUrl(null, BASE)).toBe('');
    expect(resolveMediaUrl(undefined, BASE)).toBe('');
    expect(resolveMediaUrl('', BASE)).toBe('');
  });
});
