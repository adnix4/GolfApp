/**
 * StatusPill — small rounded label with a colored background.
 *
 * Purely presentational. Domain semantics (which status maps to which color
 * or label) live in the calling app — see apps/admin/src/lib/eventStatus.ts
 * for the event-status palette. This keeps @gfp/ui free of domain knowledge.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export interface StatusPillProps {
  /** Background color (a hex like '#27ae60' or theme.colors.*). */
  color: string;
  /** Text shown inside the pill. */
  label: string;
  /** Text color — defaults to white. */
  textColor?: string;
  /** 'sm' is tighter padding for inline use; 'md' is the default. */
  size?: 'sm' | 'md';
  /**
   * Casing for the label. Defaults to 'uppercase' (with letter-spacing) for
   * the chip-style look. Use 'capitalize' for humanized statuses that contain
   * spaces or were lowercase to begin with.
   */
  textTransform?: 'uppercase' | 'capitalize' | 'none';
}

export function StatusPill({
  color,
  label,
  textColor = '#fff',
  size = 'md',
  textTransform = 'uppercase',
}: StatusPillProps) {
  const padding = size === 'sm' ? styles.smPad : styles.mdPad;
  const fontSize = size === 'sm' ? 10 : 11;
  return (
    <View
      style={[styles.pill, padding, { backgroundColor: color }]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Text
        style={[
          styles.label,
          {
            color: textColor,
            fontSize,
            textTransform,
            letterSpacing: textTransform === 'uppercase' ? 0.4 : 0,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  smPad: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mdPad: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  label: {
    fontWeight: '700',
  },
});
