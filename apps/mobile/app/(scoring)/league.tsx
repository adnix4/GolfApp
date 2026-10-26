import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator,
  StyleSheet, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@gfp/ui';
import { useSession } from '@/lib/session';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

// ── LEAGUE PROMO ──────────────────────────────────────────────────────────────

interface FeatureItem {
  icon:  IoniconsName;
  title: string;
  body:  string;
}

const FEATURES: FeatureItem[] = [
  {
    icon:  'stats-chart',
    title: 'Live Handicap Tracking',
    body:  'Handicap indexes update automatically after every round using USGA differentials. No spreadsheets, no manual entry.',
  },
  {
    icon:  'trophy',
    title: 'Season Standings',
    body:  'Players are ranked by Stableford points across the entire season. Standings update the moment scores are submitted.',
  },
  {
    icon:  'layers',
    title: 'Flight-Based Competition',
    body:  'Automatically group players into competitive flights by handicap so everyone is competing on a level playing field.',
  },
  {
    icon:  'git-network',
    title: 'Smart Auto-Pairing',
    body:  'Snake-draft pairing engine builds balanced teams from handicap and skill data — or let organizers pair manually.',
  },
  {
    icon:  'calendar',
    title: 'Multi-Round History',
    body:  'Every gross score, net score, and points total across all rounds in one place — yours to review any time.',
  },
];

interface StepItem { num: string; title: string; body: string; }

const STEPS: StepItem[] = [
  { num: '1', title: 'Create a League',      body: 'Organizer sets up a league and season from the admin dashboard.' },
  { num: '2', title: 'Link Your Tournament', body: 'Each tournament event is linked to the season — scores count automatically.' },
  { num: '3', title: 'Track All Season',     body: 'Players see their stats, handicap trend, and ranking here after every round.' },
];

function FeatureCard({ item, theme }: { item: FeatureItem; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={[promoStyles.featureCard, { backgroundColor: theme.colors.surface }]}>
      <View style={[promoStyles.featureIcon, { backgroundColor: theme.colors.primary + '18' }]}>
        <Ionicons name={item.icon} size={24} color={theme.colors.primary} />
      </View>
      <View style={promoStyles.featureText}>
        <Text style={[promoStyles.featureTitle, { color: theme.colors.primary }]}>{item.title}</Text>
        <Text style={[promoStyles.featureBody,  { color: theme.mutedText  }]}>{item.body}</Text>
      </View>
    </View>
  );
}

function StepCard({ item, theme }: { item: StepItem; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={promoStyles.stepRow}>
      <View style={[promoStyles.stepNum, { backgroundColor: theme.colors.primary }]}>
        <Text style={promoStyles.stepNumText}>{item.num}</Text>
      </View>
      <View style={promoStyles.stepText}>
        <Text style={[promoStyles.stepTitle, { color: theme.colors.primary }]}>{item.title}</Text>
        <Text style={[promoStyles.stepBody,  { color: theme.mutedText  }]}>{item.body}</Text>
      </View>
    </View>
  );
}

