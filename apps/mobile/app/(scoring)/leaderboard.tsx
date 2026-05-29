import { memo, useEffect, useState } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, Modal,
  ActivityIndicator, SafeAreaView, Platform,
} from 'react-native';
import { useTheme } from '@gfp/ui';
import { useLiveLeaderboard, type HoleInOneAlert as HoleInOneData } from '@gfp/shared-types';
import { useSession } from '@/lib/session';
import { fetchLeaderboard } from '@/lib/api';
import type { PublicLeaderboardEntry } from '@/lib/api';

// Spec §3 Phase 3: SignalR is primary; 15 s HTTP fallback only when the hub
// connection is down. Spec §2.4: offline-mode events disable live leaderboard
// on mobile to conserve battery — useLiveLeaderboard short-circuits both
// transports when the `disabled` flag is set.
const FALLBACK_POLL_MS = 15_000;
const BASE             = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';

// ── ROW (memoized) ────────────────────────────────────────────────────────────
// Pulls theme from context so identity is stable across parent re-renders.
// Memo cuts re-renders to only rows whose entry actually changed.

const StandingRow = memo(function StandingRow({ entry }: { entry: PublicLeaderboardEntry }) {
  const theme = useTheme();
  const toParLabel =
    entry.toPar === 0 ? 'E' :
    entry.toPar > 0   ? `+${entry.toPar}` :
                        `${entry.toPar}`;
  const toParColor =
    entry.toPar < 0 ? '#27ae60' :
    entry.toPar > 0 ? '#e74c3c' :
                      theme.colors.primary;
  const thru = entry.isComplete ? 'F' : `${entry.holesComplete}`;

  return (
    <View style={[rowStyles.row, { borderBottomColor: '#f0f0f0' }]}>
      <Text style={[rowStyles.rank,  { color: theme.colors.accent   }]}>{entry.rank}</Text>
      <Text style={[rowStyles.team,  { color: theme.colors.primary  }]} numberOfLines={1}>{entry.teamName}</Text>
      <Text style={[rowStyles.toPar, { color: toParColor            }]} numberOfLines={1}>{toParLabel}</Text>
      <Text style={[rowStyles.thru,  { color: theme.colors.accent   }]}>{thru}</Text>
    </View>
  );
});

const rowStyles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  rank:  { width: 32,  fontSize: 13, fontWeight: '700', textAlign: 'center' },
  team:  { flex: 1,    fontSize: 14, fontWeight: '600', marginHorizontal: 8 },
  toPar: { width: 44,  fontSize: 15, fontWeight: '800', textAlign: 'right' },
  thru:  { width: 36,  fontSize: 13, textAlign: 'right', marginLeft: 8 },
});

// ── HEADER ROW ────────────────────────────────────────────────────────────────

function TableHeader() {
  const theme = useTheme();
  return (
    <View style={[rowStyles.row, { backgroundColor: theme.colors.highlight }]}>
      <Text style={[rowStyles.rank,  headerStyles.th, { color: theme.colors.primary }]}>#</Text>
      <Text style={[rowStyles.team,  headerStyles.th, { color: theme.colors.primary }]}>Team</Text>
      <Text style={[rowStyles.toPar, headerStyles.th, { color: theme.colors.primary }]}>To Par</Text>
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

  // Auto-dismiss after 10 s on mobile (shorter than 60 s web banner)
  useEffect(() => {
    const id = setTimeout(onDismiss, 10_000);
    return () => clearTimeout(id);
  }, [onDismiss]);

  return (
    <Modal transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={hioStyles.backdrop} onPress={onDismiss}>
        <View style={[hioStyles.card, { backgroundColor: theme.colors.highlight }]}>
          <Text style={hioStyles.flag}>⛳</Text>
          <Text style={[hioStyles.headline, { color: theme.colors.primary }]}>HOLE-IN-ONE!</Text>
          <Text style={[hioStyles.name, { color: theme.colors.primary }]}>{data.playerName}</Text>
          <Text style={[hioStyles.sub,  { color: theme.colors.accent  }]}>Hole {data.holeNumber}</Text>
          <Pressable style={[hioStyles.btn, { backgroundColor: theme.colors.primary }]} onPress={onDismiss}>
            <Text style={hioStyles.btnText}>Amazing!</Text>
          </Pressable>
        </View>
      </Pressable>
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
  const [nowTick, setNowTick] = useState(() => new Date());

  useEffect(() => {
    if (offline) return;
    const t = setInterval(() => setNowTick(new Date()), 10_000);
    return () => clearInterval(t);
  }, [offline]);

  const agoText = lastUpdated
    ? (() => {
        const diffS = Math.floor((nowTick.getTime() - lastUpdated.getTime()) / 1000);
        return diffS < 60 ? `${diffS}s ago` : `${Math.floor(diffS / 60)}m ago`;
      })()
    : '';

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
      {!loading && !offline && (
        <Pressable onPress={onRefresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.refreshBtn, { color: theme.colors.primary }]}>↻</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────

export default function LeaderboardScreen() {
  const theme       = useTheme();
  const { session } = useSession();
  const offlineMode = session?.event.offlineMode ?? false;

  const {
    standings, loading, connected, error, lastUpdated,
    hioAlert, dismissHioAlert, refresh,
  } = useLiveLeaderboard<PublicLeaderboardEntry>({
    baseUrl:        BASE,
    eventCode:      session?.event.eventCode,
    disabled:       offlineMode,
    pollIntervalMs: FALLBACK_POLL_MS,
    fetchStandings: async (code) => {
      // The mobile fetchLeaderboard throws on failure; convert to null so the
      // hook flags an error state without surfacing the exception.
      try {
        const result = await fetchLeaderboard(code);
        return result.standings;
      } catch {
        return null;
      }
    },
  });

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

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : !standings || standings.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🏆</Text>
          <Text style={[styles.emptyTitle, { color: theme.colors.primary }]}>No Scores Yet</Text>
          <Text style={[styles.emptySub,   { color: theme.colors.accent  }]}>
            Standings will appear once teams start scoring.
          </Text>
        </View>
      ) : (
        <FlatList
          data={standings}
          keyExtractor={item => item.teamId}
          ListHeaderComponent={<TableHeader />}
          renderItem={({ item }) => <StandingRow entry={item} />}
          contentContainerStyle={styles.list}
          stickyHeaderIndices={[0]}
        />
      )}
    </SafeAreaView>
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
});
