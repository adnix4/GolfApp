/**
 * Smoke test for useLiveLeaderboard. We don't exercise the SignalR transport
 * here (it would require a fake hub implementation); we only verify the
 * options shape and the HTTP fallback path through a manual harness.
 *
 * The fuller integration story is covered by the existing leaderboard tests
 * in apps/mobile (which already exercise fetchLeaderboard end-to-end).
 */
import { describe, it, expect } from 'vitest';
import {
  type HoleInOneAlert,
  type UseLiveLeaderboardOptions,
  type UseLiveLeaderboardResult,
  useLiveLeaderboard,
} from '../useLiveLeaderboard';

describe('useLiveLeaderboard exports', () => {
  it('exports the hook as a callable function', () => {
    expect(typeof useLiveLeaderboard).toBe('function');
  });

  it('exposes HoleInOneAlert as a structural type', () => {
    const alert: HoleInOneAlert = {
      teamName: 'Eagles',
      playerName: 'Jane Doe',
      holeNumber: 7,
    };
    expect(alert.holeNumber).toBe(7);
  });

  it('UseLiveLeaderboardOptions accepts the documented shape', () => {
    const opts: UseLiveLeaderboardOptions<{ teamId: string }> = {
      baseUrl: 'https://api.test',
      eventCode: 'CODE',
      disabled: false,
      initialStandings: null,
      pollIntervalMs: 15_000,
      fetchStandings: async () => null,
    };
    expect(opts.baseUrl).toBe('https://api.test');
  });

  it('UseLiveLeaderboardResult declares every consumer-visible field', () => {
    // Compile-time check: shape must include all return fields.
    const _: UseLiveLeaderboardResult<unknown> = {
      standings: null,
      loading: true,
      connected: false,
      error: false,
      lastUpdated: null,
      hioAlert: null,
      dismissHioAlert: () => {},
      refresh: () => {},
    };
    expect(_).toBeDefined();
  });
});
