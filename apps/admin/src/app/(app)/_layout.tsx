import { Slot, useRouter, useSegments } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@gfp/ui';
import { useAuth } from '@/lib/auth';

const NAV_ITEMS = [
  { label: 'Events', segment: 'events', href: '/(app)/events' as const },
];

export default function AppLayout() {
  const theme  = useTheme();
  const { user, logout } = useAuth();
  const router   = useRouter();
  const segments = useSegments();

  async function handleLogout() {
    await logout();
    router.replace('/(auth)/login');
  }

  return (
    <View style={styles.root}>
      {/* ── SIDEBAR ── */}
      <View style={[styles.sidebar, { backgroundColor: theme.colors.primary }]}>
        <View style={styles.logoBox}>
          <Text style={[styles.logoText, { color: theme.colors.surface }]}>⛳ GFP</Text>
          <Text style={[styles.logoSub,  { color: theme.colors.accent }]}>Admin</Text>
        </View>

        <View style={styles.nav}>
          {NAV_ITEMS.map(item => {
            const isActive = segments.includes(item.segment as never);
            return (
              <Pressable
                key={item.href}
                style={[
                  styles.navItem,
                  isActive && { backgroundColor: 'rgba(255,255,255,0.15)' },
                ]}
                onPress={() => router.push(item.href)}
                accessibilityRole="link"
                accessibilityLabel={item.label}
              >
                <Text style={[styles.navLabel, { color: theme.colors.surface }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.bottomBox}>
          <Text style={[styles.userEmail, { color: theme.colors.accent }]} numberOfLines={1}>
            {user?.email}
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.logoutBtn,
              { borderColor: theme.colors.accent },
              pressed && { opacity: 0.7 },
            ]}
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text style={[styles.logoutText, { color: theme.colors.accent }]}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      {/* ── CONTENT ── */}
      <View style={[styles.content, { backgroundColor: theme.pageBackground }]}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 220,
    paddingTop: 24,
    paddingHorizontal: 16,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  logoBox: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '800',
  },
  logoSub: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  nav: {
    flex: 1,
    gap: 4,
  },
  navItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  navLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  bottomBox: {
    gap: 10,
  },
  userEmail: {
    fontSize: 12,
    textAlign: 'center',
  },
  logoutBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 13,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
});
