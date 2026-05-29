/**
 * Translate API/network errors into copy a non-technical user can act on.
 *
 * Lifted from events/index.tsx so any admin screen can give consistent
 * error messaging. Pair with the shared ApiError class:
 *
 *   try { await eventsApi.create(payload); }
 *   catch (e) { setError(friendlyApiError(e)); }
 */

/**
 * The 409 case is intentionally event-name-specific — that's the only 409
 * the events endpoints emit today. Caller can override via `messages`.
 */
export interface FriendlyErrorOverrides {
  /** Replace the default copy for a specific status code. */
  byStatus?: Record<number, string>;
  /** Append context to the default 409 conflict copy. */
  conflict?: string;
}

const DEFAULTS: Record<number, string> = {
  400: 'Some entries are invalid. Check the form and try again.',
  401: 'Your session has expired. Please log in again.',
  403: "You don't have permission to perform that action.",
  404: "We couldn't find what you were looking for.",
  409: 'An event with that name already exists for your organization.',
};

export function friendlyApiError(e: unknown, overrides?: FriendlyErrorOverrides): string {
  // Network errors land here first — fetch throws TypeError when offline / DNS fails.
  if (e instanceof TypeError && String(e.message).toLowerCase().includes('fetch')) {
    return 'Unable to reach the server. Check your internet connection.';
  }

  if (e && typeof e === 'object') {
    const err = e as { status?: number; code?: string; message?: string };

    if (err.status) {
      const custom = overrides?.byStatus?.[err.status];
      if (custom) return custom;
      if (err.status === 409 && overrides?.conflict) return overrides.conflict;

      const def = DEFAULTS[err.status];
      if (def) return def;

      if (err.status >= 500) {
        return 'The server encountered an error. Please try again in a moment.';
      }
    }

    if (err.message) return err.message;
  }

  return 'Something went wrong. Please try again.';
}
