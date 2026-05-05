import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, FlatList,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { eventsApi, type LeaderboardEntry, type EventDetail } from '@/lib/api';
import { useResponsive } from '@/lib/responsive';

function formatScore(toPar: number): string {
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 0) return <Text style={styles.rankBadge}>—</Text>;
  if (rank === 1) return <Text style={[styles.rankBadge, styles.rank1]}>1</Text>;
  if (rank === 2) return <Text style={[styles.rankBadge, styles.rank2]}>2</Text>;
  if (rank === 3) return <Text style={[styles.rankBadge, styles.rank3]}>3</Text>;
  return <Text style={styles.rankBadge}>{rank}</Text>;
}

export default function LeaderboardScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const theme   = useTheme();
  const { pagePadding } = useResponsive();

  const [event,     setEvent]     = useState<EventDetail | null>(null);
  const [entries,   setEntries]   = useState<LeaderboardEntry[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const [evt, board] = await Promise.all([
        eventsApi.get(id),
        eventsApi.getLeaderboard(id),
      ]);
      setEvent(evt);
      setEntries(board);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load leaderboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const isStableford = event?.format === 'Stableford';

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;
  }

  return (
    <View style={[styles.page, { padding: pagePadding }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.colors.primary }]}>Leaderboard</Text>
          {event && (
            <Text style={[styles.formatBadge, { color: theme.colors.accent }]}>
              {event.format} · {event.holes} holes
            </Text>
          )}
        </View>
        <Pressable
          style={[styles.refreshBtn, { borderColor: theme.colors.action }]}
          onPress={() => load(true)}
          disabled={refreshing}
        >
          {refreshing
            ? <ActivityIndicator size="small" color={theme.colors.action} />
            : <Text style={[styles.refreshText, { color: theme.colors.action }]}>Refresh</Text>}
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {entries.length === 0 && !error ? (
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyText, { color: theme.colors.accent }]}>
            No scores submitted yet.
          </Text>
        </View>
      ) : (
        <View style={[styles.table, { borderColor: '#e8e8e8' }]}>
          <View style={[styles.colHeader, { backgroundColor: theme.colors.highlight, borderBottomColor: '#e8e8e8' }]}>
            <Text style={[styles.colRank,  { color: theme.colors.primary }]}>#</Text>
            <Text style={[styles.colName,  { color: theme.colors.primary }]}>Team</Text>
            {isStableford
              ? <Text style={[styles.colScore, { color: theme.colors.primary }]}>Pts</Text>
              : <Text style={[styles.colScore, { color: theme.colors.primary }]}>To Par</Text>}
            <Text style={[styles.colThru,  { color: theme.colors.primary }]}>Thru</Text>
          </View>

          <FlatList
            data={entries}
            keyExtractor={e => e.teamId}
            renderItem={({ item, index }) => (
              <View style={[styles.row, index % 2 === 1 && styles.rowAlt]}>
                <View style={styles.colRank}>
                  <RankBadge rank={item.rank} />
                </View>
                <View style={styles.colName}>
                  <Text style={[styles.teamName, { color: theme.colors.primary }]} numberOfLines={1}>
                    {item.teamName}
                  </Text>
                  {item.isComplete && (
                    <Text style={[styles.finishedTag, { color: theme.colors.action }]}>F</Text>
                  )}
                </View>
                <Text style={[
                  styles.colScore,
                  { color: isStableford
                    ? theme.colors.primary
                    : item.toPar < 0 ? '#27ae60' : item.toPar > 0 ? '#e74c3c' : theme.colors.primary },
                  styles.scoreText,
                ]}>
                  {item.holesComplete === 0
                    ? '—'
                    : isStableford
                      ? `${item.stablefordPoints}`
                      : formatScore(item.toPar)}
                </Text>
                <Text style={[styles.colThru, styles.thruText, { color: theme.colors.accent }]}>
                  {item.holesComplete === 0 ? '—' : item.isComplete ? 'F' : item.holesComplete}
                </Text>
              </View>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 15 },

  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title:       { fontSize: 22, fontWeight: '800' },
  formatBadge: { fontSize: 13, marginTop: 2 },

  refreshBtn:  { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, minWidth: 80, alignItems: 'center' },
  refreshText: { fontSize: 14, fontWeight: '600' },

  errorBox:  { backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
  errorText: { color: '#c0392b', fontSize: 14 },

  table:     { borderWidth: 1, borderRadius: 12, overflow: 'hidden', flex: 1 },
  colHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1 },

  row:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  rowAlt: { backgroundColor: '#fafafa' },

  colRank:  { width: 36, alignItems: 'center' },
  colName:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  colScore: { width: 52, textAlign: 'right', fontSize: 12, fontWeight: '700' },
  colThru:  { width: 44, textAlign: 'right', fontSize: 12, fontWeight: '700', marginLeft: 8 },

  rankBadge: { fontSize: 13, fontWeight: '700', textAlign: 'center', width: 28 },
  rank1: { color: '#d4af37', fontSize: 14 },
  rank2: { color: '#9e9e9e' },
  rank3: { color: '#cd7f32' },

  teamName:   { fontSize: 15, fontWeight: '600', flex: 1 },
  finishedTag:{ fontSize: 11, fontWeight: '700' },
  scoreText:  { fontSize: 15, fontWeight: '800' },
  thruText:   { fontSize: 14 },
});
