/**
 * GFP brand mark — single source of truth for the platform logo.
 *
 * The mark is a waving hole flag carrying the "GFP" monogram, planted in a
 * green with a golf ball beside the cup. It is generated as an SVG string so
 * every surface renders the exact same geometry:
 *
 *   • Next.js web      → <img src={gfpLogoDataUri(...)}> in the site header
 *   • Expo Router admin → RN <Image source={{ uri: gfpLogoDataUri(...) }}>
 *                         (admin ships web-only, where Image accepts SVG URIs)
 *   • React Native mobile → <SvgXml xml={gfpLogoSvg(...)}> via react-native-svg
 *
 * Colors are parameters (not hardcoded) because the mark sits on two kinds of
 * background: the dark primary-green chrome (headers, sidebars) and light
 * surfaces (login cards, marketing pages). The presets below cover both for
 * the platform's own Eco Green brand; themed call sites may pass their own.
 *
 * FAVICONS: the badge form of this mark (rounded green square) is a static
 * asset, not generated here — apps/web/src/app/icon.svg is the source, and
 * apps/admin/assets/favicon.png + apps/mobile/assets/favicon.png are PNG
 * renders of it. Change the mark? Update those three files too.
 */

/** The five paint slots in the mark. */
export interface GfpLogoColors {
  /** Pennant fill */
  flag: string;
  /** "GFP" monogram on the pennant — must contrast with `flag` */
  flagText: string;
  /** Flagstick */
  pole: string;
  /** Kidney-shaped green under the flagstick */
  ground: string;
  /** Golf ball on the green (dimples/shading are fixed neutral grays) */
  ball: string;
}

/** Preset for dark chrome (primary-green headers, sidebars, footers). */
export const GFP_LOGO_ON_DARK: GfpLogoColors = {
  flag:     '#ecf39e', // pale lime pennant pops on dark green
  flagText: '#31572c',
  pole:     '#f4f7de',
  ground:   '#8ba955',
  ball:     '#ffffff',
};

/** Preset for light surfaces (cream/white cards and pages). */
export const GFP_LOGO_ON_LIGHT: GfpLogoColors = {
  flag:     '#409151', // leaf-green pennant reads on cream/white
  flagText: '#ffffff',
  pole:     '#31572c',
  ground:   '#8ba955',
  ball:     '#ffffff',
};

/**
 * gfpLogoSvg — the mark as a standalone SVG document string.
 *
 * Square 64×64 viewBox; scale via the consumer's width/height. The monogram
 * uses a system sans stack rather than outlined paths — every render target
 * (browsers, react-native-svg) has a bold sans available, and it keeps the
 * string small enough to inline as a data URI.
 */
export function gfpLogoSvg(colors: GfpLogoColors = GFP_LOGO_ON_DARK): string {
  const { flag, flagText, pole, ground, ball } = colors;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">` +
    // kidney-shaped green (concave notch on the bottom edge), drawn first so
    // the flagstick plants "into" it
    `<path d="M6 51.5 C 6 47.3, 13 45.6, 21 46 C 29 46.4, 33 47.2, 39 47.2 C 44 47.2, 46.5 49, 46.5 51.2 C 46.5 53.7, 43 55.3, 38.5 55.3 C 34.8 55.3, 33.5 53.2, 30 53.2 C 26.5 53.2, 25.8 55.8, 21 56.3 C 14 57, 6 55.4, 6 51.5 Z" fill="${ground}" opacity="0.75"/>` +
    // cup at the base of the flagstick (dark works on the sage green in both variants)
    `<ellipse cx="21" cy="51.8" rx="2.9" ry="1" fill="#31572c" opacity="0.5"/>` +
    // flagstick
    `<path d="M21 51.8 V 7.5" stroke="${pole}" stroke-width="3.4" stroke-linecap="round"/>` +
    // waving swallow-tail pennant
    `<path d="M21 7 C 31 2.6, 41 11, 57.5 7.2 L 52.5 15.8 L 57.5 24.4 C 41 28.2, 31 19.8, 21 24 Z" fill="${flag}"/>` +
    // monogram
    `<text x="35.5" y="19.4" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="10.2" letter-spacing="0.4" fill="${flagText}">GFP</text>` +
    // golf ball resting on the green's right lobe: drop shadow, then the ball,
    // a shading arc along its lower edge, and a scatter of dimples (fixed soft
    // grays — they sit on the white ball, so they read in both variants)
    `<ellipse cx="38.5" cy="52.6" rx="3.8" ry="1.1" fill="#31572c" opacity="0.28"/>` +
    `<circle cx="38.5" cy="49" r="3.6" fill="${ball}"/>` +
    `<path d="M35.7 50.8 A 3.6 3.6 0 0 0 41.3 50.7" stroke="#c3c8b2" stroke-width="1.1" fill="none" opacity="0.95"/>` +
    `<circle cx="37.4" cy="47.9" r="0.5" fill="#98a086"/>` +
    `<circle cx="39.4" cy="48.2" r="0.5" fill="#98a086"/>` +
    `<circle cx="38.3" cy="49.5" r="0.5" fill="#98a086"/>` +
    `<circle cx="40.1" cy="49.7" r="0.5" fill="#98a086"/>` +
    `<circle cx="36.5" cy="49.3" r="0.5" fill="#98a086"/>` +
    `<circle cx="38.7" cy="46.7" r="0.5" fill="#98a086"/>` +
    `</svg>`;
}

/**
 * gfpLogoDataUri — the mark as a `data:image/svg+xml` URI for <img> / RN-web
 * <Image>. encodeURIComponent keeps `#` in hex colors from terminating the URI.
 */
export function gfpLogoDataUri(colors: GfpLogoColors = GFP_LOGO_ON_DARK): string {
  return `data:image/svg+xml,${encodeURIComponent(gfpLogoSvg(colors))}`;
}
