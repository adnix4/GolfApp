/**
 * Translate API/network errors into copy a non-technical user can act on.
 *
 * Lifted from events/index.tsx so any admin screen can give consistent
 * error messaging. Pair with the shared ApiError class:
 *
 *   try { await eventsApi.create(payload); }
 *   catch (e) { setError(friendlyApiError(e)); }
 */

import { describeFailure, type FailureOverrides } from '@gfp/shared-types';

/** Kept for existing callers; the rules live in describeFailure. */
export type FriendlyErrorOverrides = FailureOverrides;

/**
 * Plain-English copy for inline error text. Failure *popups* use
 * alertFailure (lib/dialog.tsx), which also shows the code in dev builds.
 * The default 409 copy is event-name-specific — the only 409 the events
 * endpoints emit today; pass `conflict` to override.
 */
export function friendlyApiError(e: unknown, overrides?: FriendlyErrorOverrides): string {
  return describeFailure(e, { dev: false, overrides }).message;
}
