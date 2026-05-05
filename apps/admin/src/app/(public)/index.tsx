import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { useResponsive } from '@/lib/responsive';

const FEATURES = [
  { icon: '📋', title: 'Event Management',      desc: 'Create and configure tournaments in minutes. Set format, holes, start type, and course.' },
  { icon: '👥', title: 'Team Registration',     desc: 'QR code check-in, fee tracking, handicap entry, and full roster management.' },
  { icon: '🏆', title: 'Live Leaderboard',      desc: 'Real-time standings with par tracking, hole-by-hole scorecards, and conflict resolution.' },
  { icon: '🎯', title: 'Hole Challenges',       desc: "Closest to pin, longest drive, and custom contests. Sponsor each hole for extra revenue." },
  { icon: '💰', title: 'Auction & Fundraising', desc: 'Silent and live auctions built in. Donation thermometer keeps donors engaged.' },
  { icon: '📧', title: 'Email Builder',         desc: 'Professional event emails with sponsor logos, QR codes, and registration links — no design skills needed.' },
  { icon: '🏅', title: 'Sponsor Management',    desc: 'Title, Gold, Silver, and custom tiers. Logo display, website links, and hole sponsorships.' },
  { icon: '📊', title: 'Real-Time Dashboard',   desc: 'Live fundraising totals, check-in progress, and scoring status all in one place.' },
];

