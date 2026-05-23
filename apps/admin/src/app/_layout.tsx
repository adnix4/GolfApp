import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { ThemeProvider } from '@gfp/ui';
import { ECO_GREEN_DEFAULT, type GFPTheme } from '@gfp/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { orgApi } from '@/lib/api';

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
  }, [user?.orgId]);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace((user.role === 'SuperAdmin' ? '/(app)/admin' : '/(app)/events') as any);
    }
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
