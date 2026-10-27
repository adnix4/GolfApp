import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
  ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme, useClasses } from '@gfp/ui';
import { useSession, getHoleOrder } from '@/lib/session';
import { confirmLeaveEvent, unsyncedHoleCount } from '@/lib/confirmLeave';
// Same challenge popup as the scorecard (the shared DialogFrame, sponsor highlighted).
import { ChallengeDetailModal } from '@/components/scorecardComponents';
import {
  fetchPublicChallenges,
  type SyncConflictDto,
  type ChallengeCacheDto,
} from '@/lib/api';
import { fontSize, radius, spacing, status } from '@gfp/theme';

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
  card:   { borderWidth: 1, borderRadius: radius.lg, padding: spacing[4], marginBottom: spacing[2] },
  title:  { fontSize: fontSize.md, fontWeight: '700', color: '#e67e22', marginBottom: spacing[1] },
  detail: { fontSize: fontSize.sm, marginBottom: spacing[1] },
  hint:   { fontSize: fontSize.xs, color: '#999' },
});

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────

export default function SyncScreen() {
  const theme  = useTheme();
  const c = useClasses();
  const router = useRouter();
  const { session, loading, pendingScores, syncStatus, syncScores, clearSession, completedHoles, syncedHoles } = useSession();

  const [syncing,           setSyncing]           = useState(false);
  const [conflicts,         setConflicts]         = useState<SyncConflictDto[]>([]);
  const [challenges,        setChallenges]        = useState<ChallengeCacheDto[]>([]);
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeCacheDto | null>(null);
  const [headerTip,         setHeaderTip]         = useState<string | null>(null);
  const tipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loading && !session) router.replace('/join');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- expo-router's router is a module singleton, so its identity never changes
  }, [loading, session]);

  const showHeaderTip = useCallback((desc: string) => {
    if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
    setHeaderTip(desc);
    tipTimerRef.current = setTimeout(() => setHeaderTip(null), 2000);
  }, []);

  // clean up timer on unmount
  useEffect(() => () => { if (tipTimerRef.current) clearTimeout(tipTimerRef.current); }, []);

  useEffect(() => {
    if (!session) return;
    fetchPublicChallenges(session.event.eventCode).then(setChallenges).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the closure reads only session.event.eventCode, which is already the dep
  }, [session?.event.eventCode]);

  const holeOrder = useMemo(
    () => session?.team
      ? getHoleOrder(session.team.startingHole, session.event.holes)
      : [],
    [session],
  );

  // hole number → first associated sponsor name
  const holeSponsorMap = useMemo(() => {
    const map = new Map<number, string>();
    session?.sponsors.forEach(s => {
      s.holeNumbers.forEach(h => { if (!map.has(h)) map.set(h, s.name); });
    });
    return map;
  }, [session?.sponsors]);

  // hole number → challenge (only hole-specific challenges)
  const challengeMap = useMemo(() => {
    const map = new Map<number, ChallengeCacheDto>();
    challenges.forEach(c => {
      if (c.holeNumber != null) map.set(c.holeNumber, c);
    });
    return map;
  }, [challenges]);

  if (loading || !session?.team) {
    return (
      <View style={[c.center, { backgroundColor: theme.pageBackground }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // Scoring is only live in Scoring or Draft (test) status
  const scoringLive = session.event.status === 'Scoring' || session.event.status === 'Draft';
  const openHole = (hole: number) => router.navigate(`/scorecard?hole=${hole}`);

  const grossTotal = pendingScores.reduce((sum, s) => sum + s.grossScore, 0);
  const toPar      = pendingScores.reduce((sum, s) => {
    const hole = session.course?.holes.find(h => h.holeNumber === s.holeNumber);
    return sum + s.grossScore - (hole?.par ?? 4);
  }, 0);
  const toParLabel =
    toPar === 0 ? 'Even' : toPar > 0 ? `+${toPar}` : `${toPar}`;
  const toParColor = toPar < 0 ? '#27ae60' : toPar > 0 ? '#e74c3c' : theme.mutedText;

  const holesComplete = pendingScores.length;
  const totalHoles    = session.event.holes;

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncScores();
      setConflicts(result?.conflictDetails.length ? result.conflictDetails : []);
    } finally {
      setSyncing(false);
    }
  }

  function handleLeave() {
    confirmLeaveEvent(async () => {
      await clearSession();
      router.replace('/join');
    }, unsyncedHoleCount(completedHoles, syncedHoles));
  }

  return (
    <SafeAreaView edges={['left', 'right']} style={c.screen}>

      {/* ── HEADER ── */}
      <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
        <Text style={[styles.headerEventName, { color: theme.colors.highlight }]} numberOfLines={2}>
          {session.event.name}
        </Text>
        {session.course ? (
          <Text style={[styles.headerHostedBy, { color: theme.colors.highlight }]} numberOfLines={1}>
            Hosted by {session.course.name}
          </Text>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ── TOTALS ── */}
        <View style={[styles.totalsCard, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.totalsRow}>
            <View style={styles.totalItem}>
              <Text style={[styles.totalValue, { color: theme.colors.primary }]}>{grossTotal || '—'}</Text>
              <Text style={[styles.totalLabel, { color: theme.mutedText }]}>Strokes</Text>
            </View>
            <View style={[styles.totalDivider, { backgroundColor: '#e0e0e0' }]} />
            <View style={styles.totalItem}>
              <Text style={[styles.totalValue, { color: toParColor }]}>
                {holesComplete > 0 ? toParLabel : '—'}
              </Text>
              <Text style={[styles.totalLabel, { color: theme.mutedText }]}>To Par</Text>
            </View>
            <View style={[styles.totalDivider, { backgroundColor: '#e0e0e0' }]} />
            <View style={styles.totalItem}>
              <Text style={[styles.totalValue, { color: theme.colors.primary }]}>
                {holesComplete}/{totalHoles}
              </Text>
              <Text style={[styles.totalLabel, { color: theme.mutedText }]}>Holes</Text>
            </View>
          </View>
        </View>

        {/* ── CONFLICTS ── */}
        {conflicts.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Score Conflicts</Text>
            {conflicts.map(c => <ConflictCard key={c.holeNumber} conflict={c} />)}
          </View>
        )}

        {/* ── SYNC BUTTON ── */}
        <Pressable
          onPress={handleSync}
          disabled={syncing || syncStatus === 'synced' || !scoringLive}
          style={({ pressed }) => [
            styles.syncBtn,
            {
              backgroundColor:
                !scoringLive            ? '#bbb'     :
                syncStatus === 'synced' ? '#27ae60'  :
                pressed                 ? theme.colors.accent :
                                          theme.colors.primary,
              opacity: syncing ? 0.7 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            scoringLive
              ? 'Sync scores to server'
              : 'Sync unavailable until scoring begins'
          }
        >
          {syncing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.syncBtnText}>
              {!scoringLive
                ? '⏸  Sync Scores  (Scoring Not Live)'
                : syncStatus === 'synced' ? '✓  Scores Synced'
                : syncStatus === 'error'  ? 'Retry Sync'
                :                          'Sync Scores'}
            </Text>
          )}
        </Pressable>

        {syncStatus === 'error' && (
          <Text style={styles.syncError}>
            Sync failed — check your connection and try again.
          </Text>
        )}

        {/* ── SCORECARD TABLE ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>
            {session.team.name}'s Scorecard
          </Text>

          {/* Table header — tap any abbreviation for the full label */}
          <View style={[styles.tableHeader, { backgroundColor: theme.colors.primary }]}>
            <Text style={[col.hole,  styles.thText]} numberOfLines={1} onPress={() => showHeaderTip('Hole Number')}>#</Text>
            <Text style={[col.yds,   styles.thText]} numberOfLines={1} onPress={() => showHeaderTip('Yardage')}>Yds</Text>
            <Text style={[col.par,   styles.thText]} numberOfLines={1} onPress={() => showHeaderTip('Par')}>Par</Text>
            <Text style={[col.score, styles.thText]} numberOfLines={1} onPress={() => showHeaderTip('Strokes')}>Scr</Text>
            <Text style={[col.rel,   styles.thText]} numberOfLines={1} onPress={() => showHeaderTip('Score vs. Par')}>+/−</Text>
            <Text style={[col.spon,  styles.thText]} numberOfLines={1} onPress={() => showHeaderTip('Hole Sponsor')}>Spon</Text>
            <Text style={[col.chal,  styles.thText]} numberOfLines={1} onPress={() => showHeaderTip('Hole Challenge')}>Chal</Text>
          </View>
          {headerTip !== null && (
            <View style={[styles.headerTip, { backgroundColor: theme.colors.primary + 'cc' }]}>
              <Text style={styles.headerTipText}>{headerTip}</Text>
            </View>
          )}

          {holeOrder.map((holeNum, idx) => {
            const scoreEntry = pendingScores.find(s => s.holeNumber === holeNum);
            const holeData   = session.course?.holes.find(h => h.holeNumber === holeNum);
            const par        = holeData?.par ?? 4;
            const isConflict = conflicts.some(c => c.holeNumber === holeNum);
            const challenge  = challengeMap.get(holeNum);
            const sponsor    = holeSponsorMap.get(holeNum);

            // Prefer White → Blue → Red yardage
            const yardage =
              holeData?.yardageWhite ?? holeData?.yardageBlue ?? holeData?.yardageRed;

            const hasScore = !!scoreEntry;
            const gross    = scoreEntry?.grossScore ?? 0;
            const relative = hasScore ? gross - par : null;
            const relLabel =
              relative === null ? '—' :
              relative === 0    ? 'E' :
              relative > 0      ? `+${relative}` : `${relative}`;
            const relColor =
              relative === null ? theme.mutedText :
              relative < 0      ? '#27ae60' :
              relative > 0      ? '#e74c3c' : theme.mutedText;

            const rowBg = isConflict
              ? '#fff8f0'
              : idx % 2 === 0
                ? theme.colors.surface
                : theme.colors.highlight + 'cc';

            return (
              <View key={holeNum} style={styles.holeBlock}>
                <View style={[col.row, { backgroundColor: rowBg }]}>
                  {/* Hole number and score open the hole on the scorecard, where a
                      submitted score can be edited while scoring is open. */}
                  <Text
                    style={[col.hole, styles.cellHole, { color: theme.colors.primary }, scoringLive && styles.cellLink]}
                    onPress={scoringLive ? () => openHole(holeNum) : undefined}
                    accessibilityRole={scoringLive ? 'link' : undefined}
                    accessibilityLabel={scoringLive ? `Open hole ${holeNum} on the scorecard` : undefined}
                  >
                    {holeNum}
                  </Text>
                  <Text style={[col.yds, styles.cellYds, { color: theme.mutedText }]}>
                    {yardage != null ? `${yardage}` : '—'}
                  </Text>
                  <Text style={[col.par, styles.cellPar, { color: theme.mutedText }]}>
                    {par}
                  </Text>
                  <Text
                    style={[
                      col.score, styles.cellScore,
                      { color: theme.colors.primary, opacity: hasScore ? 1 : 0.35 },
                    ]}
                    onPress={scoringLive ? () => openHole(holeNum) : undefined}
                  >
                    {hasScore ? gross : '—'}
                  </Text>
                  <Text style={[col.rel, styles.cellRel, { color: relColor }]}>
                    {relLabel}{isConflict ? ' ⚠' : ''}
                  </Text>
                  {sponsor ? (
                    <Text style={[col.spon, styles.cellSpon, { color: theme.mutedText }]} numberOfLines={1}>
                      {sponsor}
                    </Text>
                  ) : (
                    <Text style={[col.spon, styles.cellDash, { color: theme.mutedText }]}>—</Text>
                  )}
                  {challenge ? (
                    <Pressable
                      style={col.chal}
                      onPress={() => setSelectedChallenge(challenge)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`View challenge for hole ${holeNum}`}
                    >
                      <Text style={styles.challengeIcon}>🏆</Text>
                    </Pressable>
                  ) : (
                    <Text style={[col.chal, styles.cellDash, { color: theme.mutedText }]}>—</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* ── QR TRANSFER (only when scoring live) ── */}
        {scoringLive && (
          <Pressable
            onPress={() => router.push('/qr-transfer')}
            style={({ pressed }) => [
              styles.qrBtn,
              { borderColor: theme.colors.primary, opacity: pressed ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Generate scorecard QR for admin scan"
          >
            <Text style={[styles.qrBtnText, { color: theme.colors.primary }]}>
              Generate Scorecard QR
            </Text>
          </Pressable>
        )}

        {/* ── LEAVE ── */}
        <Pressable
          onPress={handleLeave}
          style={({ pressed }) => [
            styles.leaveBtn,
            { borderColor: theme.colors.primary, opacity: pressed ? 0.6 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Leave this event"
        >
          <Text style={[styles.leaveBtnText, { color: theme.colors.primary }]}>Leave Event</Text>
        </Pressable>

        <Text style={[styles.hint, { color: theme.mutedText }]}>
          {scoringLive
            ? 'Your scores are saved locally. Sync ensures the organizer has your latest results. '
              + 'Tap a hole number to open it on the scorecard and edit it.'
            : 'Sync will be available once the organizer opens scoring.'}
        </Text>
      </ScrollView>

      {/* ── CHALLENGE MODAL ── */}
      <ChallengeDetailModal
        challenge={selectedChallenge}
        onDismiss={() => setSelectedChallenge(null)}
      />
    </SafeAreaView>
  );
}

// ── COLUMN LAYOUT ─────────────────────────────────────────────────────────────

const col = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[2], paddingHorizontal: spacing[2] },
  hole:  { flex: 1,   textAlign: 'center' },   // "#"   — up to "18"
  yds:   { flex: 1.5, textAlign: 'center' },   // "Yds" — 3-digit yardage
  par:   { flex: 1,   textAlign: 'center' },   // "Par" — single digit
  score: { flex: 1.5, textAlign: 'center' },   // "Scr" — up to 2 digits
  rel:   { flex: 1.5, textAlign: 'center' },   // "+/−" — up to "+10"
  spon:  { flex: 3,   textAlign: 'center' },   // "Spon" — absorbs remaining space
  chal:  { flex: 1.5, alignItems: 'center' },  // "Chal" — 🏆 or —
});

// ── MAIN STYLES ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  cellLink:    { textDecorationLine: 'underline' },
  scroll: { padding: spacing[4], paddingBottom: spacing[12] },

  // Header
  header: {
    paddingTop:        Platform.OS === 'android' ? 12 : 0,
    paddingBottom:     spacing[4],
    paddingHorizontal: spacing[5],
    alignItems:        'center',
  },
  headerEventName: { fontSize: fontSize.xxl, fontWeight: '800', textAlign: 'center' },
  headerHostedBy:  { fontSize: fontSize.sm, fontWeight: '500', marginTop: spacing[1], opacity: 0.82 },

  // Totals card
  totalsCard: {
    borderRadius: radius.xl, padding: spacing[5], marginBottom: spacing[4],
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.07)', elevation: 3,
  },
  totalsRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  totalItem:    { alignItems: 'center', flex: 1 },
  totalValue:   { fontSize: 36, fontWeight: '800' },
  totalLabel:   { fontSize: fontSize.xxs, fontWeight: '600', marginTop: spacing[1], textTransform: 'uppercase', letterSpacing: 0.5 },
  totalDivider: { width: 1, height: 44, marginHorizontal: spacing[2] },

  section:      { marginTop: spacing[4] },
  sectionTitle: { fontSize: fontSize.xl, fontWeight: '800', marginBottom: spacing[3] },

  // Table
  tableHeader: {
    flexDirection: 'row', paddingVertical: spacing[2], paddingHorizontal: spacing[3],
    borderRadius: radius.md, marginBottom: spacing[0.5],
  },
  thText: { color: '#fff', fontSize: fontSize.xxs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' },

  // Row cells
  cellHole:  { fontWeight: '700', fontSize: fontSize.md, textAlign: 'center' },
  cellYds:   { fontSize: fontSize.xs, textAlign: 'center' },
  cellPar:   { fontSize: fontSize.md, textAlign: 'center' },
  cellScore: { fontSize: fontSize.md, fontWeight: '700', textAlign: 'center' },
  cellRel:   { fontSize: fontSize.md, fontWeight: '600', textAlign: 'center' },
  cellSpon:  { fontSize: fontSize.xxs, textAlign: 'center' },
  cellDash:  { textAlign: 'center', fontSize: fontSize.sm },
  challengeIcon: { fontSize: fontSize.xl, textAlign: 'center' },

  // Hole block
  holeBlock: { marginBottom: 1 },

  // Column-label tooltip (tap a header abbreviation to reveal full name)
  headerTip:     { alignItems: 'center', paddingVertical: spacing[1], marginBottom: spacing[0.5] },
  headerTipText: { color: '#fff', fontSize: fontSize.xs, fontWeight: '600', letterSpacing: 0.3 },

  // Sync button
  syncBtn:     { paddingVertical: spacing[4], borderRadius: radius.lg, alignItems: 'center', marginBottom: spacing[1] },
  syncBtnText: { fontSize: fontSize.lg, fontWeight: '700', color: '#fff' },
  syncError:   { fontSize: fontSize.xs, color: status.dangerText, textAlign: 'center', marginBottom: spacing[2] },

  // QR + Leave
  qrBtn:       { paddingVertical: spacing[4], borderRadius: radius.lg, alignItems: 'center', borderWidth: 1.5, marginBottom: spacing[2], marginTop: spacing[4] },
  qrBtnText:   { fontSize: fontSize.lg, fontWeight: '600' },
  leaveBtn:    { marginTop: spacing[3], paddingVertical: spacing[4], borderRadius: radius.lg, alignItems: 'center', borderWidth: 2 },
  leaveBtnText:{ fontSize: fontSize.lg, fontWeight: '700' },

  hint: { fontSize: fontSize.xs, textAlign: 'center', marginTop: spacing[4], lineHeight: 18 },
});
