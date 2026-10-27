import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useObserve } from 'expo-observe';
import { useTheme, useClasses } from '@gfp/ui';
import { useSession, getHoleOrder } from '@/lib/session';
import { fetchPublicChallenges, type ChallengeCacheDto, type HoleCacheDto, type PlayerCacheDto, type PlayerShotBreakdown, type SponsorCacheDto } from '@/lib/api';
import { HoleInOneModal, SponsorModal, HoleInfoModal } from '@/components/scorecardComponents';
import { ScorecardSummary } from '@/components/scorecard/ScorecardSummary';
import { ScoringHeader } from '@/components/scorecard/ScoringHeader';
import { HoleSponsorBadge } from '@/components/scorecard/HoleSponsorBadge';
import { HoleChipsRow } from '@/components/scorecard/HoleChipsRow';
import { HoleNotices } from '@/components/scorecard/HoleNotices';
import { PlayerShotsCard } from '@/components/scorecard/PlayerShotsCard';
import { HoleNavBar } from '@/components/scorecard/HoleNavBar';
import { screenStyles } from '@/components/scorecard/scorecardStyles';
import { useScorecardLayout } from '@/lib/scorecardLayout';
import { resolveChipsLayout, type ChipSpec } from '@/lib/chipsFit';
import { formatToPar } from '@/lib/toPar';
import { strokesByPlayer } from '@/lib/holeUtils';
import {
  teamHoleGross, teamHolePar, teamStablefordPoints, aceGolferIds, countingPlayerId,
} from '@gfp/shared-types';
import { holeCompleteHaptic } from '@/lib/haptics';

/** Stable empty roster, so the layout hook keeps one identity before the session loads. */
const NO_PLAYERS: PlayerCacheDto[] = [];

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────

