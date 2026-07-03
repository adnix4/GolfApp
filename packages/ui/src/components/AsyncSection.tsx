/**
 * AsyncSection — loading / error / empty / content scaffolding.
 *
 * Replaces the four-conditional pattern that repeats in ~30 screens:
 *
 *   {loading && <Spinner />}
 *   {!loading && error && <ErrorBox onRetry={load} />}
 *   {!loading && !error && items.length === 0 && <Empty />}
 *   {!loading && items.length > 0 && children}
 *
 * Becomes:
 *
 *   <AsyncSection
 *     loading={loading}
 *     error={error}
 *     empty={items.length === 0 ? 'No events yet…' : null}
 *     onRetry={load}
 *   >
 *     {children}
 *   </AsyncSection>
 */

import React, { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from './ThemeProvider';

export interface AsyncSectionProps {
  loading?: boolean;
  /** Error message to display in the error state. `null`/`undefined` = no error. */
  error?: string | null;
  /**
   * Empty-state copy. When set, the empty UI replaces children. Pass the
   * concrete message (e.g. 'No events yet…') so each screen owns its own copy.
   * Pass `null`/`undefined` when content exists.
   */
  empty?: string | null;
  /** Optional retry handler. When provided, the error state gets a "Retry" link. */
  onRetry?: () => void;
  /** Optional accessibility label for the retry control. */
  retryLabel?: string;
  /** Spinner size for the loading state. */
  size?: 'small' | 'large';
  children: ReactNode;
}

export function AsyncSection({
  loading = false,
  error,
  empty,
  onRetry,
  retryLabel = 'Retry',
  size = 'large',
  children,
}: AsyncSectionProps) {
  const theme = useTheme();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size={size} color={theme.colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorText}>{error}</Text>
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={retryLabel}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.retryText, { color: theme.colors.action }]}>{retryLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (empty) {
    return (
      <View style={styles.center}>
        <Text style={[styles.emptyText, { color: theme.mutedText }]}>{empty}</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    maxWidth: 320,
  },
  errorBox: {
    backgroundColor: '#fdf2f2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#e74c3c',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    color: '#c0392b',
    fontSize: 14,
    flex: 1,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
