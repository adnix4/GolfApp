import { getContrastRatio } from '@gfp/theme';

/**
 * The background decision behind AdaptiveLogoFrame, kept free of React and
 * react-native so it is testable (problemList T10).
 *
 * react-native-image-colors reports a different shape per platform; pick the
 * single most representative colour from each. If that colour barely contrasts
 * with white (ratio < 2:1) the logo is light or white-on-transparent, so it
 * goes on the event's dark primary colour; otherwise it goes on white. Anything
 * unsampled falls back to white.
 */
export type LogoColorSample =
  | { platform: 'ios';     background?: string | null; primary?: string | null }
  | { platform: 'android'; dominant?: string | null;   average?: string | null }
  | { platform: 'web';     dominant?: string | null };

export const LOGO_FALLBACK_BG = '#ffffff';
export const LIGHT_LOGO_CONTRAST = 2.0;

export function representativeColor(result: LogoColorSample): string | null {
  switch (result.platform) {
    case 'ios':     return result.background ?? result.primary ?? null;
    case 'android': return result.dominant   ?? result.average ?? null;
    default:        return result.dominant   ?? null;
  }
}

export function pickLogoBackground(result: LogoColorSample, primaryColor: string): string {
  const sample = representativeColor(result);
  if (!sample) return LOGO_FALLBACK_BG;
  return getContrastRatio(sample, LOGO_FALLBACK_BG) < LIGHT_LOGO_CONTRAST ? primaryColor : LOGO_FALLBACK_BG;
}
