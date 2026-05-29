import { describe, it, expect } from 'vitest';
import { friendlyApiError } from '../lib/errors';

describe('friendlyApiError', () => {
  it('returns a session-expired message for 401', () => {
    expect(friendlyApiError({ status: 401 })).toMatch(/session/i);
  });

  it('returns the default 409 conflict copy', () => {
    expect(friendlyApiError({ status: 409 })).toMatch(/already exists/i);
  });

  it('honors a conflict override', () => {
    const out = friendlyApiError({ status: 409 }, { conflict: 'A league with that name already exists.' });
    expect(out).toBe('A league with that name already exists.');
  });

  it('honors a byStatus override', () => {
    const out = friendlyApiError({ status: 403 }, { byStatus: { 403: 'No access to this org.' } });
    expect(out).toBe('No access to this org.');
  });

  it('collapses 5xx into one server-error copy', () => {
    expect(friendlyApiError({ status: 503 })).toMatch(/server/i);
  });

  it('falls back to the raw message when no status matches', () => {
    expect(friendlyApiError({ message: 'Custom failure' })).toBe('Custom failure');
  });

  it('detects TypeError "fetch" as a network error', () => {
    const err = new TypeError('Failed to fetch');
    expect(friendlyApiError(err)).toMatch(/internet/i);
  });

  it('returns a generic fallback for unknown shapes', () => {
    expect(friendlyApiError(42)).toMatch(/something went wrong/i);
    expect(friendlyApiError(null)).toMatch(/something went wrong/i);
  });
});
