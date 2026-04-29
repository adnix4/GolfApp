import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
  ScrollView, Platform, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { useSession, getHoleOrder } from '@/lib/session';
import type { SyncConflictDto } from '@/lib/api';

// ── SCORE ROW ─────────────────────────────────────────────────────────────────

function ScoreRow({
  holeNumber, par, grossScore, putts, isConflicted,
}: {
  holeNumber:  number;
  par:         number;
  grossScore:  number;
  putts:       number | null;
  isConflicted: boolean;
}) {
  const theme    = useTheme();
  const relative = grossScore - par;
  const relLabel = relative === 0 ? 'E' : relative > 0 ? `+${relative}` : `${relative}`;
  const relColor = relative < 0 ? '#27ae60' : relative > 0 ? '#e74c3c' : theme.colors.accent;

  return (
    <View style={[
      rowStyles.row,
      { backgroundColor: isConflicted ? '#fff8f0' : theme.colors.surface },
    ]}>
      <Text style={[rowStyles.hole, { color: theme.colors.primary }]}>{holeNumber}</Text>
      <Text style={[rowStyles.par,  { color: theme.colors.accent  }]}>{par}</Text>
      <Text style={[rowStyles.score, { color: theme.colors.primary }]}>{grossScore}</Text>
      <Text style={[rowStyles.rel,   { color: relColor }]}>{relLabel}</Text>
      <Text style={[rowStyles.putts, { color: theme.colors.accent }]}>
        {putts != null ? putts : '—'}
        {isConflicted ? ' ⚠' : ''}
      </Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row:   { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, marginBottom: 4 },
  hole:  { width: 36, fontWeight: '700', fontSize: 14 },
  par:   { width: 36, fontSize: 14, textAlign: 'center' },
  score: { width: 48, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  rel:   { width: 40, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  putts: { flex: 1,   fontSize: 13, textAlign: 'right' },
});

// ── CONFLICT CARD ─────────────────────────────────────────────────────────────

function ConflictCard({ conflict }: { conflict: SyncConflictDto }) {
  const theme = useTheme();
  return (
    <View style={[conflictStyles.card, { backgroundColor: '#fff8f0', borderColor: '#e67e22' }]}>
      <Text style={conflictStyles.title}>⚠ Score conflict — Hole {conflict.holeNumber}</Text>
      <Text style={[conflictStyles.detail, { color: theme.colors.primary }]}>
        Your score: {conflict.submittedScore}{'  '}|{'  '}Other device: {conflict.existingScore}
      </Text>
      <Text style={conflictStyles.hint}>Contact the event organizer to resolve.</Text>
    </View>
  );
}

const conflictStyles = StyleSheet.create({
  card:   { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 8 },
  title:  { fontSize: 14, fontWeight: '700', color: '#e67e22', marginBottom: 4 },
  detail: { fontSize: 13, marginBottom: 4 },
  hint:   { fontSize: 12, color: '#999' },
});

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────

export default function SummaryScreen() {
  const theme                                       = useTheme();
  const router                                      = useRouter();
  const { session, loading, pendingScores, syncStatus, syncScores, clearSession } = useSession();

  const [syncing,   setSyncing]   = useState(false);
  const [conflicts, setConflicts] = useState<SyncConflictDto[]>([]);

  useEffect(() => {
    if (!loading && !session) {
      router.replace('/');
    }
  }, [loading, session]);

  const holeOrder = useMemo(
    () => session ? getHoleOrder(session.team.startingHole, session.event.holes) : [],
    [session],
  );

  if (loading || !session) {
    return (
      <View style={[styles.center, { backgroundColor: theme.pageBackground }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // Aggregate totals
  const grossTotal = pendingScores.reduce((sum, s) => sum + s.grossScore, 0);
  const toPar      = pendingScores.reduce((sum, s) => {
    const hole = session.course?.holes.find(h => h.holeNumber === s.holeNumber);
    return sum + s.grossScore - (hole?.par ?? 4);
  }, 0);
  const toParLabel =
    toPar === 0 ? 'Even' :
    toPar > 0   ? `+${toPar}` :
                  `${toPar}`;
  const toParColor = toPar < 0 ? '#27ae60' : toPar > 0 ? '#e74c3c' : theme.colors.accent;

  const holesComplete = pendingScores.length;
  const totalHoles    = session.event.holes;

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncScores();
      if (result && result.conflictDetails.length > 0) {
        setConflicts(result.conflictDetails);
      } else {
        setConflicts([]);
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleNewRound() {
    await clearSession();
    router.replace('/');
  }

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: theme.pageBackground }]}>
      {/* ── HEADER ── */}
      <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
        <Text style={[styles.headerTitle, { color: theme.colors.highlight }]}>Round Summary</Text>
        <Text style={[styles.headerTeam,  { color: theme.colors.highlight }]} numberOfLines={1}>
          {session.team.name}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ── TOTALS CARD ── */}
        <View style={[styles.totalsCard, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.totalsRow}>
            <View style={styles.totalItem}>
              <Text style={[styles.totalValue, { color: theme.colors.primary }]}>{grossTotal}</Text>
              <Text style={[styles.totalLabel, { color: theme.colors.accent }]}>Gross</Text>
            </View>
            <View style={[styles.totalDivider, { backgroundColor: '#e0e0e0' }]} />
            <View style={styles.totalItem}>
              <Text style={[styles.totalValue, { color: toParColor }]}>{toParLabel}</Text>
              <Text style={[styles.totalLabel, { color: theme.colors.accent }]}>To Par</Text>
            </View>
            <View style={[styles.totalDivider, { backgroundColor: '#e0e0e0' }]} />
            <View style={styles.totalItem}>
              <Text style={[styles.totalValue, { color: theme.colors.primary }]}>
                {holesComplete}/{totalHoles}
              </Text>
              <Text style={[styles.totalLabel, { color: theme.colors.accent }]}>Holes</Text>
            </View>
          </View>
        </View>

        {/* ── CONFLICTS ── */}
        {conflicts.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Score Conflicts</Text>
            {conflicts.map(c => (
              <ConflictCard key={c.holeNumber} conflict={c} />
            ))}
          </View>
        )}

        {/* ── SYNC BUTTON ── */}
        <Pressable
          onPress={handleSync}
          disabled={syncing || syncStatus === 'synced'}
          style={({ pressed }) => [
            styles.syncBtn,
            {
              backgroundColor:
                syncStatus === 'synced' ? '#27ae60' :
                pressed                ? theme.colors.accent :
                                          theme.colors.primary,
              opacity: syncing ? 0.7 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Sync scores to server"
        >
          {syncing
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.syncBtnText}>
                {syncStatus === 'synced' ? '✓ Scores Synced' :
                 syncStatus === 'error'  ? 'Retry Sync' :
                                           'Sync Scores'}
              </Text>}
        </Pressable>

        {syncStatus === 'error' && (
          <Text style={styles.syncError}>Sync failed. Check your connection and try again.</Text>
        )}

        {/* ── HOLE-BY-HOLE TABLE ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Scorecard</Text>

          {/* Table header */}
          <View style={[styles.tableHeader, { backgroundColor: theme.colors.primary }]}>
            <Text style={[rowStyles.hole, styles.thText]}>Hole</Text>
            <Text style={[rowStyles.par,  styles.thText]}>Par</Text>
            <Text style={[rowStyles.score, styles.thText]}>Score</Text>
            <Text style={[rowStyles.rel,   styles.thText]}>+/−</Text>
            <Text style={[rowStyles.putts, styles.thText]}>Putts</Text>
          </View>

          {holeOrder.map(holeNum => {
            const score      = pendingScores.find(s => s.holeNumber === holeNum);
            const hole       = session.course?.holes.find(h => h.holeNumber === holeNum);
            const par        = hole?.par ?? 4;
            const isConflict = conflicts.some(c => c.holeNumber === holeNum);

            if (!score) {
              // Hole not scored
              return (
                <View key={holeNum} style={[rowStyles.row, { backgroundColor: theme.colors.surface, opacity: 0.45 }]}>
                  <Text style={[rowStyles.hole, { color: theme.colors.primary }]}>{holeNum}</Text>
                  <Text style={[rowStyles.par,  { color: theme.colors.accent  }]}>{par}</Text>
                  <Text style={[rowStyles.score, { color: theme.colors.accent }]}>—</Text>
                  <Text style={[rowStyles.rel,   { color: theme.colors.accent }]}>—</Text>
                  <Text style={[rowStyles.putts, { color: theme.colors.accent }]}>—</Text>
                </View>
              );
            }

            return (
              <ScoreRow
                key={holeNum}
                holeNumber={holeNum}
                par={par}
                grossScore={score.grossScore}
                putts={score.putts}
                isConflicted={isConflict}
              />
            );
          })}
        </View>

        {/* ── NEW ROUND ── */}
        <Pressable
          onPress={handleNewRound}
          style={({ pressed }) => [
            styles.newRoundBtn,
            { borderColor: theme.colors.primary, opacity: pressed ? 0.6 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Leave this event and start a new round"
        >
          <Text style={[styles.newRoundText, { color: theme.colors.primary }]}>Leave Event</Text>
        </Pressable>

        <Text style={[styles.hint, { color: theme.colors.accent }]}>
          Your scores are saved locally. Sync ensures the organizer has your latest results.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },

  header: {
    paddingTop:        Platform.OS === 'android' ? 12 : 0,
    paddingBottom:     14,
    paddingHorizontal: 20,
    alignItems:        'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  headerTeam:  { fontSize: 14, fontWeight: '500', marginTop: 4, opacity: 0.85 },

  totalsCard: {
    borderRadius: 14, padding: 20, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  totalsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  totalItem: { alignItems: 'center', flex: 1 },
  totalValue: { fontSize: 36, fontWeight: '800' },
  totalLabel: { fontSize: 12, fontWeight: '600', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  totalDivider: { width: 1, height: 48, marginHorizontal: 8 },

  section:      { marginTop: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },

  tableHeader: {
    flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 8, marginBottom: 4,
  },
  thText: { color: '#fff', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },

  syncBtn: {
    paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 4,
  },
  syncBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  syncError:   { fontSize: 13, color: '#c0392b', textAlign: 'center', marginBottom: 8 },

  newRoundBtn: {
    marginTop: 20, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    borderWidth: 2,
  },
  newRoundText: { fontSize: 15, fontWeight: '700' },

  hint: { fontSize: 12, textAlign: 'center', marginTop: 12, lineHeight: 18 },
});
