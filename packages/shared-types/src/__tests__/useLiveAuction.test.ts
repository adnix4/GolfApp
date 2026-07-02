/**
 * Smoke test for useLiveAuction, mirroring the useLiveLeaderboard test. We
 * don't exercise the SignalR transport here (that would require a fake hub);
 * we only verify the exported hook and its option/result shapes.
 *
 * The realtime behavior is covered end-to-end by the mobile auction screen,
 * which drives this hook against the live TournamentHub.
 */
import { describe, it, expect } from 'vitest';
import {
  type UseLiveAuctionOptions,
  type UseLiveAuctionResult,
  useLiveAuction,
} from '../useLiveAuction';

describe('useLiveAuction exports', () => {
  it('exports the hook as a callable function', () => {
    expect(typeof useLiveAuction).toBe('function');
  });

  it('UseLiveAuctionOptions accepts the documented shape', () => {
    const opts: UseLiveAuctionOptions<{ items: unknown[] }> = {
      baseUrl: 'https://api.test',
      eventCode: 'CODE',
      disabled: false,
      initialData: null,
      pollIntervalMs: 15_000,
      refetchDebounceMs: 400,
      fetchAuction: async () => null,
    };
    expect(opts.baseUrl).toBe('https://api.test');
  });

  it('UseLiveAuctionResult declares every consumer-visible field', () => {
    // Compile-time check: shape must include all return fields.
    const _: UseLiveAuctionResult<unknown> = {
      data: null,
      loading: true,
      connected: false,
      error: false,
      lastUpdated: null,
      refresh: () => {},
    };
    expect(_).toBeDefined();
  });
});
