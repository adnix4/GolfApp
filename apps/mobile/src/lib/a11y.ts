import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, useWindowDimensions } from 'react-native';
import { MIN_MESSAGE_MS } from '@gfp/shared-types';

export { MIN_MESSAGE_MS };

// OS accessibility settings the scorer has to honour (MCAG 4.1.3 Reduced
// Motion, 1.3.2 Perceivable Toasts, 2.3.1 Time Limits — problemList AX1).

export type A11ySetting = 'reduceMotion' | 'screenReader';

/**
 * Report an OS accessibility setting now and on every change. Returns an
 * unsubscribe.
 *
 * On web the screen-reader setting is reported OFF. react-native-web can't
 * detect one and always answers true, which would switch off every
 * auto-dismiss for every browser user. Web announces through ARIA roles
 * instead, so nothing there depends on this flag. Reduce Motion on web comes
 * from prefers-reduced-motion, which react-native-web does read.
 */
export function watchA11ySetting(setting: A11ySetting, onChange: (on: boolean) => void): () => void {
  if (setting === 'screenReader' && Platform.OS === 'web') {
    onChange(false);
    return () => {};
  }

  let active = true;
  // A change event that lands before the first read resolves is newer than
  // that read, so the read must not overwrite it.
  let changed = false;

  const initial = setting === 'reduceMotion'
    ? AccessibilityInfo.isReduceMotionEnabled()
    : AccessibilityInfo.isScreenReaderEnabled();
  initial
    .then(on => { if (active && !changed) onChange(on); })
    .catch(() => {});

  // react-native-web returns undefined here when matchMedia is unavailable.
  const sub = AccessibilityInfo.addEventListener(
    setting === 'reduceMotion' ? 'reduceMotionChanged' : 'screenReaderChanged',
    (on: boolean) => {
      changed = true;
      if (active) onChange(on);
    },
  ) as { remove(): void } | undefined;

  return () => {
    active = false;
    sub?.remove();
  };
}

function useA11ySetting(setting: A11ySetting): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => watchA11ySetting(setting, setOn), [setting]);
  return on;
}

/** The OS "Reduce Motion" / "Remove animations" setting. Swap movement for a fade when true. */
export function useReducedMotion(): boolean {
  return useA11ySetting('reduceMotion');
}

/**
 * The OS text size at or above which layouts reflow instead of clipping.
 * Android's largest setting is 2.0 and iOS accessibility sizes go past 3; at
 * 2.0 the scorer cut tab labels to "Scor…", team names to "Reach .." and
 * split "BACK" across two lines (WCAG 1.4.4, measured on an Android 16 emulator).
 */
export const LARGE_TEXT_SCALE = 1.3;

/** True when the golfer has turned text size up past LARGE_TEXT_SCALE. */
export function useLargeText(): boolean {
  return useWindowDimensions().fontScale >= LARGE_TEXT_SCALE;
}

/**
 * numberOfLines for text that is content, not chrome (a name, an email): kept
 * to `n` lines at normal sizes, free to wrap once text is enlarged, so nothing
 * is cut off at 200%.
 */
export function useLineClamp(): (n: number) => number | undefined {
  const large = useLargeText();
  return n => (large ? undefined : n);
}

/** VoiceOver or TalkBack is running (always false on web — see watchA11ySetting). */
export function useScreenReaderEnabled(): boolean {
  return useA11ySetting('screenReader');
}

/**
 * Speak a message through VoiceOver/TalkBack. A no-op when no screen reader is
 * running. On web this does nothing: give the element accessibilityRole="alert"
 * so the browser announces it.
 */
export function announce(message: string): void {
  if (Platform.OS === 'web') return;
  AccessibilityInfo.announceForAccessibility(message);
}

/**
 * How long a self-dismissing alert stays up, or null to wait for the golfer.
 * MCAG 1.3.2 sets a 6 s floor for a short message; a screen-reader user may
 * still be navigating to it, so it never closes on its own for them.
 */
export function autoDismissMs(screenReaderOn: boolean, ms: number): number | null {
  if (screenReaderOn) return null;
  return Math.max(ms, MIN_MESSAGE_MS);
}

