import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

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

/** MCAG 1.3.2: 5 s plus 1 s per 120 words, rounded up for a short message. */
export const MIN_MESSAGE_MS = 6_000;