export default function ScorecardScreen() {
  const theme                  = useTheme();
  const c = useClasses();
  const router                 = useRouter();
  const {
    session, loading,
    pendingScores, completedHoles, syncedHoles,
    upsertScore, completeHole, reopenHole, refreshFromServer,
  } = useSession();
  // /scorecard?hole=N opens that hole (the round summary links here to edit).
  const { hole: holeParam } = useLocalSearchParams<{ hole?: string }>();
  const { markInteractive } = useObserve();

  const [holeIndex,         setHoleIndex]         = useState(0);
  /** Hole reopened for editing whose score came from the organizer (no per-golfer shots on it). */
  const [organizerEditHole, setOrganizerEditHole] = useState<number | null>(null);
  const [showHio,           setShowHio]           = useState(false);
  const [completing,        setCompleting]        = useState(false);
  const [challenges,        setChallenges]        = useState<ChallengeCacheDto[]>([]);
  const [selectedSponsor,   setSelectedSponsor]   = useState<SponsorCacheDto | null>(null);
  /** Height the scroll area actually got. 0 until onLayout fires. */
  const [scrollHeight,      setScrollHeight]      = useState(0);
  /** Golfer whose controls are expanded when the layout has to collapse them. */
  const [expandedPlayer,    setExpandedPlayer]    = useState<string | null>(null);
  /** Width the chips row actually got. 0 until onLayout fires. */
  const [chipsWidth,        setChipsWidth]        = useState(0);
  const [showHoleInfo,      setShowHoleInfo]      = useState(false);

  const holeOrder = useMemo(
    () => session?.team ? getHoleOrder(session.team.startingHole, session.event.holes) : [],
    [session],
  );

  useEffect(() => {
    if (!holeParam || holeOrder.length === 0) return;
    const idx = holeOrder.indexOf(Number(holeParam));
    if (idx >= 0) setHoleIndex(idx);
    // Consume the param so returning to this tab later doesn't jump again.
    router.setParams({ hole: undefined });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- router is a module singleton
  }, [holeParam, holeOrder]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- expo-router's router is a module singleton, so its identity never changes
  }, [loading, session]);

  // TTI for a returning golfer: the session restored and the card is past its spinner.
  const cardReady = !loading && !!session?.team;
  useEffect(() => {
    if (cardReady) markInteractive();
  }, [cardReady, markInteractive]);

  useEffect(() => {
    if (!session) return;
    fetchPublicChallenges(session.event.eventCode).then(setChallenges);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the closure reads only session.event.eventCode, which is already the dep
  }, [session?.event.eventCode]);

  // Pull admin corrections / resolved conflicts whenever the scorecard is
  // focused so the golfer sees changes to their own scores immediately.
  useFocusEffect(
    useCallback(() => { refreshFromServer(); }, [refreshFromServer]),
  );


  // Sizes come from the height the scroll area actually measured, not from a
  // guess at header/safe-area chrome — that varies by device and by whether the
  // hole carries a sponsor or challenge badge.
  //
  // Resolved HERE, above the early returns below, because a hook has to run on
  // every render: the loading and pre-scoring branches return before the
  // scoring view, so calling this beside the code that uses it made the hook
  // count jump the moment the session arrived ("Rendered more hooks than during
  // the previous render"). An unmeasured height resolves to the roomy tier, so
  // running it on a render that bails out early costs nothing.
  const teamPlayers = session?.team?.players ?? NO_PLAYERS;
  const layout      = useScorecardLayout(scrollHeight, teamPlayers.length);

  if (loading || !session?.team) {
    return (
      <View style={[c.center, { backgroundColor: theme.pageBackground }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // ── PRE-SCORING SUMMARY (shown in place of per-hole sheets when not live) ────
  const scoringEnabled =
    session.event.status === 'Scoring' || session.event.status === 'Draft';

  if (!scoringEnabled) {
    return (
      <ScorecardSummary
        session={session}
        team={session.team}
        pendingScores={pendingScores}
        holeByNumber={holeByNumber}
        challengeMap={challengeMap}
        holeSponsorMap={holeSponsorMap}
        selectedSponsor={selectedSponsor}
        onSelectSponsor={setSelectedSponsor}
      />
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

  // Green only once the whole round is up to date, not just this hole: a hole
  // that failed to reach the server would otherwise hide behind a green check on
  // a later one. No tap target — the foreground poll retries every 30s/60s and
  // every "Hole Complete" flushes the whole backlog, so there is nothing for the
  // golfer to do but see the state.
  const roundFullySynced = [...completedHoles].every(h => syncedHoles.has(h));

  // Whose controls are open when the layout collapses the others. Nobody has
  // picked one yet → the first golfer, which is who the scorer starts with.
  const activePlayerId = expandedPlayer ?? teamPlayers[0]?.id;
  const shotSize = {
    button:    layout.shotButton,
    gap:       layout.shotGap,
    labelFont: layout.shotLabelFont,
    valueFont: layout.shotValueFont,
  };

  // The team's number for the hole is the format's call (U8): the sum of the
  // shots used in a scramble, the lowest golfer in Best Ball, the aggregate in
  // Stroke/Stableford. The server recomputes the same way when the hole syncs.
  const format          = session?.event.format ?? 'Scramble';
  const playerBreakdown = currentScore?.playerShots ?? {};
  const holeStrokes     = strokesByPlayer(playerBreakdown);
  const grossScore      = teamHoleGross(format, holeStrokes) ?? 0;
  const holePar         = teamHolePar(format, holeStrokes, par);
  // Fall back to the stored gross when there's no per-player breakdown — e.g.
  // an admin-corrected score pulled from the server has a total but no shots.
  const displayScore = grossScore > 0 ? grossScore : (currentScore?.grossScore ?? null);
  const hasShots     = grossScore > 0;
  const holeConflict = currentScore?.conflict ?? false;

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

    const gross      = teamHoleGross(format, strokesByPlayer(cleaned)) ?? 0;
    // Best Ball's putts are the counting ball's; every other format's row
    // holds all of them.
    const counting   = countingPlayerId(format, strokesByPlayer(cleaned));
    const totalPutts = counting
      ? cleaned[counting].putt
      : Object.values(cleaned).reduce((s, b) => s + b.putt, 0);

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
      holeCompleteHaptic();
      // Scramble: the team ball in one. Every other format: any golfer's own
      // ball in one — the aggregate row can't show it (U8).
      const ace = format === 'Scramble'
        ? grossScore === 1
        : aceGolferIds(format, holeStrokes).length > 0;
      if (ace) setShowHio(true);
    } finally {
      setCompleting(false);
    }
  }

  // Edit Score: reopen a submitted hole. Changing a shot re-queues it and Hole
  // Complete resends it. The server replaces this phone's own score; a hole
  // someone else entered (the organizer's desk) becomes a proposed score for
  // the organizer to approve — the conflict notice then shows it as pending.
  async function handleEdit() {
    if (!scoringEnabled || !isCurrentHoleDone) return;
    setOrganizerEditHole(currentScore && !currentScore.playerShots ? currentHoleNumber : null);
    await reopenHole(currentHoleNumber);
  }

  function handlePrev() {
    if (holeIndex > 0) setHoleIndex(i => i - 1);
  }

  function handleNext() {
    // push, not replace: the summary sits in the tab group (tab bar stays),
    // and Back returns to the scorecard.
    if (isLastHole) router.push('/round-summary');
    else setHoleIndex(i => i + 1);
  }

  const completedCount = completedHoles.size;
  const completedScores = pendingScores.filter(s => completedHoles.has(s.holeNumber));
  const grossTotal     = completedScores.reduce((sum, s) => sum + s.grossScore, 0);

  // Par for the holes actually completed, so the round's to-par compares like
  // with like — one par per ball the row holds (U8). Unknown holes fall back
  // to 4, matching the server's LeaderboardCalculator default.
  const parThrough = completedScores.reduce(
    (sum, s) => sum + teamHolePar(format, strokesByPlayer(s.playerShots), holeByNumber.get(s.holeNumber)?.par ?? 4),
    0,
  );
  const roundToPar = completedCount > 0 ? grossTotal - parThrough : null;
  // Stableford ranks on points, scored per golfer and summed (Rule 21.1).
  const roundPoints = completedScores.reduce(
    (sum, s) => sum + teamStablefordPoints(strokesByPlayer(s.playerShots), holeByNumber.get(s.holeNumber)?.par ?? 4),
    0,
  );

  // Round-level chips only once the round is under way — "Through 0 · Round 0"
  // before the first hole is noise.
  const roundChips: ChipSpec[] = completedCount > 0
    ? [
        format === 'Stableford'
          ? { label: 'Points',  value: String(roundPoints) }
          : { label: 'Round',   value: String(grossTotal), suffix: formatToPar(roundToPar) },
        { label: 'Through', value: String(completedCount) },
      ]
    : [];

  const relLabel = formatToPar(displayScore !== null ? displayScore - (hasShots ? holePar : par) : null);

  const yardageChips: ChipSpec[] = hole
    ? ([
        hole.yardageWhite != null ? { label: 'White', value: `${hole.yardageWhite}y` } : null,
        hole.yardageBlue  != null ? { label: 'Blue',  value: `${hole.yardageBlue}y` }  : null,
        hole.yardageRed   != null ? { label: 'Red',   value: `${hole.yardageRed}y` }   : null,
      ].filter(Boolean) as ChipSpec[])
    : [];

  const scoreChipSpec: ChipSpec = {
    label: 'Score',
    value: displayScore !== null ? String(displayScore) : '—',
    variant: 'score',
    suffix: relLabel,
  };

  // Width is measured; the arrangement is computed. Reacting to the row's
  // measured HEIGHT would oscillate — collapsing changes the content, which then
  // fits, which expands, which wraps again. The container width doesn't move.
  const chipsRow = resolveChipsLayout(chipsWidth, {
    score:    scoreChipSpec,
    hcp:      hole ? { label: 'HCP', value: String(hole.handicapIndex) } : null,
    yardages: yardageChips,
    totals:   roundChips,
  });

  return (
    <SafeAreaView edges={['left', 'right']} style={[screenStyles.page, { backgroundColor: theme.pageBackground }]}>
      {/* ── HEADER ── */}
      <ScoringHeader
        teamName={session.team.name}
        eventName={session.event.name}
        currentHoleNumber={currentHoleNumber}
        par={par}
        isCurrentHoleDone={isCurrentHoleDone}
        roundFullySynced={roundFullySynced}
      />

      <ScrollView
        style={styles.scrollFlex}
        contentContainerStyle={[screenStyles.scroll, { padding: layout.scrollPadding }]}
        keyboardShouldPersistTaps="handled"
        onLayout={e => setScrollHeight(e.nativeEvent.layout.height)}
      >

        {/* ── HOLE SPONSOR ── */}
        {currentHoleSponsor && (
          <HoleSponsorBadge
            sponsor={currentHoleSponsor}
            logoUrl={hole?.sponsorLogoUrl}
            onPress={() => setSelectedSponsor(currentHoleSponsor)}
          />
        )}

        {/* ── HOLE INFO CHIPS ──
            Fits:  Par | Score | HCP | yardages | Through | Round
            Tight: [Hole N] | Score | Through | Round, with the hole detail
                   behind the button. The row must never wrap — scorecardLayout
                   budgets one line for it. */}
        {hole && (
          <HoleChipsRow
            hole={hole}
            chipsRow={chipsRow}
            displayScore={displayScore}
            par={par}
            roundChips={roundChips}
            roundToPar={roundToPar}
            currentHoleNumber={currentHoleNumber}
            onWidth={setChipsWidth}
            onOpenHoleInfo={() => setShowHoleInfo(true)}
          />
        )}

        <HoleNotices
          holeChallenge={holeChallenge}
          holeConflict={holeConflict}
          organizerEditHole={organizerEditHole}
          currentHoleNumber={currentHoleNumber}
          isCurrentHoleDone={isCurrentHoleDone}
          scoringEnabled={scoringEnabled}
          eventStatus={session.event.status}
        />

        {/* ── PER-PLAYER SHOT ENTRY ── */}
        <PlayerShotsCard
          layout={layout}
          teamPlayers={teamPlayers}
          playerBreakdown={playerBreakdown}
          scoringEnabled={scoringEnabled}
          isCurrentHoleDone={isCurrentHoleDone}
          activePlayerId={activePlayerId}
          shotSize={shotSize}
          onExpand={setExpandedPlayer}
          onChangeShots={changePlayerShots}
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

      {/* ── HOLE DETAIL (collapsed chips) ── */}
      <HoleInfoModal
        hole={showHoleInfo ? hole : null}
        onDismiss={() => setShowHoleInfo(false)}
      />

      {/* ── HOLE NAVIGATION ── */}
      <HoleNavBar
        isFirstHole={holeIndex === 0}
        isLastHole={isLastHole}
        isCurrentHoleDone={isCurrentHoleDone}
        scoringEnabled={scoringEnabled}
        hasShots={hasShots}
        completing={completing}
        currentHoleNumber={currentHoleNumber}
        onPrev={handlePrev}
        onNext={handleNext}
        onComplete={handleComplete}
        onEdit={handleEdit}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollFlex: { flex: 1 },
});
