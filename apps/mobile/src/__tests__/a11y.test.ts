import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccessibilityInfo, Platform } from 'react-native';
import { announce, autoDismissMs, MIN_MESSAGE_MS, watchA11ySetting } from '../lib/a11y';

// Test hooks on the react-native stub (src/__mocks__/react-native.js).
const a11y = AccessibilityInfo as typeof AccessibilityInfo & {
  __set(setting: 'reduceMotion' | 'screenReader', on: boolean): void;
  __emit(event: string, on: boolean): void;
  __listenerCount(event: string): number;
  __reset(): void;
};

const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  a11y.__reset();
  (Platform as { OS: string }).OS = 'ios';
  vi.restoreAllMocks();
});

describe('watchA11ySetting', () => {
  it('reports the current Reduce Motion setting, then each change', async () => {
    a11y.__set('reduceMotion', true);
    const seen: boolean[] = [];
    watchA11ySetting('reduceMotion', on => seen.push(on));
    await flush();
    a11y.__emit('reduceMotionChanged', false);
    expect(seen).toEqual([true, false]);
  });

  it('reads the screen reader through its own event', async () => {
    a11y.__set('screenReader', true);
    const seen: boolean[] = [];
    watchA11ySetting('screenReader', on => seen.push(on));
    await flush();
    a11y.__emit('screenReaderChanged', false);
    a11y.__emit('reduceMotionChanged', true); // not this setting's event
    expect(seen).toEqual([true, false]);
  });

  it('does not let the first read overwrite a newer change event', async () => {
    a11y.__set('reduceMotion', false);
    const seen: boolean[] = [];
    watchA11ySetting('reduceMotion', on => seen.push(on));
    a11y.__emit('reduceMotionChanged', true); // lands before the read resolves
    await flush();
    expect(seen).toEqual([true]);
  });

  it('stops reporting and removes its listener once unsubscribed', async () => {
    a11y.__set('reduceMotion', true);
    const seen: boolean[] = [];
    const stop = watchA11ySetting('reduceMotion', on => seen.push(on));
    stop();
    await flush();
    a11y.__emit('reduceMotionChanged', false);
    expect(seen).toEqual([]);
    expect(a11y.__listenerCount('reduceMotionChanged')).toBe(0);
  });

  it('reports the screen reader as off on web, where it cannot be detected', async () => {
    (Platform as { OS: string }).OS = 'web';
    a11y.__set('screenReader', true); // react-native-web always answers true
    const seen: boolean[] = [];
    watchA11ySetting('screenReader', on => seen.push(on));
    await flush();
    expect(seen).toEqual([false]);
    expect(a11y.__listenerCount('screenReaderChanged')).toBe(0);
  });

  it('still reads Reduce Motion on web (prefers-reduced-motion)', async () => {
    (Platform as { OS: string }).OS = 'web';
    a11y.__set('reduceMotion', true);
    const seen: boolean[] = [];
    watchA11ySetting('reduceMotion', on => seen.push(on));
    await flush();
    expect(seen).toEqual([true]);
  });
});

describe('autoDismissMs', () => {
  it('never auto-dismisses while a screen reader is on', () => {
    expect(autoDismissMs(true, 8_000)).toBeNull();
  });

  it('keeps a longer dwell as asked', () => {
    expect(autoDismissMs(false, 8_000)).toBe(8_000);
  });

  it('raises a short dwell to the 6 s floor', () => {
    expect(autoDismissMs(false, 3_000)).toBe(MIN_MESSAGE_MS);
    expect(MIN_MESSAGE_MS).toBe(6_000);
  });
});

describe('announce', () => {
  it('speaks through the screen reader on native', () => {
    const spy = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce('Hole in one!');
    expect(spy).toHaveBeenCalledWith('Hole in one!');
  });

  it('does nothing on web, where the alert role announces instead', () => {
    (Platform as { OS: string }).OS = 'web';
    const spy = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce('Hole in one!');
    expect(spy).not.toHaveBeenCalled();
  });
});
