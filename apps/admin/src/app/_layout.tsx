import { Slot, useRouter, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { ErrorFallback, ThemeProvider } from '@gfp/ui';
import { ECO_GREEN_DEFAULT, type GFPTheme } from '@gfp/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { orgApi } from '@/lib/api';

// Root safety net (problemList A4): an uncaught render throw anywhere in the
// dashboard shows a branded retry card instead of a blank screen.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ErrorFallback error={error} retry={retry} />;
}

function parseTheme(json: string | null | undefined): GFPTheme | null {
  if (!json) return null;
  try { return { ...ECO_GREEN_DEFAULT, ...JSON.parse(json) }; }
  catch { return null; }
}

function OrgThemeWrapper({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [orgTheme, setOrgTheme] = useState<GFPTheme | null>(null);

  useEffect(() => {
    if (!user || user.role === 'SuperAdmin') { setOrgTheme(null); return; }
    orgApi.getMe().then(org => setOrgTheme(parseTheme(org.themeJson))).catch(() => {});
  // The whole user, not just orgId: the effect also branches on role, so a
  // same-org role change has to re-run it or the previous role's theme sticks.
  // Cheap to depend on the object — setUser only fires on a real auth
  // transition (mount restore, login, logout, register), never per render.
  }, [user]);

  return <ThemeProvider theme={orgTheme}>{children}</ThemeProvider>;
}

function AuthGate() {
  const { user, loading } = useAuth();
  const router   = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const seg0     = segments[0] as string;
    const inPublic = seg0 === '(public)';
    const inAuth   = seg0 === '(auth)';
    const inApp    = seg0 === '(app)';

    if (!user && inApp) {
      router.replace('/(auth)/login');
    } else if (user && (inAuth || inPublic)) {
      router.replace((user.role === 'SuperAdmin' ? '/(app)/admin' : '/(app)/events') as any);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- expo-router's router is a module singleton, so its identity never changes
  }, [user, loading, segments]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#31572c" />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <OrgThemeWrapper>
        <AuthGate />
      </OrgThemeWrapper>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f4f7de' },
});
