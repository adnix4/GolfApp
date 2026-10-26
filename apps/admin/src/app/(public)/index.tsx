import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { GfpLogo } from '@/components/GfpLogo';
import { useResponsive } from '@/lib/responsive';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { fontSize, radius, spacing } from '@gfp/theme';

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
  useDocumentTitle('Golf Fundraiser Pro');

  const cols = isMobile ? 1 : isTablet ? 2 : 4;

  return (
    <ScrollView
      style={[styles.page, { backgroundColor: '#f4f7de' }]}
      contentContainerStyle={{ paddingBottom: 60 }}
    >
      {/* ── NAV BAR ── */}
      <View style={[styles.nav, { backgroundColor: theme.colors.primary, paddingHorizontal: pagePadding }]}>
        <View style={styles.navLogoRow}>
          <GfpLogo variant="onDark" size={30} />
          <Text style={[styles.navLogo, { color: theme.colors.surface }]}>Golf Fundraiser Pro</Text>
        </View>
        <Pressable
          style={[styles.navBtn, { borderColor: theme.buttonLabel }]}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={[styles.navBtnText, { color: theme.buttonLabel }]}>Sign In</Text>
        </Pressable>
      </View>

      {/* ── HERO ── */}
      <View style={[styles.hero, { paddingHorizontal: pagePadding, backgroundColor: theme.colors.primary }]}>
        <Text style={[styles.heroTag, { color: '#c8dfb0' }]}>
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
          onPress={() => router.push('/(public)/register' as any)}
          >
            <Text style={[styles.ctaPrimaryText, { color: theme.colors.primary }]}>
              Register Your Event →
            </Text>
          </Pressable>
          <Pressable
            style={[styles.ctaSecondary, { borderColor: theme.buttonLabel }]}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={[styles.ctaSecondaryText, { color: theme.buttonLabel }]}>
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
            <Text style={[styles.statLabel, { color: theme.mutedText }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── FEATURES ── */}
      <View style={[styles.featuresSection, { paddingHorizontal: pagePadding }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>
          Everything you need to run a great event
        </Text>
        <Text style={[styles.sectionSub, { color: theme.mutedText }]}>
          Built for golf event organizers, charities, booster clubs, and fundraising pros.
        </Text>

        <View style={[styles.grid, { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[4] }]}>
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
              <Text style={[styles.featureDesc, { color: theme.mutedText }]}>{f.desc}</Text>
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
          onPress={() => router.push('/(public)/register' as any)}
        >
          <Text style={[styles.ctaPrimaryText, { color: theme.colors.primary }]}>
            Get Started — It's Free →
          </Text>
        </Pressable>
      </View>

      {/* ── FOOTER ── */}
      <View style={[styles.footer, { paddingHorizontal: pagePadding }]}>
        <Text style={[styles.footerText, { color: theme.mutedText }]}>
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

  nav:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[4] },
  navLogoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  navLogo:    { fontSize: fontSize.xl, fontWeight: '800' },
  navBtn:     { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  navBtnText: { fontSize: fontSize.md, fontWeight: '600' },

  hero:         { paddingTop: 56, paddingBottom: spacing[12] },
  heroTag:      { fontSize: fontSize.sm, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing[4] },
  heroTitle:    { fontSize: 42, fontWeight: '900', lineHeight: 50, marginBottom: spacing[5] },
  heroSub:      { fontSize: fontSize.xl, lineHeight: 26, marginBottom: spacing[10], maxWidth: 560 },
  heroCtas:     { flexDirection: 'row', gap: spacing[4], flexWrap: 'wrap' },
  heroCtasMobile: { flexDirection: 'column' },

  ctaPrimary:       { paddingHorizontal: spacing[8], paddingVertical: spacing[4], borderRadius: radius.lg },
  ctaPrimaryText:   { fontSize: fontSize.xl, fontWeight: '800' },
  ctaSecondary:     { paddingHorizontal: spacing[8], paddingVertical: spacing[4], borderRadius: radius.lg, borderWidth: 1.5 },
  ctaSecondaryText: { fontSize: fontSize.xl, fontWeight: '700' },

  statsStrip: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: spacing[6], gap: spacing[5], borderBottomWidth: 1, borderBottomColor: '#eee' },
  statItem:   { alignItems: 'center', flex: 1, minWidth: 80 },
  statValue:  { fontSize: fontSize.title, fontWeight: '900' },
  statLabel:  { fontSize: fontSize.xs, fontWeight: '600', marginTop: spacing[0.5], textTransform: 'uppercase', letterSpacing: 0.5 },

  featuresSection: { paddingVertical: 56 },
  sectionTitle:    { fontSize: fontSize.display, fontWeight: '900', marginBottom: spacing[3], textAlign: 'center' },
  sectionSub:      { fontSize: fontSize.lg, textAlign: 'center', marginBottom: spacing[10], lineHeight: 24 },

  grid:        {},
  featureCard: {
    borderWidth: 1, borderRadius: radius.xl, padding: spacing[6],
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.04)',
    elevation: 1,
  },
  featureIcon:  { fontSize: 32, marginBottom: spacing[3] },
  featureTitle: { fontSize: fontSize.xl, fontWeight: '800', marginBottom: spacing[2] },
  featureDesc:  { fontSize: fontSize.md, lineHeight: 22 },

  bottomCta:      { paddingVertical: 56, alignItems: 'center', gap: spacing[4] },
  bottomCtaTitle: { fontSize: fontSize.display, fontWeight: '900', textAlign: 'center' },
  bottomCtaSub:   { fontSize: fontSize.lg, textAlign: 'center', lineHeight: 24, maxWidth: 480 },

  footer:      { paddingVertical: spacing[6], flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing[2] },
  footerText:  { fontSize: fontSize.sm },
  footerLink:  { fontSize: fontSize.sm, fontWeight: '700' },
});
