import { useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';

export interface ErrorFallbackProps {
  /** The error caught by the route's ErrorBoundary. */
  error: Error;
  /** Expo Router's retry — re-renders the crashed route. */
  retry: () => void | Promise<void>;
  /** Screen-specific heading, e.g. "Scoring hit a problem". */
  title?: string;
  /** Screen-specific guidance shown under the heading. */
  message?: string;
}

/**
 * Branded full-screen fallback for Expo Router `ErrorBoundary` route exports
 * (mobile + admin). Renders a recoverable "retry" card instead of the blank
 * screen React shows when a render-time throw goes uncaught.
 *
 * Deliberately does NOT use useTheme(): the crash may have originated in (or
 * above) ThemeProvider, and a fallback that throws again would defeat the
 * boundary. Colors are the static GFP eco-green defaults.
 */
export function ErrorFallback({ error, retry, title, message }: ErrorFallbackProps) {
  // Surface the underlying throw — the boundary is a safety net, not a fix,
  // so the real error must still land in the logs for diagnosis.
  useEffect(() => {
    console.error('[ErrorBoundary] render error caught:', error);
  }, [error]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.emoji}>⛳</Text>
        <Text style={styles.title}>{title ?? 'Something went wrong'}</Text>
        <Text style={styles.message}>
          {message ?? 'This screen hit an unexpected error. Your data is safe — try again.'}
        </Text>
        <ScrollView style={styles.errorBox} contentContainerStyle={styles.errorBoxContent}>
          <Text style={styles.errorText}>{error.message || String(error)}</Text>
        </ScrollView>
        <Pressable style={styles.retryBtn} onPress={() => retry()} accessibilityRole="button">
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f4f7de' },
  card: {
    width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 16,
    padding: 28, alignItems: 'center', borderWidth: 1, borderColor: '#e0e6c8',
  },
  emoji:    { fontSize: 40, marginBottom: 8 },
  title:    { fontSize: 20, fontWeight: '800', color: '#31572c', textAlign: 'center' },
  message:  { fontSize: 14, color: '#555', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  errorBox: {
    maxHeight: 96, alignSelf: 'stretch', backgroundColor: '#f8f8f4',
    borderRadius: 8, marginTop: 16,
  },
  errorBoxContent: { padding: 10 },
  errorText: { fontSize: 12, color: '#8a5a44', fontFamily: 'monospace' as never },
  retryBtn: {
    marginTop: 18, backgroundColor: '#31572c', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 36, minHeight: 44, justifyContent: 'center',
  },
  retryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