function LeaguePromo() {
  const theme = useTheme();
  return (
    <ScrollView
      style={[promoStyles.root, { backgroundColor: theme.pageBackground }]}
      contentContainerStyle={promoStyles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={[promoStyles.hero, { backgroundColor: theme.colors.primary }]}>
        <View style={[promoStyles.heroIconWrap, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
          <Ionicons name="ribbon" size={40} color="#fff" />
        </View>
        <Text style={promoStyles.heroTitle}>League Play</Text>
        <Text style={promoStyles.heroSub}>
          Turn one-off tournaments into a season-long competition with live handicaps,
          standings, and flight-based matchups.
        </Text>
        <View style={[promoStyles.heroBadge, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
          <Text style={promoStyles.heroBadgeText}>Not linked to this event</Text>
        </View>
      </View>

      {/* Features */}
      <View style={promoStyles.section}>
        <Text style={[promoStyles.sectionLabel, { color: theme.colors.primary }]}>What you get</Text>
        {FEATURES.map(f => <FeatureCard key={f.title} item={f} theme={theme} />)}
      </View>

      {/* How it works */}
      <View style={[promoStyles.section, promoStyles.stepsSection, { backgroundColor: theme.colors.surface }]}>
        <Text style={[promoStyles.sectionLabel, { color: theme.colors.primary }]}>How it works</Text>
        {STEPS.map(s => <StepCard key={s.num} item={s} theme={theme} />)}
      </View>

      {/* CTA */}
      <View style={[promoStyles.cta, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary + '33' }]}>
        <Ionicons name="chatbubble-ellipses-outline" size={28} color={theme.colors.primary} style={promoStyles.ctaIcon} />
        <Text style={[promoStyles.ctaTitle, { color: theme.colors.primary }]}>
          Interested in League Play?
        </Text>
        <Text style={[promoStyles.ctaBody, { color: theme.mutedText }]}>
          Ask your event organizer to link this tournament to a league season.
          Once linked, your stats and rankings will appear here automatically.
        </Text>
      </View>
    </ScrollView>
  );
}
import { fetchMemberSeasonSummary, MemberSeasonSummary } from '@/lib/api';
import { formatDateOnly, formatDate } from '@gfp/shared-types';
import { fontSize, radius, spacing } from '@gfp/theme';

export default function LeagueScreen() {
  const theme   = useTheme();
  const session = useSession();

  const [summary, setSummary]       = useState<MemberSeasonSummary | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const leagueId = session.session?.leagueId;
  const seasonId = session.session?.seasonId;
  const memberId = session.session?.memberId;

  const load = useCallback(async (isRefresh = false) => {
    if (!leagueId || !seasonId || !memberId) {
      setLoading(false);
      return;
    }
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const data = await fetchMemberSeasonSummary(leagueId, seasonId, memberId);
      setSummary(data);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [leagueId, seasonId, memberId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );

  if (!leagueId || !seasonId || !memberId) return <LeaguePromo />;

  if (error) return (
    <View style={styles.center}>
      <Text style={{ color: '#dc2626' }}>{error}</Text>
    </View>
  );

  if (!summary) return (
    <View style={styles.center}>
      <Text style={[styles.emptyText, { color: theme.mutedText }]}>
        No league data found.
      </Text>
    </View>
  );

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.colors.surface }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)}
          colors={[theme.colors.primary]} tintColor={theme.colors.primary} />
      }
    >
      {/* Profile card */}
      <View style={[styles.profileCard, { backgroundColor: theme.colors.primary }]}>
        <Text style={styles.profileName}>{summary.name}</Text>
        <Text style={styles.profileFlight}>{summary.flightName}</Text>
        <View style={styles.profileStats}>
          <View style={styles.profileStat}>
            <Text style={styles.profileStatVal}>{summary.handicapIndex.toFixed(1)}</Text>
            <Text style={styles.profileStatLabel}>Handicap</Text>
          </View>
          <View style={styles.profileStatDivider} />
          <View style={styles.profileStat}>
            <Text style={styles.profileStatVal}>#{summary.rank || '–'}</Text>
            <Text style={styles.profileStatLabel}>Rank</Text>
          </View>
          <View style={styles.profileStatDivider} />
          <View style={styles.profileStat}>
            <Text style={styles.profileStatVal}>{summary.totalPoints}</Text>
            <Text style={styles.profileStatLabel}>Points</Text>
          </View>
          <View style={styles.profileStatDivider} />
          <View style={styles.profileStat}>
            <Text style={styles.profileStatVal}>{summary.roundsPlayed}</Text>
            <Text style={styles.profileStatLabel}>Rounds</Text>
          </View>
        </View>
      </View>

      {/* Handicap trend */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Handicap Trend</Text>
        {summary.handicapTrend.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.mutedText }]}>No rounds played yet.</Text>
        ) : (
          summary.handicapTrend.map((h) => (
            <View key={h.id} style={[styles.trendRow, { borderColor: theme.colors.accent }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.trendDate, { color: theme.mutedText }]}>
                  {h.roundDate ? formatDateOnly(h.roundDate) : formatDate(h.createdAt)}
                  {h.adminOverride ? '  (Admin)' : ''}
                </Text>
              </View>
              <View style={styles.trendRight}>
                <Text style={[styles.trendChange, { color: theme.colors.primary }]}>
                  {h.oldIndex.toFixed(1)} → {h.newIndex.toFixed(1)}
                </Text>
                <Text style={[styles.trendDiff, {
                  color: h.differential < 0 ? '#16a34a' : h.differential > 0 ? '#ef4444' : theme.mutedText
                }]}>
                  diff {h.differential > 0 ? '+' : ''}{h.differential.toFixed(1)}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Round history */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Round History</Text>
        {summary.roundHistory.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.mutedText }]}>No completed rounds.</Text>
        ) : (
          <>
            <View style={[styles.tableHeader, { backgroundColor: theme.colors.primary + '11' }]}>
              {['Date', 'Gross', 'Net', 'Pts'].map(h => (
                <Text key={h} style={[styles.tableCell, { color: theme.mutedText, fontWeight: '700', fontSize: fontSize.xxs }]}>{h}</Text>
              ))}
            </View>
            {summary.roundHistory.map(r => (
              <View key={r.roundId} style={[styles.tableRow, { borderBottomColor: theme.colors.accent }]}>
                <Text style={[styles.tableCell, { color: theme.mutedText }]}>{formatDateOnly(r.roundDate, { year: undefined })}</Text>
                <Text style={[styles.tableCell, { color: theme.colors.primary }]}>{r.grossTotal}</Text>
                <Text style={[styles.tableCell, { color: theme.colors.primary, fontWeight: '600' }]}>{r.netTotal}</Text>
                <Text style={[styles.tableCell, { color: theme.colors.primary, fontWeight: '600' }]}>{r.stablefordPoints}</Text>
              </View>
            ))}
          </>
        )}
      </View>
    </ScrollView>
  );
}

