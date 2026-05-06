import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator,
  StyleSheet, RefreshControl,
} from 'react-native';
import { useTheme } from '@gfp/ui';
import { useSession } from '@/lib/session';
import { fetchMemberSeasonSummary, MemberSeasonSummary } from '@/lib/api';

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

  if (!leagueId || !seasonId || !memberId) return (
    <View style={styles.center}>
      <Text style={[styles.emptyText, { color: theme.colors.accent }]}>
        League play is not linked to this event.
      </Text>
    </View>
  );

  if (error) return (
    <View style={styles.center}>
      <Text style={{ color: '#dc2626' }}>{error}</Text>
    </View>
  );

  if (!summary) return (
    <View style={styles.center}>
      <Text style={[styles.emptyText, { color: theme.colors.accent }]}>
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
          <Text style={[styles.emptyText, { color: theme.colors.accent }]}>No rounds played yet.</Text>
        ) : (
          summary.handicapTrend.map((h) => (
            <View key={h.id} style={[styles.trendRow, { borderColor: theme.colors.accent }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.trendDate, { color: theme.colors.accent }]}>
                  {h.roundDate ?? h.createdAt.slice(0, 10)}
                  {h.adminOverride ? '  (Admin)' : ''}
                </Text>
              </View>
              <View style={styles.trendRight}>
                <Text style={[styles.trendChange, { color: theme.colors.primary }]}>
                  {h.oldIndex.toFixed(1)} → {h.newIndex.toFixed(1)}
                </Text>
                <Text style={[styles.trendDiff, {
                  color: h.differential < 0 ? '#16a34a' : h.differential > 0 ? '#ef4444' : theme.colors.accent
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
          <Text style={[styles.emptyText, { color: theme.colors.accent }]}>No completed rounds.</Text>
        ) : (
          <>
            <View style={[styles.tableHeader, { backgroundColor: theme.colors.primary + '11' }]}>
              {['Date', 'Gross', 'Net', 'Pts'].map(h => (
                <Text key={h} style={[styles.tableCell, { color: theme.colors.accent, fontWeight: '700', fontSize: 11 }]}>{h}</Text>
              ))}
            </View>
            {summary.roundHistory.map(r => (
              <View key={r.roundId} style={[styles.tableRow, { borderBottomColor: theme.colors.accent }]}>
                <Text style={[styles.tableCell, { color: theme.colors.accent }]}>{r.roundDate}</Text>
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

const styles = StyleSheet.create({
  root:             { flex: 1 },
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content:          { padding: 16, paddingBottom: 40, gap: 20 },
  emptyText:        { fontSize: 14, textAlign: 'center' },
  // Profile card
  profileCard:      { borderRadius: 16, padding: 20, gap: 4 },
  profileName:      { color: '#fff', fontSize: 20, fontWeight: '700' },
  profileFlight:    { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 12 },
  profileStats:     { flexDirection: 'row', alignItems: 'center' },
  profileStat:      { flex: 1, alignItems: 'center' },
  profileStatVal:   { color: '#fff', fontSize: 22, fontWeight: '800' },
  profileStatLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  profileStatDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },
  // Section
  section:          { gap: 4 },
  sectionTitle:     { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  // Handicap trend
  trendRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  trendDate:        { fontSize: 13 },
  trendRight:       { alignItems: 'flex-end', gap: 2 },
  trendChange:      { fontSize: 14, fontWeight: '600' },
  trendDiff:        { fontSize: 12 },
  // Table
  tableHeader:      { flexDirection: 'row', paddingVertical: 8, borderRadius: 6 },
  tableRow:         { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1 },
  tableCell:        { flex: 1, textAlign: 'center', fontSize: 13 },
});
