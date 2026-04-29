import { Stack } from 'expo-router';
import { ThemeProvider } from '@gfp/ui';
import { SessionProvider } from '@/lib/session';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </SessionProvider>
    </ThemeProvider>
  );
}
