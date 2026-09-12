import { describe, it, expect } from 'vitest';
import { formatRelativeAge, resolveLeaderboardState, type LeaderboardStateInput } from '../lib/leaderboardState';

const base: LeaderboardStateInput = {
  offlineMode: false,
  error:       false,
  standings:   null,
  loading:     false,
};

describe('resolveLeaderboardState', () => {
  // The bug this exists to prevent: an offline-mode event with 77 scores in the
  // database reported "No Scores Yet", blaming a cause it had no evidence for.
  it('reports offline mode rather than blaming missing scores', () => {
    expect(resolveLeaderboardState({ ...base, offlineMode: true })).toBe('offline');
  });

  it('says empty only when a fetch actually came back empty', () => {
    expect(resolveLeaderboardState({ ...base, standings: [] })).toBe('empty');
    expect(resolveLeaderboardState(base)).toBe('empty');
  });

  it('distinguishes a failed fetch from an empty one', () => {
    expect(resolveLeaderboardState({ ...base, error: true })).toBe('error');
  });

  it('shows the spinner while the first load is in flight', () => {
    expect(resolveLeaderboardState({ ...base, loading: true })).toBe('loading');
  });

  it('renders standings whenever there are any', () => {
    expect(resolveLeaderboardState({ ...base, standings: [{}] })).toBe('ready');
  });

  // An offline event that was pulled-to-refresh once has real rows; a later
  // failed poll must not blank them back to an explanation.
  it('keeps showing standings over any explanation', () => {
    for (const over of [
      { offlineMode: true },
      { error: true },
      { loading: true },
      { offlineMode: true, error: true, loading: true },
    ]) {
      expect(resolveLeaderboardState({ ...base, ...over, standings: [{}] })).toBe('ready');
    }
  });

  // Nothing was attempted in offline mode, so a spinner would not be truthful.
  it('prefers the offline explanation over loading', () => {
    expect(resolveLeaderboardState({ ...base, offlineMode: true, loading: true })).toBe('offline');
  });

  // `error` is only set after a fetch actually failed, which in offline mode
  // means the golfer tapped refresh. Showing "live standings are off" there
  // would let them tap into silence.
  it('reports a failed refresh even in offline mode', () => {
    expect(resolveLeaderboardState({ ...base, offlineMode: true, error: true })).toBe('error');
  });

  it('treats an empty array and null the same when nothing is offline or failing', () => {
    expect(resolveLeaderboardState({ ...base, standings: [] }))
      .toBe(resolveLeaderboardState({ ...base, standings: null }));
  });
});

describe('formatRelativeAge', () => {
  const t = 1_700_000_000_000;

  // The bug this exists to prevent: the status ticker read "Updated -1s ago"
  // on first load, because the 10s clock snapshot was taken before the poll
  // that set `lastUpdated` landed.
  it('never reports a negative age', () => {
    expect(formatRelativeAge(t, t + 1_000)).toBe('0s ago');
    expect(formatRelativeAge(t, t + 9_999)).toBe('0s ago');
  });

  it('counts seconds under a minute', () => {
    expect(formatRelativeAge(t, t)).toBe('0s ago');
    expect(formatRelativeAge(t + 1_000, t)).toBe('1s ago');
    expect(formatRelativeAge(t + 59_999, t)).toBe('59s ago');
  });

  it('switches to whole minutes at sixty seconds', () => {
    expect(formatRelativeAge(t + 60_000, t)).toBe('1m ago');
    expect(formatRelativeAge(t + 119_000, t)).toBe('1m ago');
    expect(formatRelativeAge(t + 185_000, t)).toBe('3m ago');
  });
});
