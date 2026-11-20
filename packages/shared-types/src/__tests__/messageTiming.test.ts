import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIN_MESSAGE_MS, createMessageTimer, useTimedMessage } from '../messageTiming';

describe('createMessageTimer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function setup() {
    const seen: (string | null)[] = [];
    const timer = createMessageTimer<string>(m => { seen.push(m); });
    return { seen, timer };
  }

  it('keeps a message up for at least 6 s, even when asked for less', () => {
    const { seen, timer } = setup();
    timer.show('Saved', 2_000);
    vi.advanceTimersByTime(MIN_MESSAGE_MS - 1);
    expect(seen).toEqual(['Saved']);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(['Saved', null]);
  });

  it('honours a longer hold', () => {
    const { seen, timer } = setup();
    timer.show('Saved', 10_000);
    vi.advanceTimersByTime(9_999);
    expect(seen[seen.length - 1]).toBe('Saved');
    vi.advanceTimersByTime(1);
    expect(seen[seen.length - 1]).toBeNull();
  });

  it('restarts the clock when another message replaces it', () => {
    const { seen, timer } = setup();
    timer.show('Par', MIN_MESSAGE_MS);
    vi.advanceTimersByTime(5_000);
    timer.show('Yardage', MIN_MESSAGE_MS);
    vi.advanceTimersByTime(5_000);
    expect(seen).toEqual(['Par', 'Yardage']); // the first clock did not clear the second message
    vi.advanceTimersByTime(1_000);
    expect(seen[seen.length - 1]).toBeNull();
  });

  it('holds until cleared when the hold is null (screen reader running)', () => {
    const { seen, timer } = setup();
    timer.show('Hand raised', null);
    vi.advanceTimersByTime(60_000);
    expect(seen).toEqual(['Hand raised']);
    timer.clear();
    expect(seen).toEqual(['Hand raised', null]);
  });

  it('dispose stops the clock without touching the message (unmount)', () => {
    const { seen, timer } = setup();
    timer.show('Copied', MIN_MESSAGE_MS);
    timer.dispose();
    vi.advanceTimersByTime(MIN_MESSAGE_MS * 2);
    expect(seen).toEqual(['Copied']);
  });
});

describe('useTimedMessage', () => {
  it('is exported as a hook', () => {
    expect(typeof useTimedMessage).toBe('function');
  });
});
