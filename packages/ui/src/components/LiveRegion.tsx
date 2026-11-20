/**
 * LiveRegion — a status area screen readers read out as it changes (MCAG 1.3.2).
 *
 * Mount it once and change what's inside it: a region that appears together
 * with its text is often not announced. Android (TalkBack) and the web follow
 * aria-live. iOS has no live regions, so `message` is passed to VoiceOver
 * whenever it changes.
 *
 *   <LiveRegion message={saved.message}>
 *     {saved.message && <Text style={styles.success}>{saved.message}</Text>}
 *   </LiveRegion>
 *
 * Use urgency="assertive" only for errors that stop what the user was doing.
 */

import { useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, View, type ViewProps } from 'react-native';

export interface LiveRegionProps extends ViewProps {
  /** What a screen reader should say: the region's text, as one string. */
  message: string | null | undefined;
  urgency?: 'polite' | 'assertive';
  children?: ReactNode;
}

export function LiveRegion({ message, urgency = 'polite', children, ...rest }: LiveRegionProps) {
  useEffect(() => {
    if (message && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return <View aria-live={urgency} {...rest}>{children}</View>;
}
