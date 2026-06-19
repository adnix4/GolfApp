import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
  ScrollView, Platform, SafeAreaView, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { useSession, getHoleOrder } from '@/lib/session';
import {
  fetchPublicChallenges,
  type SyncConflictDto,
  type ChallengeCacheDto,
} from '@/lib/api';

// ── CHALLENGE MODAL ───────────────────────────────────────────────────────────

const CHALLENGE_TYPE_LABELS: Record<string, string> = {
  ClosestToPin: '📍 Closest to the Pin',
  LongestDrive: '💨 Longest Drive',
  LongestPutt:  '⛳ Longest Putt',
  KP:           '🎯 KP Challenge',
  HoleInOne:    '🎰 Hole in One',
};

function ChallengeModal({
  challenge,
  onDismiss,
}: {
  challenge: ChallengeCacheDto | null;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  if (!challenge) return null;

  return (
    <Modal
      transparent
      visible
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={modalStyles.backdrop}>
        {/* Dismiss layer behind the card — a sibling, not a parent, so the
            card's buttons aren't nested inside another Pressable (invalid
            <button>-in-<button> on web). */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityLabel="Close challenge detail"
          accessibilityRole="button"
        />
        <View style={[modalStyles.card, { backgroundColor: theme.colors.surface }]}>
          <View style={[modalStyles.header, { backgroundColor: theme.colors.primary }]}>
            <Text style={modalStyles.headerText}>
              {challenge.holeNumber != null
                ? `Hole ${challenge.holeNumber} Challenge`
                : 'Event Challenge'}
            </Text>
          </View>

          <View style={modalStyles.body}>
            {challenge.challengeType ? (
              <Text style={[modalStyles.typeLabel, { color: theme.colors.accent }]}>
                {CHALLENGE_TYPE_LABELS[challenge.challengeType] ?? challenge.challengeType}
              </Text>
            ) : null}

            <Text style={[modalStyles.description, { color: theme.colors.primary }]}>
              {challenge.description}
            </Text>

            {challenge.prizeDescription ? (
              <View style={[modalStyles.prizeBox, { backgroundColor: '#fffbf0', borderColor: '#f39c12' }]}>
                <Text style={modalStyles.prizeLabel}>🏆 Prize</Text>
                <Text style={modalStyles.prizeText}>{challenge.prizeDescription}</Text>
              </View>
            ) : null}

            {challenge.sponsorName ? (
              <Text style={[modalStyles.sponsorText, { color: theme.colors.accent }]}>
                Presented by {challenge.sponsorName}
              </Text>
            ) : null}
          </View>

          <Pressable
            style={[modalStyles.closeBtn, { backgroundColor: theme.colors.primary }]}
            onPress={onDismiss}
            accessibilityRole="button"
          >
            <Text style={modalStyles.closeBtnText}>Got It</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  card:         { borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  header:       { paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center' },
  headerText:   { color: '#fff', fontSize: 17, fontWeight: '800' },
  body:         { padding: 20, gap: 10 },
  typeLabel:    { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  description:  { fontSize: 16, lineHeight: 24 },
  prizeBox:     { borderWidth: 1, borderRadius: 10, padding: 12 },
  prizeLabel:   { fontSize: 12, fontWeight: '700', color: '#b7770d', marginBottom: 4 },
  prizeText:    { fontSize: 14, color: '#7d6608', lineHeight: 20 },
  sponsorText:  { fontSize: 13, textAlign: 'center' },
  closeBtn:     { margin: 20, marginTop: 8, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
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

export default function SyncScreen() {
  const theme  = useTheme();
  const router = useRouter();
  const { session, loading, pendingScores, syncStatus, syncScores, clearSession } = useSession();

  const [syncing,           setSyncing]           = useState(false);
  const [conflicts,         setConflicts]         = useState<SyncConflictDto[]>([]);
  const [challenges,        setChallenges]        = useState<ChallengeCacheDto[]>([]);
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeCacheDto | null>(null);
  const [headerTip,         setHeaderTip]         = useState<string | null>(null);
  const tipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loading && !session) router.replace('/join');
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
      <View style={[styles.center, { backgroundColor: theme.pageBackground }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // Scoring is only live in Scoring or Draft (test) status
  const scoringLive = session.event.status === 'Scoring' || session.event.status === 'Draft';

  const grossTotal = pendingScores.reduce((sum, s) => sum + s.grossScore, 0);
  const toPar      = pendingScores.reduce((sum, s) => {
    const hole = session.course?.holes.find(h => h.holeNumber === s.holeNumber);
    return sum + s.grossScore - (hole?.par ?? 4);
  }, 0);
  const toParLabel =
    toPar === 0 ? 'Even' : toPar > 0 ? `+${toPar}` : `${toPar}`;
  const toParColor = toPar < 0 ? '#27ae60' : toPar > 0 ? '#e74c3c' : theme.colors.accent;

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

  async function handleLeave() {
    await clearSession();
    router.replace('/join');
  }

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: theme.pageBackground }]}>

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
              <Text style={[styles.totalLabel, { color: theme.colors.accent }]}>Strokes</Text>
            </View>
            <View style={[styles.totalDivider, { backgroundColor: '#e0e0e0' }]} />
            <View style={styles.totalItem}>
              <Text style={[styles.totalValue, { color: toParColor }]}>
                {holesComplete > 0 ? toParLabel : '—'}
              </Text>
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
              relative === null ? theme.colors.accent :
              relative < 0      ? '#27ae60' :
              relative > 0      ? '#e74c3c' : theme.colors.accent;

            const rowBg = isConflict
              ? '#fff8f0'
              : idx % 2 === 0
                ? theme.colors.surface
                : theme.colors.highlight + 'cc';

            return (
              <View key={holeNum} style={styles.holeBlock}>
                <View style={[col.row, { backgroundColor: rowBg }]}>
                  <Text style={[col.hole, styles.cellHole, { color: theme.colors.primary }]}>
                    {holeNum}
                  </Text>
                  <Text style={[col.yds, styles.cellYds, { color: theme.colors.accent }]}>
                    {yardage != null ? `${yardage}` : '—'}
                  </Text>
                  <Text style={[col.par, styles.cellPar, { color: theme.colors.accent }]}>
                    {par}
                  </Text>
                  <Text style={[
                    col.score, styles.cellScore,
                    { color: theme.colors.primary, opacity: hasScore ? 1 : 0.35 },
                  ]}>
                    {hasScore ? gross : '—'}
                  </Text>
                  <Text style={[col.rel, styles.cellRel, { color: relColor }]}>
                    {relLabel}{isConflict ? ' ⚠' : ''}
                  </Text>
                  {sponsor ? (
                    <Text style={[col.spon, styles.cellSpon, { color: theme.colors.accent }]} numberOfLines={1}>
                      {sponsor}
                    </Text>
                  ) : (
                    <Text style={[col.spon, styles.cellDash, { color: theme.colors.accent }]}>—</Text>
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
                    <Text style={[col.chal, styles.cellDash, { color: theme.colors.accent }]}>—</Text>
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

        <Text style={[styles.hint, { color: theme.colors.accent }]}>
          {scoringLive
            ? 'Your scores are saved locally. Sync ensures the organizer has your latest results.'
            : 'Sync will be available once the organizer opens scoring.'}
        </Text>
      </ScrollView>

      {/* ── CHALLENGE MODAL ── */}
      <ChallengeModal
        challenge={selectedChallenge}
        onDismiss={() => setSelectedChallenge(null)}
      />
    </SafeAreaView>
  );
}

// ── COLUMN LAYOUT ─────────────────────────────────────────────────────────────

const col = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 8 },
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
  page:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 48 },

  // Header
  header: {
    paddingTop:        Platform.OS === 'android' ? 12 : 0,
    paddingBottom:     14,
    paddingHorizontal: 20,
    alignItems:        'center',
  },
  headerEventName: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  headerHostedBy:  { fontSize: 13, fontWeight: '500', marginTop: 4, opacity: 0.82 },

  // Totals card
  totalsCard: {
    borderRadius: 14, padding: 20, marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.07)', elevation: 3,
  },
  totalsRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  totalItem:    { alignItems: 'center', flex: 1 },
  totalValue:   { fontSize: 36, fontWeight: '800' },
  totalLabel:   { fontSize: 11, fontWeight: '600', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  totalDivider: { width: 1, height: 44, marginHorizontal: 8 },

  section:      { marginTop: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 10 },

  // Table
  tableHeader: {
    flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 8, marginBottom: 2,
  },
  thText: { color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' },

  // Row cells
  cellHole:  { fontWeight: '700', fontSize: 14, textAlign: 'center' },
  cellYds:   { fontSize: 12, textAlign: 'center' },
  cellPar:   { fontSize: 14, textAlign: 'center' },
  cellScore: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  cellRel:   { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  cellSpon:  { fontSize: 11, textAlign: 'center' },
  cellDash:  { textAlign: 'center', fontSize: 13 },
  challengeIcon: { fontSize: 16, textAlign: 'center' },

  // Hole block
  holeBlock: { marginBottom: 1 },

  // Column-label tooltip (tap a header abbreviation to reveal full name)
  headerTip:     { alignItems: 'center', paddingVertical: 5, marginBottom: 2 },
  headerTipText: { color: '#fff', fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },

  // Sync button
  syncBtn:     { paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginBottom: 4 },
  syncBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  syncError:   { fontSize: 12, color: '#c0392b', textAlign: 'center', marginBottom: 8 },

  // QR + Leave
  qrBtn:       { paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, marginBottom: 8, marginTop: 16 },
  qrBtnText:   { fontSize: 15, fontWeight: '600' },
  leaveBtn:    { marginTop: 10, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 2 },
  leaveBtnText:{ fontSize: 15, fontWeight: '700' },

  hint: { fontSize: 12, textAlign: 'center', marginTop: 14, lineHeight: 18 },
});
