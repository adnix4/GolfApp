import { Platform, Text, type TextProps } from 'react-native';
import { GLYPH_SPLIT, plainSpeech } from './plainSpeech';

export interface GlyphTextProps extends TextProps {
  /** One string: the text as shown, decorative glyphs and all. */
  children: string;
}

/**
 * Text whose emoji and arrows are seen but not read aloud (see plainSpeech).
 *
 * - Phones: nested Text is merged into one view on Android and one element on
 *   iOS, so hiding a glyph span does nothing there. The whole Text is instead
 *   named with the glyph-free string.
 * - Web: a name on a plain span is ignored by screen readers, so each glyph is
 *   its own aria-hidden span instead.
 * - Glyph-only text (a lone 🏆) is hidden outright; give it an
 *   accessibilityLabel if it means something.
 */
export function GlyphText({ children, accessibilityLabel, ...rest }: GlyphTextProps) {
  const parts = children.split(GLYPH_SPLIT);
  if (parts.length === 1) return <Text accessibilityLabel={accessibilityLabel} {...rest}>{children}</Text>;

  const spoken = accessibilityLabel ?? plainSpeech(children);
  if (!spoken) return <Text aria-hidden {...rest}>{children}</Text>;

  if (Platform.OS === 'web' && accessibilityLabel === undefined) {
    return (
      <Text {...rest}>
        {/* split() with a capture group puts the glyphs at the odd indexes. */}
        {parts.map((p, i) => (i % 2 === 1 ? <Text key={i} aria-hidden>{p}</Text> : p))}
      </Text>
    );
  }
  return <Text accessibilityLabel={spoken} {...rest}>{children}</Text>;
}
