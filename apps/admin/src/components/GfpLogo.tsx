/**
 * GfpLogo — the platform brand mark for the admin app.
 *
 * Renders the shared SVG (packages/shared-types/src/logo.ts) through an RN
 * <Image> with a data URI. That works because the admin app ships web-only
 * (react-native-web Image is an <img>, which accepts SVG data URIs); a native
 * target would need react-native-svg like the mobile app uses.
 *
 * `variant` picks the color preset for the background the mark sits on:
 * 'onDark' for the primary-green nav chrome, 'onLight' for cream/white cards.
 */
import { Image } from 'react-native';
import { gfpLogoDataUri, GFP_LOGO_ON_DARK, GFP_LOGO_ON_LIGHT } from '@gfp/shared-types';

const URI = {
  onDark:  gfpLogoDataUri(GFP_LOGO_ON_DARK),
  onLight: gfpLogoDataUri(GFP_LOGO_ON_LIGHT),
};

export interface GfpLogoProps {
  variant: 'onDark' | 'onLight';
  /** Rendered width/height in points (the mark is square). Default 32. */
  size?: number;
}

export function GfpLogo({ variant, size = 32 }: GfpLogoProps) {
  return (
    <Image
      source={{ uri: URI[variant] }}
      resizeMode="contain"
      style={{ width: size, height: size }}
      accessibilityRole="image"
      accessibilityLabel="Golf Fundraiser Pro"
    />
  );
}
