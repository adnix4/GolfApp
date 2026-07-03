/**
 * Button — themed action button with primary / secondary / danger variants.
 *
 * Replaces the ~477 inline `backgroundColor: theme.colors.primary` Pressable
 * patterns scattered across admin/mobile screens. Each call site collapses to
 * a single line:
 *
 *   <PrimaryButton label="Save" onPress={handleSave} loading={saving} />
 *   <SecondaryButton label="Cancel" onPress={onClose} />
 *   <DangerButton label="Remove" onPress={handleRemove} />
 *
 * Custom inline styles still go through `style` for screens that have
 * special positioning needs.
 */

import React from 'react';
import {
  ActivityIndicator, Pressable, type PressableProps,
  StyleSheet, Text, View, type StyleProp, type ViewStyle,
} from 'react-native';
import { useTheme } from './ThemeProvider';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  /** Stretches to the parent width when true. */
  fullWidth?: boolean;
  /** Optional custom container style (e.g. width, margin). */
  style?: StyleProp<ViewStyle>;
  /** Optional accessibility label (defaults to `label`). */
  accessibilityLabel?: string;
  /** Passes through to the underlying Pressable (e.g. testID, hitSlop). */
  pressableProps?: Omit<PressableProps, 'onPress' | 'disabled' | 'style'>;
}

const SIZE_MAP: Record<ButtonSize, { padV: number; padH: number; font: number; minH: number }> = {
  sm: { padV: 8,  padH: 14, font: 13, minH: 36 },
  md: { padV: 12, padH: 18, font: 15, minH: 44 },
  lg: { padV: 14, padH: 22, font: 16, minH: 50 },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityLabel,
  pressableProps,
}: ButtonProps) {
  const theme = useTheme();
  const dims = SIZE_MAP[size];
  const isDisabled = disabled || loading;

  // Resolve colors from variant + theme
  let bg: string;
  let fg: string;
  let borderColor: string | undefined;
  let borderWidth = 0;

  switch (variant) {
    case 'primary':
      bg = theme.colors.primary;
      // Derived per-fill (white or near-black) — custom brands may pick a
      // light primary, where hardcoded white text would be invisible.
      fg = theme.buttonLabel;
      break;
    case 'secondary':
      bg = 'transparent';
      // Label in primary (the token validated against surface); accent is
      // decorative-only and routinely fails AA as text.
      fg = theme.colors.primary;
      borderColor = theme.colors.accent;
      borderWidth = 1;
      break;
    case 'danger':
      bg = '#e74c3c';
      fg = '#fff';
      break;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg,
          borderColor,
          borderWidth,
          paddingVertical: dims.padV,
          paddingHorizontal: dims.padH,
          minHeight: dims.minH,
        },
        // Filled variants get a soft depth shadow; outline (secondary) stays flat.
        // Dropped while disabled so a non-actionable button reads as inert.
        variant !== 'secondary' && !isDisabled && styles.elevated,
        fullWidth && styles.fullWidth,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...pressableProps}
    >
      {loading
        ? <ActivityIndicator color={fg} size="small" />
        : <Text style={[styles.text, { color: fg, fontSize: dims.font }]}>{label}</Text>}
    </Pressable>
  );
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

export function PrimaryButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="primary" />;
}

export function SecondaryButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="secondary" />;
}

export function DangerButton(props: Omit<ButtonProps, 'variant'>) {
  return <Button {...props} variant="danger" />;
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Soft, brand-neutral depth for filled buttons (color still comes from theme).
  elevated: {
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.16)',
    elevation: 3,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  // Tactile press: a small scale-down + slight fade reads more modern than a
  // flat opacity change.
  pressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.92,
  },
  disabled: {
    opacity: 0.45,
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
