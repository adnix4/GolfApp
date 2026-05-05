import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, FlatList,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { LeaderboardRow, useTheme } from '@gfp/ui';
import { eventsApi, type LeaderboardEntry } from '@/lib/api';
import { useResponsive } from '@/lib/responsive';
import type { LeaderboardEntryDTO } from '@gfp/shared-types';

export default function LeaderboardScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const { pagePadding } = useResponsive();

  const [entries,   setEntries]   = useState<LeaderboardEntry[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      setEntries(await eventsApi.getLeaderboard(id));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load leaderboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Map local LeaderboardEntry → LeaderboardEntryDTO expected by LeaderboardRow
  function toDTO(entry: LeaderboardEntry): LeaderboardEntryDTO {
    return {
      rank:          entry.rank,
      teamId:        entry.teamId,
      teamName:      entry.teamName,
      toPar:         entry.toPar,
      grossTotal:    entry.grossTotal,
      holesComplete: entry.holesComplete,
      isComplete:    entry.isComplete,
      sponsorBadge:  null,
    };
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;
  }

  return (
    <View style={[styles.page, { padding: pagePadding }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.primary }]}>Leaderboard</Text>
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
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.colors.accent }]}>
            No scores submitted yet.
          </Text>
        </View>
      ) : (
        <View style={[styles.table, { borderColor: '#e8e8e8' }]}>
          {/* Column headers */}
          <View style={[styles.colHeader, { borderBottomColor: '#e8e8e8', backgroundColor: theme.colors.highlight }]}>
            <Text style={[styles.colRank,   { color: theme.colors.primary }]}>#</Text>
            <Text style={[styles.colName,   { color: theme.colors.primary }]}>Team</Text>
            <Text style={[styles.colToPar,  { color: theme.colors.primary }]}>To Par</Text>
            <Text style={[styles.colThru,   { color: theme.colors.primary }]}>Thru</Text>
          </View>
          <FlatList
            data={entries}
            keyExtractor={e => e.teamId}
            renderItem={({ item }) => <LeaderboardRow entry={toDTO(item)} />}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title:  { fontSize: 22, fontWeight: '800' },
  refreshBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 80,
    alignItems: 'center',
  },
  refreshText: { fontSize: 14, fontWeight: '600' },
  errorBox: {
    backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, marginBottom: 12,
    borderLeftWidth: 3, borderLeftColor: '#e74c3c',
  },
  errorText:  { color: '#c0392b', fontSize: 14 },
  emptyText:  { fontSize: 15 },
  table: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    flex: 1,
  },
  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  colRank:  { width: 32, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  colName:  { flex: 1, fontSize: 12, fontWeight: '700', paddingHorizontal: 12 },
  colToPar: { width: 44, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  colThru:  { width: 44, fontSize: 12, fontWeight: '700', textAlign: 'right', marginLeft: 8 },
});
