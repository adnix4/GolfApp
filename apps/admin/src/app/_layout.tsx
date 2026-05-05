import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { ThemeProvider } from '@gfp/ui';
import { AuthProvider, useAuth } from '@/lib/auth';

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
    <ThemeProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f4f7de' },
});
