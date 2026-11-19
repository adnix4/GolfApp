/**
 * Heading — a Text that screen readers know is a heading.
 *
 * VoiceOver's rotor and TalkBack's heading navigation jump from heading to
 * heading; a title that is only big bold Text is skipped, and the screen reads
 * as one long run of text. On web, react-native-web turns the header role plus
 * aria-level into a real <h1>-<h6>, so the browser outline matches the page.
 *
 * Styling stays with the caller: Heading adds semantics, not looks.
 *
 *   <Heading style={styles.title}>Leaderboard</Heading>             // h2
 *   <Heading level={1} style={c.title}>Season standings</Heading>   // screen title
 *   <Heading level={3} style={styles.sectionTitle}>Sponsors</Heading>
 *
 * Levels: 1 is the screen's own title (one per screen), 2 a section or a
 * modal's title, 3 a sub-section inside one. iOS and Android announce
 * "heading" without a level; the level only reaches the browser.
 */

import React from 'react';
import { Text, type TextProps } from 'react-native';

export interface HeadingProps extends TextProps {
  /** 1 = screen title, 2 = section or modal title (default), 3 = sub-section. */
  level?: 1 | 2 | 3 | 4;
}

export function Heading({ level = 2, ...rest }: HeadingProps) {
  return <Text accessibilityRole="header" aria-level={level} {...rest} />;
}
