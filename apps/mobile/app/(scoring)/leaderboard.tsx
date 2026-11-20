import { memo, useEffect, useState } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, Modal,
  ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, useClasses, Heading, GlyphText } from '@gfp/ui';
import { useLiveLeaderboard, type HoleInOneAlert as HoleInOneData } from '@gfp/shared-types';
import { formatRelativeAge, resolveLeaderboardState, type LeaderboardState } from '@/lib/leaderboardState';
import { useSession } from '@/lib/session';
import { announce, autoDismissMs, useLargeText, useScreenReaderEnabled } from '@/lib/a11y';
import { holeInOneAlertHaptic } from '@/lib/haptics';
import { fetchLeaderboard } from '@/lib/api';
import type { PublicLeaderboardEntry, PublicIndividualEntry } from '@/lib/api';
import { golferRowLabel, teamRowLabel } from '@/lib/standingsSpeech';
import { fontSize, radius, spacing, status } from '@gfp/theme';

// Spec §3 Phase 3: SignalR is primary; 15 s HTTP fallback only when the hub
// connection is down. Spec §2.4: offline-mode events disable live leaderboard
// on mobile to conserve battery — useLiveLeaderboard short-circuits both
// transports when the `disabled` flag is set.
const FALLBACK_POLL_MS = 15_000;
const BASE             = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';

// ── ROW ACCESSIBILITY ─────────────────────────────────────────────────────────
// On a phone each row is ONE screen-reader item that speaks its own sentence
// ("1st, Timing Crew, 2 under par, through 9 holes"): read cell by cell it was
// "0, Timing Crew, capital E, Em dash, Em dash…" with the column names far
// above. The header row is then hidden there, since every row names its own
// numbers. The web keeps the cells and the header.
const NATIVE = Platform.OS !== 'web';
const rowA11y = (label: string) => (NATIVE ? { accessible: true, accessibilityLabel: label } : {});
const HIDDEN_ON_PHONES = NATIVE
  ? { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }
  : {};

// ── ROW (memoized) ────────────────────────────────────────────────────────────
// Pulls theme from context so identity is stable across parent re-renders.
// Memo cuts re-renders to only rows whose entry actually changed.

