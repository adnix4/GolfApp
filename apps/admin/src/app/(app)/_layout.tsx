import { Slot, useRouter, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ErrorFallback, useTheme } from '@gfp/ui';
import { GfpLogo } from '@/components/GfpLogo';
import { useAuth } from '@/lib/auth';
import { useResponsive } from '@/lib/responsive';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { fontSize, radius, spacing } from '@gfp/theme';

// Browser-tab labels for the top-level nav pages -> "GFP <label>".
const PAGE_TITLES: Record<string, string> = {
  events:   'Events',
  leagues:  'Leagues',
  settings: 'Settings',
  help:     'Help',
  admin:    'Organizations',
};

const ORG_ADMIN_NAV = [
  { label: 'Events',   segment: 'events',   href: '/(app)/events'   as const },
  { label: 'Leagues',  segment: 'leagues',  href: '/(app)/leagues'  as const },
  { label: 'Settings', segment: 'settings', href: '/(app)/settings' as const },
  { label: 'Help',     segment: 'help',     href: '/(app)/help'     as const },
];

// Event staff (problemList D20): Leagues and org Settings are organizer-only
// in the API, so a staff login doesn't offer them.
const EVENT_STAFF_NAV = [
  { label: 'Events', segment: 'events', href: '/(app)/events' as const },
  { label: 'Help',   segment: 'help',   href: '/(app)/help'   as const },
];

const SUPER_ADMIN_NAV = [
  { label: 'Organizations', segment: 'admin', href: '/(app)/admin' as const },
  { label: 'Help',          segment: 'help',  href: '/(app)/help'  as const },
];

// App-area safety net (problemList A4): a screen crash shows a retry card and
// keeps the organizer signed in, instead of unmounting the whole dashboard.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ErrorFallback
      error={error}
      retry={retry}
      title="This screen hit a problem"
      message="You're still signed in. Try again to reload the screen."
    />
  );
}

export default function AppLayout() {
  const theme    = useTheme();
  const { user, logout } = useAuth();
  const router   = useRouter();
  const segments = useSegments();
  const { isMobile } = useResponsive();

  const isSuperAdmin = user?.role === 'SuperAdmin';
  const navItems     = isSuperAdmin ? SUPER_ADMIN_NAV
                     : user?.role === 'EventStaff' ? EVENT_STAFF_NAV : ORG_ADMIN_NAV;
  const identityLabel = isSuperAdmin ? 'Platform Admin' : (user?.email ?? '');

  // Tab title for the main pages. Inside a specific event/league the nested
  // layout owns the title ("<name> - <page>"), so defer (null) rather than
  // fight it. A list route has one segment (['events']); a detail has more.
  const routeSegments   = segments.filter(s => !String(s).startsWith('('));
  const topSegment      = routeSegments[0] as string | undefined;
  const inDetail        = (topSegment === 'events' || topSegment === 'leagues') && routeSegments.length > 1;
  const mainPageLabel   = topSegment ? PAGE_TITLES[topSegment] : undefined;
  useDocumentTitle(inDetail || !mainPageLabel ? null : `GFP ${mainPageLabel}`);

  async function handleLogout() {
    await logout();
    router.replace('/(auth)/login');
  }

  // ── Mobile: horizontal top bar ─────────────────────────────────────────────
  if (isMobile) {
    return (
      <View style={styles.rootColumn}>
        <View style={[styles.topBar, { backgroundColor: theme.colors.primary }]}>
          <View style={styles.topLogoRow}>
            <GfpLogo variant="onDark" size={26} />
            <Text style={[styles.topLogo, { color: theme.colors.surface }]}>GFP</Text>
          </View>
          <View style={styles.topNav}>
            {navItems.map(item => {
              const isActive = segments.includes(item.segment as never);
              return (
                <Pressable
                  key={item.href}
                  style={[styles.topNavItem, isActive && styles.topNavItemActive]}
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
          {/* Identity/logout text derives from buttonLabel (readable-on-primary):
              accent has no validated contrast against the primary bar. */}
          <Text style={[styles.topEmail, { color: theme.buttonLabel, opacity: 0.8 }]} numberOfLines={1}>
            {identityLabel}
          </Text>
          <Pressable
            onPress={handleLogout}
            style={[styles.topLogout, { borderColor: theme.buttonLabel }]}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text style={[styles.topLogoutText, { color: theme.buttonLabel }]}>Out</Text>
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
          <View style={styles.logoRow}>
            <GfpLogo variant="onDark" size={40} />
            <Text style={[styles.logoText, { color: theme.colors.surface }]}>GFP</Text>
          </View>
          <Text style={[styles.logoSub,  { color: theme.buttonLabel, opacity: 0.75 }]}>Admin</Text>
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
          {/* buttonLabel (readable-on-primary) instead of accent — accent has
              no validated contrast against the primary sidebar. */}
          <Text style={[styles.userEmail, { color: theme.buttonLabel, opacity: 0.8 }]} numberOfLines={1}>
            {identityLabel}
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.logoutBtn,
              { borderColor: theme.buttonLabel },
              pressed && { opacity: 0.7 },
            ]}
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text style={[styles.logoutText, { color: theme.buttonLabel }]}>Sign out</Text>
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
  topBar:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[4], paddingVertical: spacing[3], gap: spacing[2] },
  topLogoRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  topLogo:        { fontSize: fontSize.xl, fontWeight: '800' },
  topNav:         { flex: 1, flexDirection: 'row', gap: spacing[1] },
  topNavItem:     { paddingVertical: spacing[2], paddingHorizontal: spacing[3], borderRadius: radius.sm },
  topNavItemActive: { backgroundColor: 'rgba(255,255,255,0.15)' },
  topNavLabel:    { fontSize: fontSize.md, fontWeight: '600' },
  topEmail:       { fontSize: fontSize.xxs, maxWidth: 120 },
  topLogout:      { borderWidth: 1, borderRadius: radius.sm, paddingVertical: spacing[1], paddingHorizontal: spacing[3] },
  topLogoutText:  { fontSize: fontSize.xs, fontWeight: '600' },

  // ── Sidebar ─────────────────────────────────────────────────────────────────
  sidebar: {
    width: 220,
    paddingTop: spacing[6],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[6],
    justifyContent: 'space-between',
  },
  logoBox: { alignItems: 'center', marginBottom: spacing[8] },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  logoText: { fontSize: fontSize.display, fontWeight: '800' },
  logoSub: {
    fontSize: fontSize.xxs,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: spacing[0.5],
  },
  nav:      { flex: 1, gap: spacing[1] },
  navItem:  { paddingVertical: spacing[3], paddingHorizontal: spacing[4], borderRadius: radius.md },
  navLabel: { fontSize: fontSize.lg, fontWeight: '600' },
  bottomBox: { gap: spacing[3] },
  userEmail: { fontSize: fontSize.xs, textAlign: 'center' },
  logoutBtn: { borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing[2], alignItems: 'center' },
  logoutText: { fontSize: fontSize.sm, fontWeight: '600' },

  content: { flex: 1 },
});
