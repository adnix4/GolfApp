/**
 * GfpLogo — the platform brand mark for the scorer app.
 *
 * Renders the shared SVG (packages/shared-types/src/logo.ts) through
 * react-native-svg's SvgXml, which works on native and web alike. The admin
 * app has a same-named component that uses an Image data URI instead because
 * it ships web-only and doesn't carry the react-native-svg dependency.
 *
 * `variant` picks the color preset for the background the mark sits on:
 * 'onLight' for cream/white auth screens, 'onDark' for primary-green chrome.
 */
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { gfpLogoSvg, GFP_LOGO_ON_DARK, GFP_LOGO_ON_LIGHT } from '@gfp/shared-types';

const XML = {
  onDark:  gfpLogoSvg(GFP_LOGO_ON_DARK),
  onLight: gfpLogoSvg(GFP_LOGO_ON_LIGHT),
};

export interface GfpLogoProps {
  variant: 'onDark' | 'onLight';
  /** Rendered width/height in points (the mark is square). Default 32. */
  size?: number;
  /**
   * True when the product name is written out beside the mark: the logo is then
   * hidden from screen readers, which otherwise said "Golf Fundraiser Pro" twice.
   */
  decorative?: boolean;
}

export function GfpLogo({ variant, size = 32, decorative = false }: GfpLogoProps) {
  if (decorative) {
    return <View aria-hidden><SvgXml xml={XML[variant]} width={size} height={size} /></View>;
  }
  return <SvgXml xml={XML[variant]} width={size} height={size} accessibilityLabel="Golf Fundraiser Pro" />;
}
