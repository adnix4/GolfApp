import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, FlatList,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useEventDetail } from '@/lib/eventContext';
import { useLeaderboard, useIndividualLeaderboard } from '@/lib/queries';
import { useTheme, useClasses } from '@gfp/ui';
import { FORMAT_LABELS } from '@gfp/shared-types';
import { useResponsive } from '@/lib/responsive';
import { fontSize, radius, spacing } from '@gfp/theme';

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
  const c       = useClasses();
  const { pagePadding } = useResponsive();

  const { event, refresh } = useEventDetail();
  const board      = useLeaderboard(id);
  const individual = useIndividualLeaderboard(id);
  const entries = board.data ?? [];
  // The golfer board is a bonus view; if it fails, it reads as empty.
  const golfers = individual.data ?? [];
  // Stroke Play is scored per golfer (Rule 3.3, U8), so that board leads; the
  // team aggregate stays one tap away.
  const [view,      setView]      = useState<'golfers' | 'teams'>('golfers');
  const [refreshing, setRefreshing] = useState(false);
  const loading = board.isPending;
  const error   = board.error ? (board.error.message || 'Failed to load leaderboard.') : null;

  // The event itself comes from the layout; a manual refresh re-pulls it too.
  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([board.refetch(), individual.refetch(), refresh().catch(() => {})]);
    setRefreshing(false);
  }

  const isStableford = event?.format === 'Stableford';
  const isStroke     = event?.format === 'Stroke';
  const showGolfers  = isStroke && view === 'golfers';

  if (loading) {
    return <View style={c.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;
  }

  return (
    <View style={[c.page, { padding: pagePadding }]}>
      <View style={styles.header}>
        <View>
          <Text style={c.title}>Leaderboard</Text>
          {event && (
            <Text style={[styles.formatBadge, { color: theme.mutedText }]}>
              {FORMAT_LABELS[event.format] ?? event.format} · {event.holes} holes
            </Text>
          )}
        </View>
        <Pressable
          style={[styles.refreshBtn, { borderColor: theme.colors.action }]}
          onPress={handleRefresh}
          disabled={refreshing}
        >
          {refreshing
            ? <ActivityIndicator size="small" color={theme.colors.action} />
            : <Text style={[styles.refreshText, { color: theme.colors.action }]}>Refresh</Text>}
        </Pressable>
      </View>

      {error && (
        <View style={c.errorBox}>
          <Text style={c.errorText}>{error}</Text>
        </View>
      )}

      {isStroke && (
        <View style={styles.viewToggle} accessibilityRole="tablist">
          {(['golfers', 'teams'] as const).map(v => (
            <Pressable
              key={v}
              onPress={() => setView(v)}
              accessibilityRole="tab"
              accessibilityState={{ selected: view === v }}
              style={[styles.viewTab, { borderColor: theme.colors.primary }, view === v && { backgroundColor: theme.colors.primary }]}
            >
              <Text style={[styles.viewTabText, { color: view === v ? theme.buttonLabel : theme.colors.primary }]}>
                {v === 'golfers' ? 'Golfers' : 'Teams'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {showGolfers ? (
        golfers.every(g => g.holesComplete === 0) && !error ? (
          <View style={styles.emptyWrap}>
            <Text style={c.emptyText}>
              No golfer strokes recorded yet.
            </Text>
          </View>
        ) : (
          <View style={[styles.table, { borderColor: '#e8e8e8' }]}>
            <View style={[styles.colHeader, { backgroundColor: theme.colors.highlight, borderBottomColor: '#e8e8e8' }]}>
              <Text style={[styles.colRank,  { color: theme.colors.primary }]}>#</Text>
              <Text style={[styles.colName,  { color: theme.colors.primary }]}>Golfer</Text>
              <Text style={[styles.colScore, { color: theme.colors.primary }]}>To Par</Text>
              <Text style={[styles.colNum,   { color: theme.colors.primary }]}>Back</Text>
              <Text style={[styles.colNum,   { color: theme.colors.primary }]}>Gross</Text>
              <Text style={[styles.colThru,  { color: theme.colors.primary }]}>Thru</Text>
            </View>
            <FlatList
              data={golfers}
              keyExtractor={g => g.playerId}
              renderItem={({ item, index }) => (
                <View style={[styles.row, index % 2 === 1 && styles.rowAlt]}>
                  <View style={styles.colRank}><RankBadge rank={item.rank} /></View>
                  <View style={[styles.colName, styles.golferCol]}>
                    <Text style={[styles.teamName, { color: theme.colors.primary }]} numberOfLines={1}>
                      {item.playerName}
                    </Text>
                    <Text style={[styles.golferTeam, { color: theme.mutedText }]} numberOfLines={1}>
                      {item.teamName}
                    </Text>
                  </View>
                  <Text style={[
                    styles.colScore, styles.scoreText,
                    { color: item.toPar < 0 ? '#27ae60' : item.toPar > 0 ? '#e74c3c' : theme.colors.primary },
                  ]}>
                    {item.holesComplete === 0 ? '—' : formatScore(item.toPar)}
                  </Text>
                  <Text style={[styles.colNum, styles.numText, { color: theme.colors.primary }]}>
                    {item.holesComplete === 0 || item.strokesBack === 0 ? '—' : item.strokesBack}
                  </Text>
                  <Text style={[styles.colNum, styles.numText, { color: theme.colors.primary }]}>
                    {item.holesComplete === 0 ? '—' : item.grossTotal}
                  </Text>
                  <Text style={[styles.colThru, styles.thruText, { color: theme.mutedText }]}>
                    {item.holesComplete === 0 ? '—' : item.isComplete ? 'F' : item.holesComplete}
                  </Text>
                </View>
              )}
            />
          </View>
        )
      ) : entries.length === 0 && !error ? (
        <View style={styles.emptyWrap}>
          <Text style={c.emptyText}>
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
            <Text style={[styles.colNum,   { color: theme.colors.primary }]}>Back</Text>
            <Text style={[styles.colNum,   { color: theme.colors.primary }]}>Best</Text>
            <Text style={[styles.colNum,   { color: theme.colors.primary }]}>Score</Text>
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
                <Text style={[styles.colNum, styles.numText, { color: theme.colors.primary }]}>
                  {item.holesComplete === 0 || item.strokesBack === 0 ? '—' : item.strokesBack}
                </Text>
                <Text style={[styles.colNum, styles.numText, { color: theme.colors.primary }]}>
                  {item.bestHole == null ? '—' : item.bestHole}
                </Text>
                <Text style={[styles.colNum, styles.numText, { color: theme.colors.primary }]}>
                  {item.bestHoleScore == null ? '—' : item.bestHoleScore}
                </Text>
                <Text style={[styles.colThru, styles.thruText, { color: theme.mutedText }]}>
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
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing[4] },
  formatBadge: { fontSize: fontSize.sm, marginTop: spacing[0.5] },

  viewToggle:  { flexDirection: 'row', gap: spacing[2], marginBottom: spacing[3] },
  viewTab:     { borderWidth: 1.5, borderRadius: radius.xl, paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  viewTabText: { fontSize: fontSize.sm, fontWeight: '700' },
  golferCol:   { flexDirection: 'column', alignItems: 'flex-start', gap: 0 },
  golferTeam:  { fontSize: fontSize.xs },

  refreshBtn:  { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing[4], paddingVertical: spacing[2], minWidth: 80, alignItems: 'center' },
  refreshText: { fontSize: fontSize.md, fontWeight: '600' },


  table:     { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden', flex: 1 },
  colHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3], paddingHorizontal: spacing[3], borderBottomWidth: 1 },

  row:    { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3], paddingHorizontal: spacing[3], borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  rowAlt: { backgroundColor: '#fafafa' },

  colRank:  { width: 36, alignItems: 'center' },
  colName:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[3] },
  colScore: { width: 52, textAlign: 'right', fontSize: fontSize.xs, fontWeight: '700' },
  colNum:   { width: 48, textAlign: 'right', fontSize: fontSize.xs, fontWeight: '700', marginLeft: spacing[2] },
  colThru:  { width: 44, textAlign: 'right', fontSize: fontSize.xs, fontWeight: '700', marginLeft: spacing[2] },

  rankBadge: { fontSize: fontSize.sm, fontWeight: '700', textAlign: 'center', width: 28 },
  rank1: { color: '#d4af37', fontSize: fontSize.md },
  rank2: { color: '#9e9e9e' },
  rank3: { color: '#cd7f32' },

  teamName:   { fontSize: fontSize.lg, fontWeight: '600', flex: 1 },
  finishedTag:{ fontSize: fontSize.xxs, fontWeight: '700' },
  scoreText:  { fontSize: fontSize.lg, fontWeight: '800' },
  numText:    { fontSize: fontSize.md, fontWeight: '600' },
  thruText:   { fontSize: fontSize.md },
});
