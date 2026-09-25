import { memo, useEffect, useState } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, Modal,
  ActivityIndicator, SafeAreaView, Platform,
} from 'react-native';
import { useTheme } from '@gfp/ui';
import { useLiveLeaderboard, type HoleInOneAlert as HoleInOneData } from '@gfp/shared-types';
import { formatRelativeAge, resolveLeaderboardState, type LeaderboardState } from '@/lib/leaderboardState';
import { useSession } from '@/lib/session';
import { fetchLeaderboard } from '@/lib/api';
import type { PublicLeaderboardEntry, PublicIndividualEntry } from '@/lib/api';

// Spec §3 Phase 3: SignalR is primary; 15 s HTTP fallback only when the hub
// connection is down. Spec §2.4: offline-mode events disable live leaderboard
// on mobile to conserve battery — useLiveLeaderboard short-circuits both
// transports when the `disabled` flag is set.
const FALLBACK_POLL_MS = 15_000;
const BASE             = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';

// ── ROW (memoized) ────────────────────────────────────────────────────────────
// Pulls theme from context so identity is stable across parent re-renders.
// Memo cuts re-renders to only rows whose entry actually changed.

const StandingRow = memo(function StandingRow({
  entry, stableford,
}: { entry: PublicLeaderboardEntry; stableford: boolean }) {
  const theme = useTheme();
  // Stableford ranks on points (per golfer, summed — U8), so that's the
  // headline number; everything else ranks on to-par.
  const toParLabel =
    stableford        ? `${entry.stablefordPoints}` :
    entry.toPar === 0 ? 'E' :
    entry.toPar > 0   ? `+${entry.toPar}` :
                        `${entry.toPar}`;
  const toParColor =
    stableford      ? theme.colors.primary :
    entry.toPar < 0 ? '#27ae60' :
    entry.toPar > 0 ? '#e74c3c' :
                      theme.colors.primary;
  const thru = entry.isComplete ? 'F' : `${entry.holesComplete}`;
  const back = entry.holesComplete === 0 || entry.strokesBack === 0 ? '—' : `${entry.strokesBack}`;
  const bestHole  = entry.bestHole == null ? '—' : `${entry.bestHole}`;
  const bestScore = entry.bestHoleScore == null ? '—' : `${entry.bestHoleScore}`;

  return (
    <View style={[rowStyles.row, { borderBottomColor: '#f0f0f0' }]}>
      <Text style={[rowStyles.rank,  { color: theme.mutedText   }]}>{entry.rank}</Text>
      <Text style={[rowStyles.team,  { color: theme.colors.primary  }]} numberOfLines={1}>{entry.teamName}</Text>
      <Text style={[rowStyles.toPar, { color: toParColor            }]} numberOfLines={1}>{toParLabel}</Text>
      <Text style={[rowStyles.back,  { color: theme.colors.primary  }]}>{back}</Text>
      <Text style={[rowStyles.num,   { color: theme.colors.primary  }]}>{bestHole}</Text>
      <Text style={[rowStyles.num,   { color: theme.colors.primary  }]}>{bestScore}</Text>
      <Text style={[rowStyles.thru,  { color: theme.mutedText   }]}>{thru}</Text>
    </View>
  );
});

