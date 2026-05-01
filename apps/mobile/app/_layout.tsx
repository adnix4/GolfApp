import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { ThemeProvider } from '@gfp/ui';
import { SessionProvider } from '@/lib/session';
import { defineBackgroundSyncTask, registerBackgroundSync } from '@/lib/backgroundSync';

// Must run synchronously at module initialisation — before any component renders
defineBackgroundSyncTask();

export default function RootLayout() {
  useEffect(() => {
    registerBackgroundSync();
  }, []);

  return (
    <ThemeProvider>
      <SessionProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </SessionProvider>
    </ThemeProvider>
  );
}
