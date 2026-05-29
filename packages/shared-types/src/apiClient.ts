/**
 * Shared API client primitives.
 *
 * Two consumers:
 * - apps/admin uses createApiClient({ storage, refreshPath }) for the full
 *   authed request<T> wrapper with silent 401 refresh.
 * - apps/mobile uses parseApiError(response) inline in each fetch — most of
 *   mobile's endpoints are public, so the full client is overkill.
 *
 * Both share the same ApiError shape so error handling code (e.g.
 * friendlyApiError) works the same regardless of which surface threw.
 */

/**
 * Structured error thrown by the shared client.
 * `status` is the HTTP status; `code` is the API's error code string
 * (defaults to 'UNKNOWN_ERROR' when the server omits one).
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code:   string,
    message:                string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Read a non-OK fetch Response and produce an ApiError describing it.
 *
 * Handles three server body shapes:
 * - `{ error: "..." , code?: "..." }`  — GFP API's standard error response
 * - `{ title, errors }`                — ASP.NET Core ValidationProblemDetails
 * - non-JSON / empty                   — falls back to "HTTP {status}"
 */
export async function parseApiError(res: Response): Promise<ApiError> {
  let code = 'UNKNOWN_ERROR';
  let message = `HTTP ${res.status}`;
  try {
    const body: any = await res.json();
    code = body.code ?? code;
    if (body.error) {
      message = body.error;
    } else if (body.title) {
      const fieldErrors = body.errors
        ? Object.entries(body.errors as Record<string, string[]>)
            .map(([f, msgs]) => `${f}: ${(msgs as string[]).join(', ')}`)
            .join('; ')
        : null;
      message = fieldErrors ? `${body.title} — ${fieldErrors}` : body.title;
    } else if (body.detail) {
      message = body.detail;
    }
  } catch {
    /* non-JSON body — keep the HTTP status fallback */
  }
  return new ApiError(res.status, code, message);
}

/**
 * Storage adapter for the authed client. Sync or async, both are awaited.
 * Admin uses a synchronous localStorage-backed implementation; mobile
 * could wrap expo-secure-store the same way if it adopts the full client.
 */
export interface TokenStorage {
  getAccessToken():  string | null | Promise<string | null>;
  setAccessToken(token: string): void | Promise<void>;
  getRefreshToken(): string | null | Promise<string | null>;
  setRefreshToken(token: string): void | Promise<void>;
  clearTokens(): void | Promise<void>;
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?:   unknown;
  /** Skip the Authorization header and the 401-refresh dance. */
  public?: boolean;
}

export interface ApiClient {
  /** Issue an authed fetch. Throws ApiError on non-2xx. */
  request<T = unknown>(path: string, opts?: RequestOptions): Promise<T>;
  /** Resolve a relative path against the configured base URL. */
  resolveUrl(urlOrPath: string): string;
}

export interface CreateApiClientOptions {
  /** Base URL (e.g. 'https://api.example.com'). No trailing slash. */
  baseUrl: string;
  /** Token storage. Omit for a public-only client (no auth). */
  storage?: TokenStorage;
  /** Path to POST { refreshToken } to. Default '/api/v1/auth/refresh'. */
  refreshPath?: string;
}

/**
 * Build an API client bound to a base URL and (optionally) a token store.
 *
 * On 401 with a non-public call, the client attempts a silent refresh and
 * retries the original request once. If the retry returns:
 * - 2xx: returned as the original request would have been
 * - non-2xx, non-401: thrown as an ApiError (session stays valid)
 * - 401 or refresh failure: tokens cleared and an "expired" ApiError thrown
 */
export function createApiClient(opts: CreateApiClientOptions): ApiClient {
  const { baseUrl, storage, refreshPath = '/api/v1/auth/refresh' } = opts;

  function resolveUrl(urlOrPath: string): string {
    return urlOrPath.startsWith('/') ? `${baseUrl}${urlOrPath}` : urlOrPath;
  }

  async function buildHeaders(isPublic: boolean): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!isPublic && storage) {
      const token = await storage.getAccessToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async function tryRefresh(): Promise<boolean> {
    if (!storage) return false;
    const refreshToken = await storage.getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${baseUrl}${refreshPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data: any = await res.json();
      await storage.setAccessToken(data.accessToken);
      if (data.refreshToken) await storage.setRefreshToken(data.refreshToken);
      return true;
    } catch {
      return false;
    }
  }

  async function parseSuccess<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  }

  async function request<T = unknown>(
    path: string,
    reqOpts: RequestOptions = {},
  ): Promise<T> {
    const { method = 'GET', body, public: isPublic = false } = reqOpts;
    const headers = await buildHeaders(isPublic);
    const init: RequestInit = {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };

    const res = await fetch(`${baseUrl}${path}`, init);

    if (res.status === 401 && !isPublic && storage) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        const newToken = await storage.getAccessToken();
        if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
        const retry = await fetch(`${baseUrl}${path}`, { ...init, headers });
        if (retry.ok) return parseSuccess<T>(retry);
        // Non-401 on retry means the session is fine; the request itself failed.
        if (retry.status !== 401) throw await parseApiError(retry);
      }
      // Refresh failed or retry returned 401 — kill the session.
      await storage.clearTokens();
      throw new ApiError(401, 'UNAUTHORIZED', 'Session expired. Please log in again.');
    }

    if (!res.ok) throw await parseApiError(res);
    return parseSuccess<T>(res);
  }

  return { request, resolveUrl };
}
