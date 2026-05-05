import { Slot, useRouter, useSegments } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@gfp/ui';
import { useAuth } from '@/lib/auth';
import { useResponsive } from '@/lib/responsive';

const ORG_ADMIN_NAV = [
  { label: 'Events',   segment: 'events',   href: '/(app)/events'   as const },
  { label: 'Settings', segment: 'settings', href: '/(app)/settings' as const },
];

const SUPER_ADMIN_NAV = [
  { label: 'Organizations', segment: 'admin', href: '/(app)/admin' as const },
];

export default function AppLayout() {
  const theme    = useTheme();
  const { user, logout } = useAuth();
  const router   = useRouter();
  const segments = useSegments();
  const { isMobile } = useResponsive();

  const isSuperAdmin = user?.role === 'SuperAdmin';
  const navItems     = isSuperAdmin ? SUPER_ADMIN_NAV : ORG_ADMIN_NAV;
  const identityLabel = isSuperAdmin ? 'Platform Admin' : (user?.email ?? '');

  async function handleLogout() {
    await logout();
    router.replace('/(auth)/login');
  }

  // ── Mobile: horizontal top bar ─────────────────────────────────────────────
  if (isMobile) {
    return (
      <View style={styles.rootColumn}>
        <View style={[styles.topBar, { backgroundColor: theme.colors.primary }]}>
          <Text style={[styles.topLogo, { color: theme.colors.surface }]}>⛳ GFP</Text>
          <View style={styles.topNav}>
            {navItems.map(item => {
              const isActive = segments.includes(item.segment as never);
              return (
                <Pressable
                  key={item.href}
                  style={[styles.topNavItem, isActive && styles.topNavItemActive]}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onPress={() => router.push(item.href as any)}
                  accessibilityRole="link"
                  accessibilityLabel={item.label}
                >
                  <Text style={[styles.topNavLabel, { color: theme.colors.surface }]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.topEmail, { color: theme.colors.accent }]} numberOfLines={1}>
            {identityLabel}
          </Text>
          <Pressable
            onPress={handleLogout}
            style={[styles.topLogout, { borderColor: theme.colors.accent }]}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text style={[styles.topLogoutText, { color: theme.colors.accent }]}>Out</Text>
          </Pressable>
        </View>
        <View style={[styles.content, { backgroundColor: theme.pageBackground }]}>
          <Slot />
        </View>
      </View>
    );
  }

  // ── Tablet / Desktop: sidebar ─────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <View style={[styles.sidebar, { backgroundColor: theme.colors.primary }]}>
        <View style={styles.logoBox}>
          <Text style={[styles.logoText, { color: theme.colors.surface }]}>⛳ GFP</Text>
          <Text style={[styles.logoSub,  { color: theme.colors.accent }]}>Admin</Text>
        </View>

        <View style={styles.nav}>
          {navItems.map(item => {
            const isActive = segments.includes(item.segment as never);
            return (
              <Pressable
                key={item.href}
                style={[
                  styles.navItem,
                  isActive && { backgroundColor: 'rgba(255,255,255,0.15)' },
                ]}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onPress={() => router.push(item.href as any)}
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
            {identityLabel}
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

      <View style={[styles.content, { backgroundColor: theme.pageBackground }]}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1, flexDirection: 'row' },
  rootColumn: { flex: 1, flexDirection: 'column' },

  // ── Mobile top bar ──────────────────────────────────────────────────────────
  topBar:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  topLogo:        { fontSize: 18, fontWeight: '800' },
  topNav:         { flex: 1, flexDirection: 'row', gap: 4 },
  topNavItem:     { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
  topNavItemActive: { backgroundColor: 'rgba(255,255,255,0.15)' },
  topNavLabel:    { fontSize: 14, fontWeight: '600' },
  topEmail:       { fontSize: 11, maxWidth: 120 },
  topLogout:      { borderWidth: 1, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 10 },
  topLogoutText:  { fontSize: 12, fontWeight: '600' },

  // ── Sidebar ─────────────────────────────────────────────────────────────────
  sidebar: {
    width: 220,
    paddingTop: 24,
    paddingHorizontal: 16,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  logoBox: { alignItems: 'center', marginBottom: 32 },
  logoText: { fontSize: 28, fontWeight: '800' },
  logoSub: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  nav:      { flex: 1, gap: 4 },
  navItem:  { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  navLabel: { fontSize: 15, fontWeight: '600' },
  bottomBox: { gap: 10 },
  userEmail: { fontSize: 12, textAlign: 'center' },
  logoutBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  logoutText: { fontSize: 13, fontWeight: '600' },

  content: { flex: 1 },
});
