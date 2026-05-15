import { useEffect, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@gfp/ui';
import { ECO_GREEN_DEFAULT, type GFPTheme } from '@gfp/theme';
import { SessionProvider, useSession } from '@/lib/session';
import { defineBackgroundSyncTask, registerBackgroundSync } from '@/lib/backgroundSync';

// Must run synchronously at module initialisation — before any component renders
defineBackgroundSyncTask();

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
