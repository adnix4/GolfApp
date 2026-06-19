import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
  ScrollView, Image, Platform, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, AdaptiveLogoFrame } from '@gfp/ui';
import { useSession, getHoleOrder } from '@/lib/session';
import { fetchPublicChallenges, type ChallengeCacheDto, type HoleCacheDto, type PlayerShotBreakdown, type SponsorCacheDto } from '@/lib/api';
import {
  HoleInfoChip, ScoreChip, SyncStatusBar,
  HoleInOneModal, ChallengeDetailModal, SponsorModal, ShotColumn,
} from './scorecardComponents';

// ── SUMMARY TABLE (pre-scoring and post-round shared layout) ──────────────────

const summaryCol = StyleSheet.create({
  row:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 8 },
  hole: { flex: 1,   textAlign: 'center' },   // "#"   — up to "18"
  yds:  { flex: 1.5, textAlign: 'center' },   // "Yds" — 3-digit yardage
  par:  { flex: 1,   textAlign: 'center' },   // "Par" — single digit
  scr:  { flex: 1.5, textAlign: 'center' },   // "Scr" — up to 2 digits
  rel:  { flex: 1.5, textAlign: 'center' },   // "+/−" — up to "+10"
  spon: { flex: 3,   textAlign: 'center' },   // "Spon" — absorbs remaining space
  chal: { flex: 1.5, alignItems: 'center' },  // "Chal" — 🏆 or —
});

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────

