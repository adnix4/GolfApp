import { useEffect, type ReactNode } from 'react';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorFallback, ThemeProvider } from '@gfp/ui';
import { ECO_GREEN_DEFAULT, type GFPTheme } from '@gfp/theme';
import { SessionProvider, useSession } from '@/lib/session';
import { defineBackgroundSyncTask, registerBackgroundSync } from '@/lib/backgroundSync';

// Must run synchronously at module initialisation — before any component renders
defineBackgroundSyncTask();

// Root safety net (problemList A4): expo-router wraps the whole app with this,
// so an uncaught render throw shows a branded retry card instead of a blank
// screen. Queued offline scores in SQLite are untouched by a render crash.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ErrorFallback error={error} retry={retry} />;
}

function parseTheme(json: string | null | undefined): GFPTheme | null {
  if (!json) return null;
  try { return { ...ECO_GREEN_DEFAULT, ...JSON.parse(json) }; }
  catch { return null; }
}

function SessionThemeProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const theme = parseTheme(session?.event?.themeJson);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

export default function RootLayout() {
  useEffect(() => {
    registerBackgroundSync();
  }, []);

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <SessionThemeProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </SessionThemeProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
