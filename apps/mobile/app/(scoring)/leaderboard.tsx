import { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, Modal,
  ActivityIndicator, SafeAreaView, Platform,
} from 'react-native';
import { useTheme } from '@gfp/ui';
import { useSession } from '@/lib/session';
import { fetchLeaderboard } from '@/lib/api';
import type { PublicLeaderboard, PublicLeaderboardEntry } from '@/lib/api';

const POLL_MS = 15_000;
const BASE    = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';

interface HoleInOneData {
  teamName:   string;
  playerName: string;
  holeNumber: number;
}

// ── ROW ───────────────────────────────────────────────────────────────────────

function StandingRow({ entry, theme }: { entry: PublicLeaderboardEntry; theme: ReturnType<typeof useTheme> }) {
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
}

const rowStyles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  rank:  { width: 32,  fontSize: 13, fontWeight: '700', textAlign: 'center' },
  team:  { flex: 1,    fontSize: 14, fontWeight: '600', marginHorizontal: 8 },
  toPar: { width: 44,  fontSize: 15, fontWeight: '800', textAlign: 'right' },
  thru:  { width: 36,  fontSize: 13, textAlign: 'right', marginLeft: 8 },
});

// ── HEADER ROW ────────────────────────────────────────────────────────────────

function TableHeader({ theme }: { theme: ReturnType<typeof useTheme> }) {
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
  theme,
}: {
  data:      HoleInOneData;
  onDismiss: () => void;
  theme:     ReturnType<typeof useTheme>;
}) {
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

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────

export default function LeaderboardScreen() {
  const theme   = useTheme();
  const { session } = useSession();

  const [data,        setData]        = useState<PublicLeaderboard | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nowTick,     setNowTick]     = useState(new Date());
  const [hioAlert,    setHioAlert]    = useState<HoleInOneData | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNowTick(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);

  // ── Polling fallback (SignalR not available in bare React Native without native module) ──
  useEffect(() => {
    if (!session) return;
    const code      = session.event.eventCode;
    let cancelled   = false;

    async function poll() {
      try {
        const result = await fetchLeaderboard(code);
        if (!cancelled) {
          setData(result);
          setLastUpdated(new Date());
          setError(false);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }

    poll();
    intervalRef.current = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [session?.event.eventCode]);

  function agoText(): string {
    if (!lastUpdated) return '';
    const diffS = Math.floor((nowTick.getTime() - lastUpdated.getTime()) / 1000);
    return diffS < 60 ? `${diffS}s ago` : `${Math.floor(diffS / 60)}m ago`;
  }

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: theme.pageBackground }]}>

      {/* ── HOLE-IN-ONE OVERLAY ── */}
      {hioAlert && (
        <HoleInOneOverlay
          data={hioAlert}
          onDismiss={() => setHioAlert(null)}
          theme={theme}
        />
      )}

      {/* ── STATUS BAR ── */}
      <View style={[styles.statusBar, {
        backgroundColor: error ? '#fdf2f2' : '#f0faf4',
      }]}>
        <Text style={[styles.statusText, { color: error ? '#c0392b' : '#27ae60' }]}>
          {error
            ? lastUpdated ? `⚠ Connection lost · Last updated ${agoText()}` : '⚠ Cannot reach server'
            : lastUpdated ? `Live · Updated ${agoText()}` : 'Loading…'}
        </Text>
        {!loading && (
          <Pressable
            onPress={() => {
              if (!session) return;
              fetchLeaderboard(session.event.eventCode)
                .then(r => { setData(r); setLastUpdated(new Date()); setError(false); })
                .catch(() => setError(true));
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.refreshBtn, { color: theme.colors.primary }]}>↻</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : !data || data.standings.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🏆</Text>
          <Text style={[styles.emptyTitle, { color: theme.colors.primary }]}>No Scores Yet</Text>
          <Text style={[styles.emptySub,   { color: theme.colors.accent  }]}>
            Standings will appear once teams start scoring.
          </Text>
        </View>
      ) : (
        <FlatList
          data={data.standings}
          keyExtractor={item => String(item.rank) + item.teamName}
          ListHeaderComponent={<TableHeader theme={theme} />}
          renderItem={({ item }) => <StandingRow entry={item} theme={theme} />}
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