// Stroke Play is individual (Rule 3.3, U8) — one row per golfer.
const GolferRow = memo(function GolferRow({ entry }: { entry: PublicIndividualEntry }) {
  const theme = useTheme();
  const scored = entry.holesComplete > 0;
  const toParLabel =
    !scored           ? '—' :
    entry.toPar === 0 ? 'E' :
    entry.toPar > 0   ? `+${entry.toPar}` :
                        `${entry.toPar}`;
  const toParColor =
    entry.toPar < 0 ? '#27ae60' :
    entry.toPar > 0 ? '#e74c3c' :
                      theme.colors.primary;
  const back = !scored || entry.strokesBack === 0 ? '—' : `${entry.strokesBack}`;
  const thru = !scored ? '—' : entry.isComplete ? 'F' : `${entry.holesComplete}`;

  return (
    <View style={[rowStyles.row, { borderBottomColor: '#f0f0f0' }]}>
      <Text style={[rowStyles.rank, { color: theme.mutedText }]}>{entry.rank || '—'}</Text>
      <View style={rowStyles.team}>
        <Text style={[rowStyles.golfer, { color: theme.colors.primary }]} numberOfLines={1}>{entry.playerName}</Text>
        <Text style={[rowStyles.golferTeam, { color: theme.mutedText }]} numberOfLines={1}>{entry.teamName}</Text>
      </View>
      <Text style={[rowStyles.toPar, { color: toParColor }]} numberOfLines={1}>{toParLabel}</Text>
      <Text style={[rowStyles.back,  { color: theme.colors.primary }]}>{back}</Text>
      <Text style={[rowStyles.num,   { color: theme.colors.primary }]}>{scored ? entry.grossTotal : '—'}</Text>
      <Text style={[rowStyles.thru,  { color: theme.mutedText }]}>{thru}</Text>
    </View>
  );
});

const rowStyles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  rank:  { width: 32,  fontSize: 13, fontWeight: '700', textAlign: 'center' },
  team:  { flex: 1,    fontSize: 14, fontWeight: '600', marginHorizontal: 8 },
  toPar: { width: 44,  fontSize: 15, fontWeight: '800', textAlign: 'right' },
  back:  { width: 40,  fontSize: 13, textAlign: 'right', marginLeft: 8 },
  num:   { width: 44,  fontSize: 13, textAlign: 'right', marginLeft: 8 },
  thru:  { width: 36,  fontSize: 13, textAlign: 'right', marginLeft: 8 },
  golfer:     { fontSize: 14, fontWeight: '600' },
  golferTeam: { fontSize: 12 },
});

// ── HEADER ROW ────────────────────────────────────────────────────────────────

function TableHeader({ stableford = false, golfers = false }: { stableford?: boolean; golfers?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[rowStyles.row, { backgroundColor: theme.colors.highlight }]}>
      <Text style={[rowStyles.rank,  headerStyles.th, { color: theme.colors.primary }]}>#</Text>
      <Text style={[rowStyles.team,  headerStyles.th, { color: theme.colors.primary }]}>{golfers ? 'Golfer' : 'Team'}</Text>
      <Text style={[rowStyles.toPar, headerStyles.th, { color: theme.colors.primary }]}>{stableford ? 'Pts' : 'To Par'}</Text>
      <Text style={[rowStyles.back,  headerStyles.th, { color: theme.colors.primary }]}>Back</Text>
      {golfers ? (
        <Text style={[rowStyles.num, headerStyles.th, { color: theme.colors.primary }]}>Gross</Text>
      ) : (
        <>
          <Text style={[rowStyles.num, headerStyles.th, { color: theme.colors.primary }]}>Best</Text>
          <Text style={[rowStyles.num, headerStyles.th, { color: theme.colors.primary }]}>Score</Text>
        </>
      )}
      <Text style={[rowStyles.thru,  headerStyles.th, { color: theme.colors.primary }]}>Thru</Text>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  th: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});

// ── HOLE-IN-ONE OVERLAY ───────────────────────────────────────────────────────

