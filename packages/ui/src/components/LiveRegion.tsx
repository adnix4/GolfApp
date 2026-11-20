/**
 * LiveRegion — a status area screen readers read out as it changes (MCAG 1.3.2).
 *
 * Mount it once and change what's inside it: a region that appears together
 * with its text is often not announced.
 *
 *   <LiveRegion message={saved.message}>
 *     {saved.message && <Text style={styles.success}>{saved.message}</Text>}
 *   </LiveRegion>
 *
 * Web: aria-live on the region. Phones: `message` is announced directly.
 * iOS has no live regions at all, and Android's only fire when a live-region
 * view's OWN text changes — a message appearing as a new child inside the
 * region raises no live-region event (seen on an Android 16 emulator: only
 * generic subtree changes from the scroll view), so TalkBack stayed silent.
 *
 * Use urgency="assertive" only for errors that stop what the user was doing.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, View, type ViewProps } from 'react-native';

export interface LiveRegionProps extends ViewProps {
  /** What a screen reader should say: the region's text, as one string. */
  message: string | null | undefined;
  urgency?: 'polite' | 'assertive';
  children?: ReactNode;
}

const NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';

export function LiveRegion({ message, urgency = 'polite', children, ...rest }: LiveRegionProps) {
  // Like aria-live, only a CHANGE is spoken: text already there when the
  // region mounts (a scorecard opening on saved shots) is not announced.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (message && NATIVE) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  // aria-live only where it works (the web); on a phone it would make TalkBack
  // speak the same text twice whenever it does fire.
  return <View aria-live={NATIVE ? undefined : urgency} {...rest}>{children}</View>;
}
