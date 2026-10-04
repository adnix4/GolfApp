/**
 * AdaptiveLogoFrame — Logo image with auto-contrasting background
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps a sponsor/org logo in a bordered frame whose background colour adapts
 * to ensure the logo is always visible:
 *
 *   • Dark logos  → white (#ffffff) background
 *   • Light/white logos → primaryColor (the event's dark brand colour)
 *
 * WHY:
 *   Sponsors often supply white-on-transparent logos.  A fixed white card
 *   makes them invisible.  Detecting the representative colour once per URL
 *   (cached by react-native-image-colors) picks the right background
 *   automatically, with zero manual configuration per sponsor.
 *
 * USAGE:
 *   <AdaptiveLogoFrame
 *     uri={sponsor.logoUrl}
 *     width={64} height={40}
 *     primaryColor={theme.colors.primary}
 *     borderColor={theme.colors.primary}
 *     accessibilityLabel={`${sponsor.name} logo`}
 *   />
 *
 * PLATFORM NOTES:
 *   react-native-image-colors supports iOS (UIImage palette), Android
 *   (Palette API), and Web (canvas pixel sampling).  The hook caches results
 *   by URI so each image is only analysed once per app session.
 */

import React, { useState, useEffect } from 'react';
import { Image, View, StyleSheet } from 'react-native';
import ImageColors from 'react-native-image-colors';
import { resolveMediaUrl } from '@gfp/shared-types';
import { LOGO_FALLBACK_BG, pickLogoBackground, type LogoColorSample } from './logoBackground';

export interface AdaptiveLogoFrameProps {
  /** Logo image URL */
  uri: string;
  /** Rendered image width in dp */
  width: number;
  /** Rendered image height in dp */
  height: number;
  /**
   * The "dark" background colour used when the logo is light or white.
   * Pass the event/org primary colour so the frame matches event branding.
   */
  primaryColor: string;
  /** Optional border colour — no border rendered when omitted */
  borderColor?: string;
  /** Border width (default 1.5) */
  borderWidth?: number;
  /** Corner radius (default 8) */
  borderRadius?: number;
  /** Internal padding around the image (default 6) */
  padding?: number;
  /** Accessibility label forwarded to the Image */
  accessibilityLabel?: string;
  /**
   * API origin used to resolve a root-relative "/uploads/…" logo. Defaults to
   * EXPO_PUBLIC_API_URL, which both RN apps already set.
   */
  baseUrl?: string;
}

const DEFAULT_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';

/**
 * Resolves which background colour best contrasts with the logo.
 * Returns '#ffffff' until the image has been sampled.
 */
function useAdaptiveLogoBg(uri: string, primaryColor: string): string {
  const [bg, setBg] = useState<string>(LOGO_FALLBACK_BG);

  useEffect(() => {
    let cancelled = false;

    ImageColors.getColors(uri, { fallback: LOGO_FALLBACK_BG, cache: true, key: uri })
      .then(result => {
        if (cancelled) return;
        setBg(pickLogoBackground(result as LogoColorSample, primaryColor));
      })
      .catch(() => setBg(LOGO_FALLBACK_BG));

    return () => { cancelled = true; };
  }, [uri, primaryColor]);

  return bg;
}

export function AdaptiveLogoFrame({
  uri,
  width,
  height,
  primaryColor,
  borderColor,
  borderWidth = 1.5,
  borderRadius = 8,
  padding = 6,
  accessibilityLabel,
  baseUrl = DEFAULT_BASE_URL,
}: AdaptiveLogoFrameProps) {
  // Resolved once, here, rather than at a dozen call sites — and BEFORE the
  // colour sample, since react-native-image-colors needs a fetchable URL too.
  // A "/uploads/…" logo would otherwise resolve against whichever origin the
  // app is served from and 404, leaving an empty frame.
  const resolved = resolveMediaUrl(uri, baseUrl);
  const bg = useAdaptiveLogoBg(resolved, primaryColor);

  return (
    <View
      style={[
        styles.frame,
        {
          backgroundColor: bg,
          borderRadius,
          padding,
          borderColor:  borderColor  ?? 'transparent',
          borderWidth:  borderColor  ? borderWidth : 0,
        },
      ]}
    >
      <Image
        source={{ uri: resolved }}
        style={{ width, height }}
        resizeMode="contain"
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center' },
});