function HoleInOneOverlay({
  data,
  onDismiss,
}: {
  data:      HoleInOneData;
  onDismiss: () => void;
}) {
  const theme = useTheme();

  // Auto-dismiss after 5 s on mobile (shorter than the 30 s web banner)
  useEffect(() => {
    const id = setTimeout(onDismiss, 5_000);
    return () => clearTimeout(id);
  }, [onDismiss]);

  return (
    <Modal transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={hioStyles.backdrop}>
        {/* Dismiss layer behind the card — a sibling, not a parent, so the
            "Amazing!" button isn't a <button> nested inside another Pressable's
            <button> (invalid DOM on web). */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityLabel="Dismiss hole-in-one alert"
          accessibilityRole="button"
        />
        <View style={[hioStyles.card, { backgroundColor: theme.colors.highlight }]}>
          <Text style={hioStyles.flag}>⛳</Text>
          <Text style={[hioStyles.headline, { color: theme.colors.primary }]}>HOLE-IN-ONE!</Text>
          <Text style={[hioStyles.name, { color: theme.colors.primary }]}>{data.playerName}</Text>
          <Text style={[hioStyles.sub,  { color: theme.mutedText  }]}>Hole {data.holeNumber}</Text>
          <Pressable style={[hioStyles.btn, { backgroundColor: theme.colors.primary }]} onPress={onDismiss}>
            <Text style={hioStyles.btnText}>Amazing!</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const hioStyles = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  card:      { width: '82%', borderRadius: 20, padding: 32, alignItems: 'center', gap: 8 },
  flag:      { fontSize: 64, marginBottom: 8 },
  headline:  { fontSize: 28, fontWeight: '900', letterSpacing: 1 },
  name:      { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  sub:       { fontSize: 16, fontWeight: '500' },
  btn:       { marginTop: 16, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12 },
  btnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ── STATUS TICKER ─────────────────────────────────────────────────────────────
// Isolated so its 10 s tick doesn't re-render the FlatList rows.

function StatusBar({
  error, connected, offline, lastUpdated, onRefresh, loading,
}: {
  error:       boolean;
  connected:   boolean;
  offline:     boolean;
  lastUpdated: Date | null;
  onRefresh:   () => void;
  loading:     boolean;
}) {
  const theme = useTheme();
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Re-seeded on every refresh, not just on the 10s tick: a poll landing
  // between two ticks would otherwise be measured against a stale snapshot.
  useEffect(() => {
    setNowTick(Date.now());
    if (offline) return;
    const t = setInterval(() => setNowTick(Date.now()), 10_000);
    return () => clearInterval(t);
  }, [offline, lastUpdated]);

  const agoText = lastUpdated ? formatRelativeAge(nowTick, lastUpdated.getTime()) : '';

  const label = offline
    ? 'Live updates paused (offline mode)'
    : error
      ? lastUpdated ? `⚠ Connection lost · Last updated ${agoText}` : '⚠ Cannot reach server'
      : !lastUpdated
        ? 'Loading…'
        : connected
          ? `Live · Updated ${agoText}`
          : `Updated ${agoText} · polling every ${FALLBACK_POLL_MS / 1000}s`;

  const bg   = error ? '#fdf2f2' : offline ? '#fff7e6' : '#f0faf4';
  const fg   = error ? '#c0392b' : offline ? '#a67100' : '#27ae60';

  return (
    <View style={[styles.statusBar, { backgroundColor: bg }]}>
      <Text style={[styles.statusText, { color: fg }]}>{label}</Text>
      {/* Shown in offline mode too — that is exactly when a manual fetch
          matters, since nothing is polling. refresh() is deliberately not
          gated on `disabled` for the same reason. */}
      {!loading && (
        <Pressable
          onPress={onRefresh}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Refresh standings"
        >
          <Text style={[styles.refreshBtn, { color: theme.colors.primary }]}>↻</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────

/**
 * What each non-ready state tells the golfer. The offline copy is the one that
 * matters: the event's offlineMode disables both transports, so nothing was
 * ever fetched — saying "no scores" there is a guess, and it was wrong.
 */
const EMPTY_COPY: Record<Exclude<LeaderboardState, 'ready' | 'loading'>, {
  icon: string; title: string; sub: string;
}> = {
  offline: {
    icon:  '📴',
    title: 'Live Standings Off',
    sub:   'This event runs in offline mode to save battery. Tap ↻ above to fetch the standings once.',
  },
  error: {
    icon:  '📡',
    title: "Couldn't Reach Scoring",
    sub:   'Standings will catch up when the connection returns. Tap ↻ above to try again.',
  },
  empty: {
    icon:  '🏆',
    title: 'No Scores Yet',
    sub:   'Standings will appear once teams start scoring.',
  },
};

export default function LeaderboardScreen() {
  const theme       = useTheme();
  const { session } = useSession();
  const offlineMode = session?.event.offlineMode ?? false;
  const format      = session?.event.format ?? 'Scramble';
  const isStroke    = format === 'Stroke';
  // Stroke Play is scored per golfer (Rule 3.3, U8), so that board leads.
  const [boardView, setBoardView] = useState<'golfers' | 'teams'>('golfers');

  const {
    standings, individuals, loading, connected, error, lastUpdated,
    hioAlert, dismissHioAlert, refresh,
  } = useLiveLeaderboard<PublicLeaderboardEntry, PublicIndividualEntry>({
    baseUrl:        BASE,
    eventCode:      session?.event.eventCode,
    disabled:       offlineMode,
    pollIntervalMs: FALLBACK_POLL_MS,
    fetchStandings: async (code) => {
      // The mobile fetchLeaderboard throws on failure; convert to null so the
      // hook flags an error state without surfacing the exception.
      try {
        const result = await fetchLeaderboard(code);
        return { standings: result.standings, individuals: result.individuals ?? null };
      } catch {
        return null;
      }
    },
  });

  // One empty view for three different situations was reporting a cause it had
  // no evidence for — see lib/leaderboardState.ts.
  const view = resolveLeaderboardState({ offlineMode, error, standings, loading });

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: theme.pageBackground }]}>

      {hioAlert && <HoleInOneOverlay data={hioAlert} onDismiss={dismissHioAlert} />}

      <StatusBar
        error={error}
        connected={connected}
        offline={offlineMode}
        lastUpdated={lastUpdated}
        onRefresh={refresh}
        loading={loading}
      />

      {view === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : view !== 'ready' ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>{EMPTY_COPY[view].icon}</Text>
          <Text style={[styles.emptyTitle, { color: theme.colors.primary }]}>
            {EMPTY_COPY[view].title}
          </Text>
          <Text style={[styles.emptySub,   { color: theme.mutedText  }]}>
            {EMPTY_COPY[view].sub}
          </Text>
        </View>
      ) : isStroke && boardView === 'golfers' && individuals ? (
        <>
          <BoardToggle value={boardView} onChange={setBoardView} />
          <FlatList
            data={individuals}
            keyExtractor={item => item.playerId}
            ListHeaderComponent={<TableHeader golfers />}
            renderItem={({ item }) => <GolferRow entry={item} />}
            contentContainerStyle={styles.list}
            stickyHeaderIndices={[0]}
          />
        </>
      ) : (
        <>
          {isStroke && individuals && <BoardToggle value={boardView} onChange={setBoardView} />}
          <FlatList
            data={standings}
            keyExtractor={item => item.teamId}
            ListHeaderComponent={<TableHeader stableford={format === 'Stableford'} />}
            renderItem={({ item }) => <StandingRow entry={item} stableford={format === 'Stableford'} />}
            contentContainerStyle={styles.list}
            stickyHeaderIndices={[0]}
          />
        </>
      )}
    </SafeAreaView>
  );
}

function BoardToggle({
  value, onChange,
}: { value: 'golfers' | 'teams'; onChange: (v: 'golfers' | 'teams') => void }) {
  const theme = useTheme();
  return (
    <View style={styles.toggleRow} accessibilityRole="tablist">
      {(['golfers', 'teams'] as const).map(v => (
        <Pressable
          key={v}
          onPress={() => onChange(v)}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === v }}
          style={[
            styles.toggleTab,
            { borderColor: theme.colors.primary },
            value === v && { backgroundColor: theme.colors.primary },
          ]}
        >
          <Text style={[styles.toggleText, { color: value === v ? theme.buttonLabel : theme.colors.primary }]}>
            {v === 'golfers' ? 'Golfers' : 'Teams'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page:    { flex: 1 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  list:    { paddingBottom: Platform.OS === 'ios' ? 24 : 16 },

  statusBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  statusText:  { fontSize: 12, fontWeight: '600' },
  refreshBtn:  { fontSize: 20, fontWeight: '700' },

  emptyIcon:  { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '800' },
  emptySub:   { fontSize: 14, marginTop: 4, textAlign: 'center', paddingHorizontal: 32 },

  toggleRow:  { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  toggleTab:  { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
  toggleText: { fontSize: 13, fontWeight: '700' },
});
