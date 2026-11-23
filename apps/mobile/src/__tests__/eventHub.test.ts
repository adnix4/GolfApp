import { describe, expect, it, vi } from 'vitest';

// eventHub.ts imports the SignalR client and shared-types at module load; the
// pure helpers under test need neither.
vi.mock('@microsoft/signalr', () => ({}));
vi.mock('@gfp/shared-types', () => ({ silenceUnhandledHubEvents: () => {} }));

import { HUB_FALLBACK_POLL_MS, isOwnCheckIn, statusFetchDue } from '../lib/eventHub';

describe('statusFetchDue', () => {
  const now = 1_000_000_000;

  it('always fetches while the hub is down — the poll is the only source then', () => {
    expect(statusFetchDue(false, now, now)).toBe(true);
    expect(statusFetchDue(false, now - 1, now)).toBe(true);
  });

  it('only fetches once per fallback interval while the hub is connected', () => {
    expect(statusFetchDue(true, now - 30_000, now)).toBe(false);
    expect(statusFetchDue(true, now - HUB_FALLBACK_POLL_MS + 1, now)).toBe(false);
    expect(statusFetchDue(true, now - HUB_FALLBACK_POLL_MS, now)).toBe(true);
  });

  it('fetches straight away on a fresh session (never fetched)', () => {
    expect(statusFetchDue(true, 0, now)).toBe(true);
  });
});

describe('isOwnCheckIn', () => {
  const me = 'A1B2C3D4-0000-0000-0000-000000000001';

  it('is true when the push names this golfer, ignoring case', () => {
    expect(isOwnCheckIn({ checkedIn: 3, total: 8, playerIds: [me.toLowerCase()] }, me)).toBe(true);
    expect(isOwnCheckIn({ playerIds: ['other', me] }, me.toLowerCase())).toBe(true);
  });

  it('ignores everyone else\'s check-in — the whole group hears each one', () => {
    expect(isOwnCheckIn({ checkedIn: 3, total: 8, playerIds: ['someone-else'] }, me)).toBe(false);
  });

  it('ignores a push without ids (an older server) and a missing player', () => {
    expect(isOwnCheckIn({ checkedIn: 3, total: 8 }, me)).toBe(false);
    expect(isOwnCheckIn(null, me)).toBe(false);
    expect(isOwnCheckIn({ playerIds: [me] }, undefined)).toBe(false);
  });
});