export default function ScorecardScreen() {
  const theme                  = useTheme();
  const router                 = useRouter();
  const {
    session, loading,
    pendingScores, completedHoles, syncStatus,
    upsertScore, completeHole, syncScores,
  } = useSession();

  const [holeIndex,         setHoleIndex]         = useState(0);
  const [showHio,           setShowHio]           = useState(false);
  const [completing,        setCompleting]        = useState(false);
  const [challenges,        setChallenges]        = useState<ChallengeCacheDto[]>([]);
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeCacheDto | null>(null);
  const [selectedSponsor,   setSelectedSponsor]   = useState<SponsorCacheDto | null>(null);
  const [headerTip,         setHeaderTip]         = useState<string | null>(null);
  const tipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const holeOrder = useMemo(
    () => session?.team ? getHoleOrder(session.team.startingHole, session.event.holes) : [],
    [session],
  );

  // hole number → full sponsor object (first match wins)
  const holeSponsorMap = useMemo(() => {
    const map = new Map<number, SponsorCacheDto>();
    session?.sponsors?.forEach(s => {
      s.holeNumbers.forEach(h => { if (!map.has(h)) map.set(h, s); });
    });
    return map;
  }, [session?.sponsors]);

  // hole number → HoleCacheDto. Pre-scoring summary iterates every hole and
  // looked it up with `.find()` per row — O(holes²) per render (small at 18
  // but recomputed on every state update). The Map is built once per course.
  const holeByNumber = useMemo(() => {
    const map = new Map<number, HoleCacheDto>();
    session?.course?.holes.forEach(h => map.set(h.holeNumber, h));
    return map;
  }, [session?.course]);

  // hole number → hole-specific challenge
  const challengeMap = useMemo(() => {
    const map = new Map<number, ChallengeCacheDto>();
    challenges.forEach(c => { if (c.holeNumber != null) map.set(c.holeNumber, c); });
    return map;
  }, [challenges]);

  useEffect(() => {
    if (!loading && !session) router.replace('/join');
  }, [loading, session]);

  useEffect(() => {
    if (!session) return;
    fetchPublicChallenges(session.event.eventCode).then(setChallenges);
  }, [session?.event.eventCode]);

  const handleSync = useCallback(() => { syncScores(); }, [syncScores]);

  const showHeaderTip = useCallback((desc: string) => {
    if (tipTimerRef.current) clearTimeout(tipTimerRef.current);
    setHeaderTip(desc);
    tipTimerRef.current = setTimeout(() => setHeaderTip(null), 2000);
  }, []);

  // clean up timer on unmount
  useEffect(() => () => { if (tipTimerRef.current) clearTimeout(tipTimerRef.current); }, []);

  if (loading || !session?.team) {
    return (
      <View style={[styles.center, { backgroundColor: theme.pageBackground }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // ── PRE-SCORING SUMMARY (shown in place of per-hole sheets when not live) ────
  const scoringEnabled =
    session.event.status === 'Scoring' || session.event.status === 'Draft';

  if (!scoringEnabled) {
    const allHoles = Array.from({ length: session.event.holes }, (_, i) => i + 1);

    return (
      <SafeAreaView style={[styles.page, { backgroundColor: theme.pageBackground }]}>
        {/* Header: event name + hosted by course */}
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

        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 40 }]}>

          {/* [Team]'s Scorecard */}
          <Text style={[styles.summaryTitle, { color: theme.colors.primary }]}>
            {session.team.name}'s Scorecard
          </Text>

          {/* Table header — tap any abbreviation for the full label */}
          <View style={[styles.summaryTableHeader, { backgroundColor: theme.colors.primary }]}>
            <Text style={[summaryCol.hole, styles.summaryTh]} numberOfLines={1} onPress={() => showHeaderTip('Hole Number')}>#</Text>
            <Text style={[summaryCol.yds,  styles.summaryTh]} numberOfLines={1} onPress={() => showHeaderTip('Yardage')}>Yds</Text>
            <Text style={[summaryCol.par,  styles.summaryTh]} numberOfLines={1} onPress={() => showHeaderTip('Par')}>Par</Text>
            <Text style={[summaryCol.scr,  styles.summaryTh]} numberOfLines={1} onPress={() => showHeaderTip('Strokes')}>Scr</Text>
            <Text style={[summaryCol.rel,  styles.summaryTh]} numberOfLines={1} onPress={() => showHeaderTip('Score vs. Par')}>+/−</Text>
            <Text style={[summaryCol.spon, styles.summaryTh]} numberOfLines={1} onPress={() => showHeaderTip('Hole Sponsor')}>Spon</Text>
            <Text style={[summaryCol.chal, styles.summaryTh]} numberOfLines={1} onPress={() => showHeaderTip('Hole Challenge')}>Chal</Text>
          </View>
          {headerTip !== null && (
            <View style={[styles.headerTip, { backgroundColor: theme.colors.primary + 'cc' }]}>
              <Text style={styles.headerTipText}>{headerTip}</Text>
            </View>
          )}

          {allHoles.map((holeNum, idx) => {
            const holeData  = holeByNumber.get(holeNum);
            const par       = holeData?.par ?? 4;
            const challenge = challengeMap.get(holeNum);
            const sponsor   = holeSponsorMap.get(holeNum);
            const yardage   = holeData?.yardageWhite ?? holeData?.yardageBlue ?? holeData?.yardageRed;
            const rowBg     = idx % 2 === 0 ? theme.colors.surface : theme.colors.highlight + 'cc';

            // Show pending score if it exists (e.g. from a draft/test run)
            const pending   = pendingScores.find(s => s.holeNumber === holeNum);
            const hasScore  = !!pending;
            const gross     = pending?.grossScore ?? 0;
            const relative  = hasScore ? gross - par : null;
            const relLabel  =
              relative === null ? '—' :
              relative === 0    ? 'E' :
              relative > 0      ? `+${relative}` : `${relative}`;
            const relColor =
              relative === null ? theme.colors.accent :
              relative < 0      ? '#27ae60' :
              relative > 0      ? '#e74c3c' : theme.colors.accent;

            return (
              <View key={holeNum} style={styles.summaryHoleBlock}>
                <View style={[summaryCol.row, { backgroundColor: rowBg }]}>
                  <Text style={[summaryCol.hole, styles.summaryCell, { color: theme.colors.primary, fontWeight: '700' }]}>
                    {holeNum}
                  </Text>
                  <Text style={[summaryCol.yds, styles.summaryCell, { color: theme.colors.accent }]}>
                    {yardage != null ? `${yardage}` : '—'}
                  </Text>
                  <Text style={[summaryCol.par, styles.summaryCell, { color: theme.colors.accent }]}>
                    {par}
                  </Text>
                  <Text style={[summaryCol.scr, styles.summaryCell, { color: theme.colors.primary, opacity: hasScore ? 1 : 0.3, fontWeight: hasScore ? '700' : '400' }]}>
                    {hasScore ? gross : '—'}
                  </Text>
                  <Text style={[summaryCol.rel, styles.summaryCell, { color: relColor, fontWeight: '600' }]}>
                    {relLabel}
                  </Text>
                  {sponsor ? (
                    <Pressable
                      style={{ flex: 3, alignItems: 'center', justifyContent: 'center' }}
                      onPress={() => setSelectedSponsor(sponsor)}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${sponsor.name} sponsor info`}
                    >
                      <Text style={[styles.summaryCell, { color: theme.colors.primary, fontWeight: '600', textAlign: 'center', textDecorationLine: 'underline' }]} numberOfLines={1}>
                        {sponsor.name}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={[summaryCol.spon, styles.summaryCellDash, { color: theme.colors.accent }]}>—</Text>
                  )}
                  {challenge ? (
                    <Pressable
                      style={summaryCol.chal}
                      onPress={() => setSelectedChallenge(challenge)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`View challenge for hole ${holeNum}`}
                    >
                      <Text style={styles.summaryChallengeIcon}>🏆</Text>
                    </Pressable>
                  ) : (
                    <Text style={[summaryCol.chal, styles.summaryCellDash, { color: theme.colors.accent }]}>—</Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>

        <ChallengeDetailModal
          challenge={selectedChallenge}
          onDismiss={() => setSelectedChallenge(null)}
        />
        <SponsorModal
          sponsor={selectedSponsor}
          onDismiss={() => setSelectedSponsor(null)}
        />
      </SafeAreaView>
    );
  }

  // ── ACTIVE SCORING VIEW ───────────────────────────────────────────────────────
  const currentHoleNumber    = holeOrder[holeIndex] ?? 1;
  const hole                 = holeByNumber.get(currentHoleNumber) ?? null;
  const par                  = hole?.par ?? 4;
  const currentScore         = pendingScores.find(s => s.holeNumber === currentHoleNumber) ?? null;
  const isLastHole           = holeIndex === holeOrder.length - 1;
  const holeChallenge        = challenges.find(c => c.holeNumber === currentHoleNumber) ?? null;
  const currentHoleSponsor   = holeSponsorMap.get(currentHoleNumber) ?? null;
  const isCurrentHoleDone    = completedHoles.has(currentHoleNumber);

  // Team gross = sum of every player's (drive + approach + putt)
  const playerBreakdown = currentScore?.playerShots ?? {};
  const grossScore      = Object.values(playerBreakdown).reduce(
    (sum, b) => sum + b.drive + b.approach + b.putt, 0,
  );
  const displayScore = grossScore > 0 ? grossScore : null;
  const hasShots     = grossScore > 0;

  function changePlayerShots(
    playerId: string,
    type:    'drive' | 'approach' | 'putt',
    delta:   number,
  ) {
    if (!scoringEnabled) return;

    const existing = playerBreakdown[playerId] ?? { drive: 0, approach: 0, putt: 0 };
    const updated  = { ...existing, [type]: Math.max(0, existing[type] + delta) };
    const all      = { ...playerBreakdown, [playerId]: updated };

    const cleaned: Record<string, PlayerShotBreakdown> = {};
    for (const [pid, b] of Object.entries(all)) {
      if (b.drive + b.approach + b.putt > 0) cleaned[pid] = b;
    }

    const gross      = Object.values(cleaned).reduce((s, b) => s + b.drive + b.approach + b.putt, 0);
    const totalPutts = Object.values(cleaned).reduce((s, b) => s + b.putt, 0);

    upsertScore({
      holeNumber:        currentHoleNumber,
      grossScore:        gross > 0 ? gross : par,
      putts:             totalPutts > 0 ? totalPutts : null,
      playerShots:       Object.keys(cleaned).length > 0 ? cleaned : undefined,
      clientTimestampMs: Date.now(),
    });
    // HIO is only shown on explicit hole completion, not on shot entry
  }

  async function handleComplete() {
    if (!hasShots || isCurrentHoleDone || completing) return;
    setCompleting(true);
    try {
      await completeHole(currentHoleNumber);
      if (grossScore === 1) setShowHio(true);
    } finally {
      setCompleting(false);
    }
  }

  function handlePrev() {
    if (holeIndex > 0) setHoleIndex(i => i - 1);
  }

  function handleNext() {
    if (isLastHole) router.replace('/sync');
    else setHoleIndex(i => i + 1);
  }

  const completedCount = completedHoles.size;
  const grossTotal     = pendingScores
    .filter(s => completedHoles.has(s.holeNumber))
    .reduce((sum, s) => sum + s.grossScore, 0);

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: theme.pageBackground }]}>
      {/* ── HEADER ── */}
      <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
        <Text style={[styles.headerTeam, { color: theme.colors.highlight }]} numberOfLines={1}>
          {session.team.name}
        </Text>
        <Text style={[styles.headerEvent, { color: theme.colors.highlight }]} numberOfLines={1}>
          {session.event.name}
        </Text>
        {completedCount > 0 && (
          <Text style={[styles.headerTotal, { color: theme.colors.highlight }]}>
            {completedCount} hole(s) complete · Total {grossTotal}
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* ── HOLE SPONSOR ── */}
        {currentHoleSponsor && (
          <Pressable
            style={({ pressed }) => [
              styles.sponsorBadge,
              { borderColor: theme.colors.primary, opacity: pressed ? 0.75 : 1 },
            ]}
            onPress={() => setSelectedSponsor(currentHoleSponsor)}
            accessibilityRole="button"
            accessibilityLabel={`View ${currentHoleSponsor.name} sponsor info`}
          >
            {hole?.sponsorLogoUrl ? (
              <AdaptiveLogoFrame
                uri={hole.sponsorLogoUrl}
                width={120} height={36}
                primaryColor={theme.colors.primary}
                borderColor={theme.colors.primary}
                borderRadius={8}
                padding={6}
                accessibilityLabel={`Hole sponsor: ${currentHoleSponsor.name}`}
              />
            ) : (
              <Text style={[styles.sponsorName, { color: theme.colors.primary }]}>
                Sponsored by {currentHoleSponsor.name}
              </Text>
            )}
            {currentHoleSponsor.tagline ? (
              <Text style={[styles.sponsorTagline, { color: theme.colors.primary }]}>
                {currentHoleSponsor.tagline}
              </Text>
            ) : null}
            <Text style={[styles.sponsorTapHint, { color: theme.colors.primary }]}>
              Tap to learn more
            </Text>
          </Pressable>
        )}

        {/* ── HOLE INFO CHIPS: PAR | SCORE | HCP | yardages ── */}
        {hole && (
          <View style={styles.infoRow}>
            <HoleInfoChip label="Par"  value={String(hole.par)} />
            <ScoreChip grossScore={displayScore} par={par} />
            <HoleInfoChip label="HCP"  value={String(hole.handicapIndex)} />
            {hole.yardageWhite != null && <HoleInfoChip label="White" value={`${hole.yardageWhite}y`} />}
            {hole.yardageBlue  != null && <HoleInfoChip label="Blue"  value={`${hole.yardageBlue}y`} />}
            {hole.yardageRed   != null && <HoleInfoChip label="Red"   value={`${hole.yardageRed}y`} />}
          </View>
        )}

        {/* ── HOLE CHALLENGE BADGE ── */}
        {holeChallenge && (
          <View style={[styles.challengeBadge, { backgroundColor: theme.colors.highlight, borderColor: theme.colors.accent + '44' }]}>
            {holeChallenge.sponsorName && (
              <Text style={[styles.challengeSponsor, { color: theme.colors.accent }]}>
                {holeChallenge.sponsorName}
              </Text>
            )}
            <Text style={[styles.challengeDesc, { color: theme.colors.primary }]}>
              {holeChallenge.description}
            </Text>
            {holeChallenge.prizeDescription && (
              <Text style={[styles.challengePrize, { color: theme.colors.accent }]}>
                🏆 {holeChallenge.prizeDescription}
              </Text>
            )}
          </View>
        )}

        {/* ── READ-ONLY NOTICE ── */}
        {!scoringEnabled && (
          <View style={[styles.readOnlyNotice, { backgroundColor: theme.colors.surface, borderColor: theme.colors.accent + '55' }]}>
            <Text style={[styles.readOnlyText, { color: theme.colors.accent }]}>
              Scorecard is read-only — scoring opens when the organizer starts the round
            </Text>
          </View>
        )}

        {/* ── PER-PLAYER SHOT ENTRY ── */}
        <View style={[styles.playerCard, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.playerCardTitle, { color: theme.colors.primary }]}>
            Player Shots
          </Text>

          {session.team.players.length === 0 && (
            <Text style={[styles.noPlayersText, { color: theme.colors.accent }]}>
              No players on this team.
            </Text>
          )}

          {session.team.players.map((player, idx) => {
            const shots       = playerBreakdown[player.id] ?? { drive: 0, approach: 0, putt: 0 };
            const initials    = `${player.firstName[0]}${player.lastName[0]}`;
            const playerTotal = shots.drive + shots.approach + shots.putt;
            const isFirst     = idx === 0;
            // Shot entry is disabled when the hole is marked complete
            const shotDisabled = !scoringEnabled || isCurrentHoleDone;

            return (
              <View
                key={player.id}
                style={[
                  styles.playerSection,
                  !isFirst && { borderTopColor: theme.colors.accent + '22', borderTopWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <View style={styles.playerNameRow}>
                  <View style={[styles.playerAvatar, { backgroundColor: theme.colors.highlight }]}>
                    <Text style={[styles.playerInitials, { color: theme.colors.primary }]}>
                      {initials}
                    </Text>
                  </View>
                  <Text style={[styles.playerName, { color: theme.colors.primary }]} numberOfLines={1}>
                    {player.firstName} {player.lastName}
                  </Text>
                  {playerTotal > 0 && (
                    <Text style={[styles.playerTotal, { color: theme.colors.accent }]}>
                      {playerTotal} shots
                    </Text>
                  )}
                </View>

                <View style={styles.playerCols}>
                  <ShotColumn
                    label="Drive"
                    value={shots.drive}
                    onDecrement={() => changePlayerShots(player.id, 'drive', -1)}
                    onIncrement={() => changePlayerShots(player.id, 'drive', 1)}
                    disabled={shotDisabled}
                    theme={theme}
                  />
                  <View style={[styles.colDivider, { backgroundColor: theme.colors.accent + '22' }]} />
                  <ShotColumn
                    label="Approach"
                    value={shots.approach}
                    onDecrement={() => changePlayerShots(player.id, 'approach', -1)}
                    onIncrement={() => changePlayerShots(player.id, 'approach', 1)}
                    disabled={shotDisabled}
                    theme={theme}
                  />
                  <View style={[styles.colDivider, { backgroundColor: theme.colors.accent + '22' }]} />
                  <ShotColumn
                    label="Putt"
                    value={shots.putt}
                    onDecrement={() => changePlayerShots(player.id, 'putt', -1)}
                    onIncrement={() => changePlayerShots(player.id, 'putt', 1)}
                    disabled={shotDisabled}
                    theme={theme}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {/* ── SYNC STATUS ── */}
        <SyncStatusBar
          status={syncStatus}
          pendingCount={completedHoles.size}
          onSync={handleSync}
          theme={theme}
        />
      </ScrollView>

      {/* ── HOLE IN ONE CELEBRATION ── */}
      <HoleInOneModal
        visible={showHio}
        holeName={`Hole ${currentHoleNumber}`}
        onDismiss={() => setShowHio(false)}
      />

      {/* ── SPONSOR INFO ── */}
      <SponsorModal
        sponsor={selectedSponsor}
        onDismiss={() => setSelectedSponsor(null)}
      />

      {/* ── HOLE NAVIGATION ── */}
      <View style={[styles.navBar, { backgroundColor: theme.colors.surface, borderTopColor: '#e0e0e0' }]}>
        {/* Counter row */}
        <View style={styles.counterRow}>
          <Text style={[styles.holeCounter, { color: theme.colors.primary }]}>
            Hole {holeIndex + 1} of {holeOrder.length}
          </Text>
          {isCurrentHoleDone && (
            <View style={styles.completedBadge}>
              <Text style={styles.completedBadgeText}>✓ Complete</Text>
            </View>
          )}
        </View>

        {/* Button row */}
        <View style={styles.btnRow}>
          <Pressable
            onPress={handlePrev}
            disabled={holeIndex === 0}
            style={({ pressed }) => [
              styles.navBtn,
              {
                backgroundColor: pressed ? theme.colors.accent : theme.colors.primary,
                opacity: holeIndex === 0 ? 0.3 : 1,
              },
            ]}
            accessibilityLabel="Previous hole"
            accessibilityRole="button"
          >
            <Text style={styles.navBtnText}>← Prev</Text>
          </Pressable>

          {/* Complete Hole button */}
          {isCurrentHoleDone ? (
            <View style={styles.completedBtn}>
              <Text style={styles.completedBtnText}>✓ Done</Text>
            </View>
          ) : (
            <Pressable
              onPress={handleComplete}
              disabled={!hasShots || !scoringEnabled || completing}
              style={({ pressed }) => [
                styles.completeBtn,
                { backgroundColor: pressed ? '#1e8449' : '#27ae60' },
                (!hasShots || !scoringEnabled || completing) && styles.completeBtnDisabled,
              ]}
              accessibilityLabel="Complete hole"
              accessibilityRole="button"
            >
              {completing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.completeBtnText}>Complete Hole</Text>}
            </Pressable>
          )}

          <Pressable
            onPress={handleNext}
            style={({ pressed }) => [
              styles.navBtn,
              {
                backgroundColor: pressed
                  ? theme.colors.accent
                  : isLastHole ? theme.colors.action : theme.colors.primary,
              },
            ]}
            accessibilityLabel={isLastHole ? 'Finish round' : 'Next hole'}
            accessibilityRole="button"
          >
            <Text style={styles.navBtnText}>{isLastHole ? 'Finish ✓' : 'Next →'}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 32 },

  readOnlyNotice: {
    borderWidth: 1, borderRadius: 10,
    padding: 12, marginBottom: 12, alignItems: 'center',
  },
  readOnlyText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  header: {
    paddingTop:    Platform.OS === 'android' ? 12 : 0,
    paddingBottom: 12,
    paddingHorizontal: 20,
    alignItems:    'center',
  },
  headerTeam:  { fontSize: 18, fontWeight: '800' },
  headerEvent: { fontSize: 13, fontWeight: '500', marginTop: 2, opacity: 0.85 },
  headerTotal: { fontSize: 12, fontWeight: '600', marginTop: 4, opacity: 0.75 },

  sponsorBadge: {
    borderWidth: 2, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, paddingHorizontal: 16, marginBottom: 12,
    gap: 4,
    backgroundColor: '#f9f9f9',
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  sponsorName:    { fontSize: 13, fontWeight: '700' },
  sponsorTagline: { fontSize: 11, fontWeight: '600', fontStyle: 'italic', textAlign: 'center' },
  sponsorTapHint: { fontSize: 10, fontWeight: '500', opacity: 0.55 },

  infoRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    justifyContent: 'center', marginBottom: 12,
    alignItems: 'flex-start',
  },

  challengeBadge: {
    borderWidth: 1, borderRadius: 10,
    padding: 10, marginBottom: 12, gap: 3,
  },
  challengeSponsor: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  challengeDesc:    { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  challengePrize:   { fontSize: 12, fontWeight: '600' },

  // ── Per-player shot card ──
  playerCard: {
    borderRadius: 14,
    paddingTop: 16,
    paddingHorizontal: 12,
    paddingBottom: 8,
    marginBottom: 8,
    boxShadow: '0px 1px 6px rgba(0, 0, 0, 0.06)', elevation: 2,
  },
  playerCardTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  noPlayersText:   { fontSize: 13, paddingBottom: 8 },

  playerSection: {
    paddingTop: 12,
    paddingBottom: 16,
  },
  playerNameRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 12,
  },
  playerAvatar:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  playerInitials: { fontSize: 12, fontWeight: '800' },
  playerName:     { flex: 1, fontSize: 14, fontWeight: '600' },
  playerTotal:    { fontSize: 13, fontWeight: '700' },

  playerCols: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colDivider: { width: 1, height: 80, marginHorizontal: 4 },

  // ── Navigation bar ──
  navBar: {
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
  },
  counterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginBottom: 10,
  },
  holeCounter: { fontSize: 14, fontWeight: '600' },
  completedBadge: {
    backgroundColor: '#27ae60', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  completedBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  btnRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6,
  },
  navBtn: {
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 10, minWidth: 80, alignItems: 'center',
  },
  navBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  completeBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  completeBtnDisabled: { opacity: 0.4 },
  completeBtnText:     { fontSize: 14, fontWeight: '700', color: '#fff' },

  completedBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    alignItems: 'center', backgroundColor: '#27ae60' + '22',
    borderWidth: 1, borderColor: '#27ae60',
  },
  completedBtnText: { fontSize: 14, fontWeight: '700', color: '#27ae60' },

  // ── Pre-scoring summary ──────────────────────────────────────────────────────
  headerEventName: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  headerHostedBy:  { fontSize: 13, fontWeight: '500', marginTop: 3, textAlign: 'center', opacity: 0.8 },

  summaryTitle: {
    fontSize: 18, fontWeight: '800',
    marginTop: 16, marginBottom: 8, paddingHorizontal: 12,
  },
  summaryTableHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 12,
  },
  summaryTh:            { fontSize: 11, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  summaryHoleBlock:     {},
  summaryCell:          { fontSize: 14 },
  summaryCellDash:      { textAlign: 'center', fontSize: 14 },
  summaryChallengeIcon: { fontSize: 16 },
  summarySubRow:        { paddingHorizontal: 12, paddingBottom: 6 },
  summarySubText:       { fontSize: 11, fontWeight: '500' },

  // Column-label tooltip (tap a header abbreviation to reveal full name)
  headerTip:     { alignItems: 'center', paddingVertical: 5, marginBottom: 2 },
  headerTipText: { color: '#fff', fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
});
