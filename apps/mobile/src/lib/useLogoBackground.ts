/**
 * useAdaptiveLogoBg
 *
 * Extracts the representative colour from a logo image URL using
 * react-native-image-colors, then decides whether a white or dark
 * (primary) background gives better contrast.
 *
 * WHY:
 *   Some sponsors have light/white logos that disappear on a white card.
 *   Others have dark logos that look fine on white.  Rather than hard-code
 *   one background for every logo, we sample the image at load time and
 *   pick whichever background gives at least 2:1 contrast against the
 *   logo's representative colour.
 *
 * FALLBACK:
 *   If the image hasn't loaded yet, or the fetch fails, we return '#ffffff'
 *   so nothing looks broken while we wait.
 */

import { useState, useEffect } from 'react';
import ImageColors from 'react-native-image-colors';
import { getContrastRatio } from '@gfp/theme';

/**
 * Returns the best background colour ('#ffffff' or primaryColor) for a logo.
 *
 * @param logoUrl       The logo image URL (null → always white)
 * @param primaryColor  The event's primary/brand colour used as the dark option
 */
export function useAdaptiveLogoBg(
  logoUrl: string | null | undefined,
  primaryColor: string,
): string {
  const [bg, setBg] = useState<string>('#ffffff');

  useEffect(() => {
    if (!logoUrl) {
      setBg('#ffffff');
      return;
    }

    let cancelled = false;

    ImageColors.getColors(logoUrl, {
      fallback: '#ffffff',
      cache: true,
      key: logoUrl,
    })
      .then(result => {
        if (cancelled) return;

        // Pull the most representative single colour from the result.
        // iOS gives a `background` field (overall image bg colour) which is
        // the most useful signal.  Android gives `dominant`.
        let sample: string | null = null;
        if (result.platform === 'ios') {
          sample = result.background ?? result.primary ?? null;
        } else if (result.platform === 'android') {
          sample = result.dominant ?? result.average ?? null;
        } else {
          // web
          sample = result.dominant ?? null;
        }

        if (!sample) return; // keep white fallback

        // If the logo's representative colour barely contrasts with white
        // (ratio < 2:1), the logo is light/white and needs a dark background.
        const ratioVsWhite = getContrastRatio(sample, '#ffffff');
        setBg(ratioVsWhite < 2.0 ? primaryColor : '#ffffff');
      })
      .catch(() => {
        // Network error or unsupported format — stay with white
      });

    return () => {
      cancelled = true;
    };
  }, [logoUrl, primaryColor]);

  return bg;
}