export default function LandingPage() {
  const theme = useTheme();
  const router = useRouter();
  const { isMobile, isTablet, pagePadding } = useResponsive();

  const cols = isMobile ? 1 : isTablet ? 2 : 4;

  return (
    <ScrollView
      style={[styles.page, { backgroundColor: '#f4f7de' }]}
      contentContainerStyle={{ paddingBottom: 60 }}
    >
      {/* ── NAV BAR ── */}
      <View style={[styles.nav, { backgroundColor: theme.colors.primary, paddingHorizontal: pagePadding }]}>
        <Text style={[styles.navLogo, { color: theme.colors.surface }]}>⛳ Golf Fundraiser Pro</Text>
        <Pressable
          style={[styles.navBtn, { borderColor: theme.colors.accent }]}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={[styles.navBtnText, { color: theme.colors.accent }]}>Sign In</Text>
        </Pressable>
      </View>

      {/* ── HERO ── */}
      <View style={[styles.hero, { paddingHorizontal: pagePadding, backgroundColor: theme.colors.primary }]}>
        <Text style={[styles.heroTag, { color: theme.colors.accent }]}>
          The all-in-one platform for charity golf events
        </Text>
        <Text style={[styles.heroTitle, { color: theme.colors.surface }]}>
          Run beautiful,{'\n'}profitable golf{'\n'}fundraisers.
        </Text>
        <Text style={[styles.heroSub, { color: '#c8dfb0' }]}>
          From registration to real-time leaderboards, silent auctions to sponsor management —
          everything your event needs in one dashboard.
        </Text>
        <View style={[styles.heroCtas, isMobile && styles.heroCtasMobile]}>
          <Pressable
            style={[styles.ctaPrimary, { backgroundColor: theme.colors.surface }]}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push('/(public)/register' as any)}
          >
            <Text style={[styles.ctaPrimaryText, { color: theme.colors.primary }]}>
              Register Your Event →
            </Text>
          </Pressable>
          <Pressable
            style={[styles.ctaSecondary, { borderColor: theme.colors.accent }]}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={[styles.ctaSecondaryText, { color: theme.colors.accent }]}>
              Sign In to Dashboard
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── STATS STRIP ── */}
      <View style={[styles.statsStrip, { backgroundColor: '#fff', paddingHorizontal: pagePadding }]}>
        {[
          { value: 'Free',     label: 'to get started' },
          { value: 'Minutes',  label: 'to launch your event' },
          { value: 'Real-Time', label: 'leaderboard' },
          { value: '100%',     label: 'mobile friendly' },
        ].map(s => (
          <View key={s.label} style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: theme.colors.accent }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── FEATURES ── */}
      <View style={[styles.featuresSection, { paddingHorizontal: pagePadding }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>
          Everything you need to run a great event
        </Text>
        <Text style={[styles.sectionSub, { color: theme.colors.accent }]}>
          Built for golf event organizers, charities, booster clubs, and fundraising pros.
        </Text>

        <View style={[styles.grid, { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }]}>
          {FEATURES.map(f => (
            <View
              key={f.title}
              style={[
                styles.featureCard,
                { backgroundColor: '#fff', borderColor: '#e8e8e8', width: `${100 / cols - (cols > 1 ? 2 : 0)}%` },
              ]}
            >
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <Text style={[styles.featureTitle, { color: theme.colors.primary }]}>{f.title}</Text>
              <Text style={[styles.featureDesc, { color: theme.colors.accent }]}>{f.desc}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── BOTTOM CTA ── */}
      <View style={[styles.bottomCta, { backgroundColor: theme.colors.primary, paddingHorizontal: pagePadding }]}>
        <Text style={[styles.bottomCtaTitle, { color: theme.colors.surface }]}>
          Ready to run your tournament?
        </Text>
        <Text style={[styles.bottomCtaSub, { color: '#c8dfb0' }]}>
          Create your free account in under 2 minutes. No credit card required.
        </Text>
        <Pressable
          style={[styles.ctaPrimary, { backgroundColor: theme.colors.surface, alignSelf: 'center' }]}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push('/(public)/register' as any)}
        >
          <Text style={[styles.ctaPrimaryText, { color: theme.colors.primary }]}>
            Get Started — It's Free →
          </Text>
        </Pressable>
      </View>

      {/* ── FOOTER ── */}
      <View style={[styles.footer, { paddingHorizontal: pagePadding }]}>
        <Text style={[styles.footerText, { color: theme.colors.accent }]}>
          © {new Date().getFullYear()} Golf Fundraiser Pro · Built for nonprofit golf events
        </Text>
        <Pressable onPress={() => router.push('/(auth)/login')}>
          <Text style={[styles.footerLink, { color: theme.colors.primary }]}>Organizer Sign In</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },

  nav:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  navLogo:    { fontSize: 18, fontWeight: '800' },
  navBtn:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  navBtnText: { fontSize: 14, fontWeight: '600' },

  hero:         { paddingTop: 56, paddingBottom: 48 },
  heroTag:      { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },
  heroTitle:    { fontSize: 42, fontWeight: '900', lineHeight: 50, marginBottom: 20 },
  heroSub:      { fontSize: 16, lineHeight: 26, marginBottom: 36, maxWidth: 560 },
  heroCtas:     { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  heroCtasMobile: { flexDirection: 'column' },

  ctaPrimary:       { paddingHorizontal: 28, paddingVertical: 16, borderRadius: 12 },
  ctaPrimaryText:   { fontSize: 16, fontWeight: '800' },
  ctaSecondary:     { paddingHorizontal: 28, paddingVertical: 16, borderRadius: 12, borderWidth: 1.5 },
  ctaSecondaryText: { fontSize: 16, fontWeight: '700' },

  statsStrip: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 24, gap: 20, borderBottomWidth: 1, borderBottomColor: '#eee' },
  statItem:   { alignItems: 'center', flex: 1, minWidth: 80 },
  statValue:  { fontSize: 22, fontWeight: '900' },
  statLabel:  { fontSize: 12, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },

  featuresSection: { paddingVertical: 56 },
  sectionTitle:    { fontSize: 28, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
  sectionSub:      { fontSize: 15, textAlign: 'center', marginBottom: 36, lineHeight: 24 },

  grid:        {},
  featureCard: {
    borderWidth: 1, borderRadius: 14, padding: 24,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  featureIcon:  { fontSize: 32, marginBottom: 12 },
  featureTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  featureDesc:  { fontSize: 14, lineHeight: 22 },

  bottomCta:      { paddingVertical: 56, alignItems: 'center', gap: 16 },
  bottomCtaTitle: { fontSize: 28, fontWeight: '900', textAlign: 'center' },
  bottomCtaSub:   { fontSize: 15, textAlign: 'center', lineHeight: 24, maxWidth: 480 },

  footer:      { paddingVertical: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  footerText:  { fontSize: 13 },
  footerLink:  { fontSize: 13, fontWeight: '700' },
});