// ── PROMO STYLES ──────────────────────────────────────────────────────────────

const promoStyles = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { paddingBottom: spacing[12] },

  // Hero
  hero: {
    paddingTop: spacing[12], paddingBottom: spacing[10], paddingHorizontal: spacing[8],
    alignItems: 'center', gap: spacing[3],
  },
  heroIconWrap: {
    width: 80, height: 80, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing[1],
  },
  heroTitle: { color: '#fff', fontSize: fontSize.display, fontWeight: '800', textAlign: 'center' },
  heroSub:   { color: 'rgba(255,255,255,0.82)', fontSize: fontSize.lg, textAlign: 'center', lineHeight: 22 },
  heroBadge: {
    borderRadius: radius.xxl, paddingHorizontal: spacing[4], paddingVertical: spacing[1], marginTop: spacing[1],
  },
  heroBadgeText: { color: 'rgba(255,255,255,0.9)', fontSize: fontSize.xs, fontWeight: '600' },

  // Sections
  section: { paddingHorizontal: spacing[4], paddingTop: spacing[8], gap: spacing[3] },
  stepsSection: {
    marginHorizontal: spacing[4], borderRadius: radius.xl, marginTop: spacing[8],
    paddingHorizontal: spacing[5], paddingVertical: spacing[6],
    boxShadow: '0px 1px 6px rgba(0, 0, 0, 0.06)', elevation: 2,
  },
  sectionLabel: { fontSize: fontSize.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing[1] },

  // Feature cards
  featureCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing[4],
    borderRadius: radius.xl, padding: spacing[4],
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.05)', elevation: 1,
  },
  featureIcon:  { width: 46, height: 46, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  featureText:  { flex: 1, gap: spacing[1] },
  featureTitle: { fontSize: fontSize.lg, fontWeight: '700' },
  featureBody:  { fontSize: fontSize.sm, lineHeight: 19 },

  // Steps
  stepRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[4], paddingVertical: spacing[3] },
  stepNum:    { width: 30, height: 30, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  stepNumText: { color: '#fff', fontSize: fontSize.md, fontWeight: '800' },
  stepText:   { flex: 1, gap: spacing[0.5] },
  stepTitle:  { fontSize: fontSize.md, fontWeight: '700' },
  stepBody:   { fontSize: fontSize.sm, lineHeight: 18 },

  // CTA
  cta: {
    marginHorizontal: spacing[4], marginTop: spacing[5], borderRadius: radius.xl, borderWidth: 1,
    padding: spacing[6], alignItems: 'center', gap: spacing[2],
  },
  ctaIcon:  { marginBottom: spacing[0.5] },
  ctaTitle: { fontSize: fontSize.xl, fontWeight: '800', textAlign: 'center' },
  ctaBody:  { fontSize: fontSize.sm, textAlign: 'center', lineHeight: 20 },
});

// ── MAIN STYLES ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:             { flex: 1 },
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing[6] },
  content:          { padding: spacing[4], paddingBottom: spacing[10], gap: spacing[5] },
  emptyText:        { fontSize: fontSize.md, textAlign: 'center' },
  // Profile card
  profileCard:      { borderRadius: radius.xl, padding: spacing[5], gap: spacing[1] },
  profileName:      { color: '#fff', fontSize: fontSize.xxl, fontWeight: '700' },
  profileFlight:    { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.sm, marginBottom: spacing[3] },
  profileStats:     { flexDirection: 'row', alignItems: 'center' },
  profileStat:      { flex: 1, alignItems: 'center' },
  profileStatVal:   { color: '#fff', fontSize: fontSize.title, fontWeight: '800' },
  profileStatLabel: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xxs, marginTop: spacing[0.5] },
  profileStatDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },
  // Section
  section:          { gap: spacing[1] },
  sectionTitle:     { fontSize: fontSize.xl, fontWeight: '700', marginBottom: spacing[2] },
  // Handicap trend
  trendRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3], borderBottomWidth: 1 },
  trendDate:        { fontSize: fontSize.sm },
  trendRight:       { alignItems: 'flex-end', gap: spacing[0.5] },
  trendChange:      { fontSize: fontSize.md, fontWeight: '600' },
  trendDiff:        { fontSize: fontSize.xs },
  // Table
  tableHeader:      { flexDirection: 'row', paddingVertical: spacing[2], borderRadius: radius.sm },
  tableRow:         { flexDirection: 'row', paddingVertical: spacing[2], borderBottomWidth: 1 },
  tableCell:        { flex: 1, textAlign: 'center', fontSize: fontSize.sm },
});
