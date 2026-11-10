import { describe, it, expect, vi, afterEach } from 'vitest';
import { AppState } from 'react-native';
import { isForeground, onForeground } from '../lib/foregroundPoll';

const appState = AppState as unknown as {
  __setState(next: string | null): void;
  __listenerCount(): number;
};

afterEach(() => appState.__setState('active'));

describe('isForeground', () => {
  it('is true while active, false in the background or inactive', () => {
    expect(isForeground()).toBe(true);
    appState.__setState('background');
    expect(isForeground()).toBe(false);
    appState.__setState('inactive');
    expect(isForeground()).toBe(false);
  });

  // At launch the state can briefly be unknown; the first poll must not be lost.
  it('treats an unknown or missing state as foreground', () => {
    appState.__setState('unknown');
    expect(isForeground()).toBe(true);
    appState.__setState(null);
    expect(isForeground()).toBe(true);
  });
});

describe('onForeground', () => {
  it('fires only on the return to active', () => {
    const fn = vi.fn();
    const stop = onForeground(fn);
    appState.__setState('background');
    expect(fn).not.toHaveBeenCalled();
    appState.__setState('active');
    expect(fn).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stops firing after unsubscribe (the useEffect cleanup)', () => {
    const fn = vi.fn();
    const before = appState.__listenerCount();
    const stop = onForeground(fn);
    stop();
    expect(appState.__listenerCount()).toBe(before);
    appState.__setState('background');
    appState.__setState('active');
    expect(fn).not.toHaveBeenCalled();
  });
});