const StandingRow = memo(function StandingRow({
  entry, stableford,
}: { entry: PublicLeaderboardEntry; stableford: boolean }) {
  const theme = useTheme();
  const large = useLargeText();
  // Stableford ranks on points (per golfer, summed — U8), so that's the
  // headline number; everything else ranks on to-par.
  const scored = entry.holesComplete > 0;
  const toParLabel =
    !scored           ? '—' :
    stableford        ? `${entry.stablefordPoints}` :
    entry.toPar === 0 ? 'E' :
    entry.toPar > 0   ? `+${entry.toPar}` :
                        `${entry.toPar}`;
  const toParColor =
    stableford      ? theme.colors.primary :
    entry.toPar < 0 ? '#27ae60' :
    entry.toPar > 0 ? '#e74c3c' :
                      theme.colors.primary;
  const thru = !scored ? '—' : entry.isComplete ? 'F' : `${entry.holesComplete}`;
  const back = entry.holesComplete === 0 || entry.strokesBack === 0 ? '—' : `${entry.strokesBack}`;
  const bestHole  = entry.bestHole == null ? '—' : `${entry.bestHole}`;
  const bestScore = entry.bestHoleScore == null ? '—' : `${entry.bestHoleScore}`;

  if (large) return (
    <StackedRow a11y={rowA11y(teamRowLabel(entry, stableford))} rank={entry.rank} name={entry.teamName}
      toPar={toParLabel} toParColor={toParColor}
      stats={[`Back ${back}`, `Best ${bestHole}`, `Score ${bestScore}`, `Thru ${thru}`]} />
  );

  return (
    <View style={[rowStyles.row, { borderBottomColor: '#f0f0f0' }]} {...rowA11y(teamRowLabel(entry, stableford))}>
      {/* Rank 0 = not ranked yet (no holes scored); it showed as "0". */}
      <Text style={[rowStyles.rank,  { color: theme.mutedText   }]}>{entry.rank || '—'}</Text>
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
  const large = useLargeText();

  if (large) return (
    <StackedRow a11y={rowA11y(golferRowLabel(entry))} rank={entry.rank} name={entry.playerName} sub={entry.teamName}
      toPar={toParLabel} toParColor={toParColor}
      stats={[`Back ${back}`, `Gross ${scored ? entry.grossTotal : '—'}`, `Thru ${thru}`]} />
  );

  return (
    <View style={[rowStyles.row, { borderBottomColor: '#f0f0f0' }]} {...rowA11y(golferRowLabel(entry))}>
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

/**
 * One standings row at large text sizes (useLargeText). The table's fixed-width
 * number columns take ~280dp, so at 2.0 the header split mid-word ("BA/CK") and
 * team names were cut to "Reach ..". Here the name wraps on its own line and
 * each number carries its column name.
 */
function StackedRow({ a11y, rank, name, sub, toPar, toParColor, stats }: {
  a11y: object; rank: number; name: string; sub?: string;
  toPar: string; toParColor: string; stats: string[];
}) {
  const theme = useTheme();
  return (
    <View style={[rowStyles.row, rowStyles.stacked, { borderBottomColor: '#f0f0f0' }]} {...a11y}>
      <View style={rowStyles.stackedTop}>
        <Text style={[rowStyles.stackedRank, { color: theme.mutedText }]}>{rank || '—'}</Text>
        <View style={rowStyles.stackedName}>
          <Text style={[rowStyles.golfer, { color: theme.colors.primary }]}>{name}</Text>
          {sub ? <Text style={[rowStyles.golferTeam, { color: theme.mutedText }]}>{sub}</Text> : null}
        </View>
        <Text style={[rowStyles.stackedToPar, { color: toParColor }]}>{toPar}</Text>
      </View>
      {/* One item per stat, so a line breaks between stats, never inside one. */}
      <View style={rowStyles.stackedStats}>
        {stats.map(s => <Text key={s} style={[rowStyles.stackedStat, { color: theme.mutedText }]}>{s}</Text>)}
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3], paddingHorizontal: spacing[4], borderBottomWidth: StyleSheet.hairlineWidth },
  rank:  { width: 32,  fontSize: fontSize.sm, fontWeight: '700', textAlign: 'center' },
  team:  { flex: 1,    fontSize: fontSize.md, fontWeight: '600', marginHorizontal: spacing[2] },
  toPar: { width: 44,  fontSize: fontSize.lg, fontWeight: '800', textAlign: 'right' },
  back:  { width: 40,  fontSize: fontSize.sm, textAlign: 'right', marginLeft: spacing[2] },
  num:   { width: 44,  fontSize: fontSize.sm, textAlign: 'right', marginLeft: spacing[2] },
  thru:  { width: 36,  fontSize: fontSize.sm, textAlign: 'right', marginLeft: spacing[2] },
  golfer:     { fontSize: fontSize.md, fontWeight: '600' },
  golferTeam: { fontSize: fontSize.xs },
  stacked:      { flexDirection: 'column', alignItems: 'stretch' },
  stackedTop:   { flexDirection: 'row', alignItems: 'flex-start' },
  stackedRank:  { minWidth: 32, fontSize: fontSize.sm, fontWeight: '700' },
  stackedName:  { flex: 1, marginHorizontal: spacing[2] },
  stackedToPar: { fontSize: fontSize.lg, fontWeight: '800' },
  stackedStats: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing[4], marginTop: spacing[1], marginLeft: 32 + spacing[2] },
  stackedStat:  { fontSize: fontSize.sm },
});

// ── HEADER ROW ────────────────────────────────────────────────────────────────

function TableHeader({ stableford = false, golfers = false }: { stableford?: boolean; golfers?: boolean }) {
  const theme = useTheme();
  // Stacked rows name each number themselves; there are no columns to head.
  const large = useLargeText();
  if (large) return null;
  return (
    <View style={[rowStyles.row, { backgroundColor: theme.colors.highlight }]} {...HIDDEN_ON_PHONES}>
      <Text style={[rowStyles.rank,  headerStyles.th, { color: theme.highlightLabel }]}>#</Text>
      <Text style={[rowStyles.team,  headerStyles.th, { color: theme.highlightLabel }]}>{golfers ? 'Golfer' : 'Team'}</Text>
      <Text style={[rowStyles.toPar, headerStyles.th, { color: theme.highlightLabel }]}>{stableford ? 'Pts' : 'To Par'}</Text>
      <Text style={[rowStyles.back,  headerStyles.th, { color: theme.highlightLabel }]}>Back</Text>
      {golfers ? (
        <Text style={[rowStyles.num, headerStyles.th, { color: theme.highlightLabel }]}>Gross</Text>
      ) : (
        <>
          <Text style={[rowStyles.num, headerStyles.th, { color: theme.highlightLabel }]}>Best</Text>
          <Text style={[rowStyles.num, headerStyles.th, { color: theme.highlightLabel }]}>Score</Text>
        </>
      )}
      <Text style={[rowStyles.thru,  headerStyles.th, { color: theme.highlightLabel }]}>Thru</Text>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  th: { fontSize: fontSize.xxs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
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
  const screenReaderOn = useScreenReaderEnabled();

  // Arrives unprompted mid-round, so it is spoken and felt as well as shown
  // (MCAG 1.3.1/1.3.2). Web announces through the card's alert role instead.
  useEffect(() => {
    announce(`Hole in one! ${data.playerName}, hole ${data.holeNumber}.`);
    holeInOneAlertHaptic();
  }, [data]);

  // Closes itself after 8 s (shorter than the 30 s web banner) — but never
  // under VoiceOver/TalkBack, where the golfer may still be reaching it.
  const dismissAfter = autoDismissMs(screenReaderOn, 8_000);
  useEffect(() => {
    if (dismissAfter === null) return;
    const id = setTimeout(onDismiss, dismissAfter);
    return () => clearTimeout(id);
  }, [onDismiss, dismissAfter]);

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
        <View
          style={[hioStyles.card, { backgroundColor: theme.colors.highlight }]}
          accessibilityRole="alert"
        >
          <Text style={hioStyles.flag} aria-hidden>⛳</Text>
          <Heading level={2} style={[hioStyles.headline, { color: theme.highlightLabel }]}>HOLE-IN-ONE!</Heading>
          <Text style={[hioStyles.name, { color: theme.highlightLabel }]}>{data.playerName}</Text>
          <Text style={[hioStyles.sub,  { color: theme.highlightMuted  }]}>Hole {data.holeNumber}</Text>
          <Pressable
            style={[hioStyles.btn, { backgroundColor: theme.colors.primary }]}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityHint="Closes the hole-in-one alert"
          >
            <Text style={hioStyles.btnText}>Amazing!</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const hioStyles = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  card:      { width: '82%', borderRadius: radius.xxl, padding: spacing[8], alignItems: 'center', gap: spacing[2] },
  flag:      { fontSize: 64, marginBottom: spacing[2] },
  headline:  { fontSize: fontSize.display, fontWeight: '900', letterSpacing: 1 },
  name:      { fontSize: fontSize.xxl, fontWeight: '700', textAlign: 'center' },
  sub:       { fontSize: fontSize.xl, fontWeight: '500' },
  btn:       { marginTop: spacing[4], paddingHorizontal: spacing[8], paddingVertical: spacing[3], borderRadius: radius.lg },
  btnText:   { color: '#fff', fontSize: fontSize.xl, fontWeight: '700' },
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
  const fg   = error ? status.dangerText : offline ? status.warningText : status.successText;

  return (
    <View style={[styles.statusBar, { backgroundColor: bg }]}>
      <GlyphText style={[styles.statusText, { color: fg }]}>{label}</GlyphText>
      {/* Shown in offline mode too — that is exactly when a manual fetch
          matters, since nothing is polling. refresh() is deliberately not
          gated on `disabled` for the same reason. */}
      {!loading && (
        <Pressable
          onPress={onRefresh}
          style={styles.refreshTarget}
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
  const c = useClasses();
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
    <SafeAreaView edges={['left', 'right']} style={c.screen}>

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
          <Text style={styles.emptyIcon} aria-hidden>{EMPTY_COPY[view].icon}</Text>
          <Heading level={2} style={[styles.emptyTitle, { color: theme.colors.primary }]}>
            {EMPTY_COPY[view].title}
          </Heading>
          <GlyphText style={[styles.emptySub,   { color: theme.mutedText  }]}>
            {EMPTY_COPY[view].sub}
          </GlyphText>
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
            data={standings ?? undefined}
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
          aria-selected={value === v}
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
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing[2] },
  list:    { paddingBottom: Platform.OS === 'ios' ? 24 : 16 },

  statusBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing[4], paddingVertical: spacing[2],
  },
  statusText:  { fontSize: fontSize.xs, fontWeight: '600' },
  refreshBtn:  { fontSize: fontSize.xxl, fontWeight: '700' },
  // A real 48×48 target (it was 20×28 plus hitSlop, which TalkBack's focus
  // box and Android's touch-target check don't see). The negative margin keeps
  // the status bar its old height.
  refreshTarget: {
    minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center',
    marginVertical: -spacing[2], marginRight: -spacing[3],
  },

  emptyIcon:  { fontSize: 48 },
  emptyTitle: { fontSize: fontSize.xxl, fontWeight: '800' },
  emptySub:   { fontSize: fontSize.md, marginTop: spacing[1], textAlign: 'center', paddingHorizontal: spacing[8] },

  toggleRow:  { flexDirection: 'row', gap: spacing[2], paddingHorizontal: spacing[4], paddingBottom: spacing[2] },
  toggleTab:  { borderWidth: 1.5, borderRadius: radius.xl, paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  toggleText: { fontSize: fontSize.sm, fontWeight: '700' },
});
