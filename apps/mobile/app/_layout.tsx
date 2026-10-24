import { useEffect, type ReactNode } from 'react';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Observe, ObserveRoot } from 'expo-observe';
import { ErrorFallback, ThemeProvider } from '@gfp/ui';
import { ECO_GREEN_DEFAULT, type GFPTheme } from '@gfp/theme';
import { SessionProvider, useSession } from '@/lib/session';
import { DialogHost } from '@/components/DialogHost';
import { defineBackgroundSyncTask, registerBackgroundSync } from '@/lib/backgroundSync';

// Must run synchronously at module initialisation — before any component renders
defineBackgroundSyncTask();

// EAS Observe: launch + per-route timings, and unhandled JS errors (recorded
// automatically on import). Release builds only; debug builds don't dispatch.
// Integrations can't be toggled after mount, so this stays at module scope.
// `invite` is a team join token from the captain's link — keep it off-device.
Observe.configure({
  integrations: { 'expo-router': { filteredParams: ['invite'] } },
});

// Root safety net (problemList A4): expo-router wraps the whole app with this,
// so an uncaught render throw shows a branded retry card instead of a blank
// screen. Queued offline scores in SQLite are untouched by a render crash.
// Render errors never reach the global handler, so report them here.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { Observe.reportError(error); }, [error]);
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

function RootLayout() {
  useEffect(() => {
    registerBackgroundSync();
  }, []);

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <SessionThemeProvider>
          <Stack screenOptions={{ headerShown: false }} />
          {/* Inside the event theme so every notify() dialog wears its colors. */}
          <DialogHost />
        </SessionThemeProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

export default ObserveRoot.wrap(RootLayout);
