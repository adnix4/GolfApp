import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
  ScrollView, Image, Platform, SafeAreaView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme, AdaptiveLogoFrame } from '@gfp/ui';
import { useSession, getHoleOrder } from '@/lib/session';
import { fetchPublicChallenges, type ChallengeCacheDto, type HoleCacheDto, type PlayerShotBreakdown, type SponsorCacheDto } from '@/lib/api';
import {
  HoleInfoChip, ScoreChip,
  HoleInOneModal, ChallengeDetailModal, SponsorModal, HoleInfoModal, ShotColumn,
} from '@/components/scorecardComponents';
import { useScorecardLayout } from '@/lib/scorecardLayout';
import { resolveChipsLayout, type ChipSpec } from '@/lib/chipsFit';
import { formatToPar } from '@/lib/toPar';

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
    pendingScores, completedHoles, syncedHoles,
    upsertScore, completeHole, refreshFromServer,
  } = useSession();

  const [holeIndex,         setHoleIndex]         = useState(0);
  const [showHio,           setShowHio]           = useState(false);
  const [completing,        setCompleting]        = useState(false);
  const [challenges,        setChallenges]        = useState<ChallengeCacheDto[]>([]);
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeCacheDto | null>(null);
  const [selectedSponsor,   setSelectedSponsor]   = useState<SponsorCacheDto | null>(null);
  const [headerTip,         setHeaderTip]         = useState<string | null>(null);
  /** Height the scroll area actually got. 0 until onLayout fires. */
  const [scrollHeight,      setScrollHeight]      = useState(0);
  /** Golfer whose controls are expanded when the layout has to collapse them. */
  const [expandedPlayer,    setExpandedPlayer]    = useState<string | null>(null);
  /** Width the chips row actually got. 0 until onLayout fires. */
  const [chipsWidth,        setChipsWidth]        = useState(0);
  const [showHoleInfo,      setShowHoleInfo]      = useState(false);
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

  // Pull admin corrections / resolved conflicts whenever the scorecard is
  // focused so the golfer sees changes to their own scores immediately.
  useFocusEffect(
    useCallback(() => { refreshFromServer(); }, [refreshFromServer]),
  );


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
              relative === null ? theme.mutedText :
              relative < 0      ? '#27ae60' :
              relative > 0      ? '#e74c3c' : theme.mutedText;

            return (
              <View key={holeNum} style={styles.summaryHoleBlock}>
                <View style={[summaryCol.row, { backgroundColor: rowBg }]}>
                  <Text style={[summaryCol.hole, styles.summaryCell, { color: theme.colors.primary, fontWeight: '700' }]}>
                    {holeNum}
                  </Text>
                  <Text style={[summaryCol.yds, styles.summaryCell, { color: theme.mutedText }]}>
                    {yardage != null ? `${yardage}` : '—'}
                  </Text>
                  <Text style={[summaryCol.par, styles.summaryCell, { color: theme.mutedText }]}>
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
                    <Text style={[summaryCol.spon, styles.summaryCellDash, { color: theme.mutedText }]}>—</Text>
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
                    <Text style={[summaryCol.chal, styles.summaryCellDash, { color: theme.mutedText }]}>—</Text>
                  )}
                </View>
                {pending?.conflict && (
                  <View style={styles.summarySubRow}>
                    <Text style={[styles.summarySubText, { color: '#a67100' }]}>
                      ⚠ Your score is waiting for admin approval
                    </Text>
                  </View>
                )}
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

  // Green only once the whole round is up to date, not just this hole: a hole
  // that failed to reach the server would otherwise hide behind a green check on
  // a later one. No tap target — the foreground poll retries every 30s/60s and
  // every "Hole Complete" flushes the whole backlog, so there is nothing for the
  // golfer to do but see the state.
  const roundFullySynced = [...completedHoles].every(h => syncedHoles.has(h));

  // Sizes come from the height the scroll area actually measured, not from a
  // guess at header/safe-area chrome — that varies by device and by whether the
  // hole carries a sponsor or challenge badge.
  const teamPlayers = session.team.players;
  const layout = useScorecardLayout(scrollHeight, teamPlayers.length);
  // Whose controls are open when the layout collapses the others. Nobody has
  // picked one yet → the first golfer, which is who the scorer starts with.
  const activePlayerId = expandedPlayer ?? teamPlayers[0]?.id;
  const shotSize = {
    button:    layout.shotButton,
    gap:       layout.shotGap,
    labelFont: layout.shotLabelFont,
    valueFont: layout.shotValueFont,
  };

  // Team gross = sum of every player's (drive + approach + putt)
  const playerBreakdown = currentScore?.playerShots ?? {};
  const grossScore      = Object.values(playerBreakdown).reduce(
    (sum, b) => sum + b.drive + b.approach + b.putt, 0,
  );
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

  // Par for the holes actually completed, so the round's to-par compares like
  // with like. Unknown holes fall back to 4, matching the server's
  // LeaderboardCalculator default.
  const parThrough = [...completedHoles]
    .reduce((sum, h) => sum + (holeByNumber.get(h)?.par ?? 4), 0);
  const roundToPar = completedCount > 0 ? grossTotal - parThrough : null;

  // Round-level chips only once the round is under way — "Through 0 · Round 0"
  // before the first hole is noise.
  const roundChips: ChipSpec[] = completedCount > 0
    ? [
        { label: 'Round',   value: String(grossTotal), suffix: formatToPar(roundToPar) },
        { label: 'Through', value: String(completedCount) },
      ]
    : [];

  const relLabel = formatToPar(displayScore !== null ? displayScore - par : null);

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
    <SafeAreaView style={[styles.page, { backgroundColor: theme.pageBackground }]}>
      {/* ── HEADER ── */}
      <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
        <Text style={[styles.headerTeam, { color: theme.colors.highlight }]} numberOfLines={1}>
          {session.team.name}
        </Text>
        {/* Hole counter and sync state ride the event line rather than owning a
            row in the nav bar — same information, ~30px more scroll area. */}
        <View style={styles.headerMetaRow}>
          <Text style={[styles.headerEvent, { color: theme.colors.highlight }]} numberOfLines={1}>
            {session.event.name}
          </Text>
          {/* The hole the golfer is standing on, NOT their position in the
              round. getHoleOrder wraps for shotgun starts, so a team starting
              on 12 plays 12..18,1..11 — "Hole 1/18" there was flatly wrong, and
              contradicted the Hole N button and detail modal, which have always
              shown the real number. Progress is the Through chip's job. */}
          <Text style={[styles.headerHole, { color: theme.colors.highlight }]}>
            Hole {currentHoleNumber}
            <Text style={styles.headerPar}>  Par {par}</Text>
          </Text>
          {isCurrentHoleDone && (
            <View style={[styles.completedBadge, roundFullySynced ? styles.badgeSynced : styles.badgePending]}>
              <Text style={[styles.completedBadgeText, !roundFullySynced && styles.badgePendingText]}>
                {roundFullySynced ? '✓' : 'Pending sync'}
              </Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scrollFlex}
        contentContainerStyle={[styles.scroll, { padding: layout.scrollPadding }]}
        keyboardShouldPersistTaps="handled"
        onLayout={e => setScrollHeight(e.nativeEvent.layout.height)}
      >

        {/* ── HOLE SPONSOR ── */}
        {currentHoleSponsor && (
          <Pressable
            style={({ pressed }) => [
              styles.sponsorBadge,
              {
                borderColor: theme.colors.primary,
                // Light surface with primary content, never a primary fill: the
                // theming contract guarantees surface is light and primary
                // clears 4.5:1 on it, and sponsor logos assume a light ground.
                backgroundColor: pressed ? theme.colors.primary + '12' : '#f9f9f9',
                opacity: pressed ? 0.9 : 1,
              },
            ]}
            onPress={() => setSelectedSponsor(currentHoleSponsor)}
            accessibilityRole="button"
            accessibilityLabel={`View ${currentHoleSponsor.name} sponsor info`}
          >
            <View style={styles.sponsorContent}>
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
            </View>
            {/* Disclosure chevron carries the affordance now that the
                "Tap to learn more" hint is gone. */}
            <Text style={[styles.sponsorChevron, { color: theme.colors.primary }]}>›</Text>
          </Pressable>
        )}

        {/* ── HOLE INFO CHIPS ──
            Fits:  Par | Score | HCP | yardages | Through | Round
            Tight: [Hole N] | Score | Through | Round, with the hole detail
                   behind the button. The row must never wrap — scorecardLayout
                   budgets one line for it. */}
        {hole && (
          <View style={styles.infoRow} onLayout={e => setChipsWidth(e.nativeEvent.layout.width)}>
            {chipsRow.showYardagesButton && (
              <Pressable
                onPress={() => setShowHoleInfo(true)}
                style={({ pressed }) => [
                  styles.holeInfoBtn,
                  { borderColor: theme.colors.primary, backgroundColor: pressed ? theme.colors.primary + '18' : theme.colors.surface },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Yardages and handicap for hole ${currentHoleNumber}`}
              >
                <Text style={[styles.holeInfoBtnText, { color: theme.colors.primary }]}>
                  Yardages
                </Text>
                <Text style={[styles.holeInfoBtnChevron, { color: theme.colors.primary }]}>›</Text>
              </Pressable>
            )}

            <ScoreChip grossScore={displayScore} par={par} />

            {chipsRow.showHcp && (
              <HoleInfoChip label="HCP" value={String(hole.handicapIndex)} />
            )}

            {!chipsRow.showYardagesButton && (
              <>
                {hole.yardageWhite != null && <HoleInfoChip label="White" value={`${hole.yardageWhite}y`} />}
                {hole.yardageBlue  != null && <HoleInfoChip label="Blue"  value={`${hole.yardageBlue}y`} />}
                {hole.yardageRed   != null && <HoleInfoChip label="Red"   value={`${hole.yardageRed}y`} />}
              </>
            )}

            {roundChips.map(c => (
              <HoleInfoChip
                key={c.label}
                label={c.label}
                value={c.value}
                {...(c.label === 'Round' ? { toPar: roundToPar } : {})}
              />
            ))}
          </View>
        )}

        {/* ── HOLE CHALLENGE BADGE ── */}
        {holeChallenge && (
          <View style={[styles.challengeBadge, { backgroundColor: theme.colors.highlight, borderColor: theme.colors.accent + '44' }]}>
            {holeChallenge.sponsorName && (
              <Text style={[styles.challengeSponsor, { color: theme.mutedText }]}>
                {holeChallenge.sponsorName}
              </Text>
            )}
            <Text style={[styles.challengeDesc, { color: theme.colors.primary }]}>
              {holeChallenge.description}
            </Text>
            {holeChallenge.prizeDescription && (
              <Text style={[styles.challengePrize, { color: theme.mutedText }]}>
                🏆 {holeChallenge.prizeDescription}
              </Text>
            )}
          </View>
        )}

        {/* ── CONFLICT / PENDING-APPROVAL NOTICE ── */}
        {holeConflict && (
          <View style={[styles.conflictNotice, { backgroundColor: '#fff7e6', borderColor: '#f0a500' }]}>
            <Text style={styles.conflictNoticeText}>
              ⚠ Your score for this hole is waiting for admin approval. The score shown is the
              organizer's current record.
            </Text>
          </View>
        )}

        {/* ── READ-ONLY NOTICE ── */}
        {!scoringEnabled && (
          <View style={[styles.readOnlyNotice, { backgroundColor: theme.colors.surface, borderColor: theme.colors.accent + '55' }]}>
            <Text style={[styles.readOnlyText, { color: theme.mutedText }]}>
              {session.event.status === 'Completed'
                ? 'Scorecard is read-only — the round is complete'
                : 'Scorecard is read-only — scoring opens when the organizer starts the round'}
            </Text>
          </View>
        )}

        {/* ── PER-PLAYER SHOT ENTRY ── */}
        <View style={[
          styles.playerCard,
          {
            backgroundColor: theme.colors.surface,
            paddingTop:      layout.cardPaddingTop,
            paddingBottom:   layout.cardPaddingBottom,
          },
        ]}>
          {layout.showCardTitle && (
            <Text style={[styles.playerCardTitle, { color: theme.colors.primary }]}>
              Player Shots
            </Text>
          )}

          {/* One shared header instead of repeating Drive/Approach/Putt under
              every golfer. Spacer matches the name block so the labels line up
              with the columns they title. */}
          {teamPlayers.length > 0 && (
            <View style={styles.colHeaderRow}>
              <View style={styles.playerNameBlock} />
              <View style={styles.playerCols}>
                {['Drive', 'Approach', 'Putt'].map((l, i) => (
                  <React.Fragment key={l}>
                    {i > 0 && <View style={styles.colHeaderSpacer} />}
                    <Text
                      style={[styles.colHeaderText, { color: theme.mutedText, fontSize: layout.shotLabelFont }]}
                      numberOfLines={1}
                    >
                      {l}
                    </Text>
                  </React.Fragment>
                ))}
              </View>
            </View>
          )}

          {teamPlayers.length === 0 && (
            <Text style={[styles.noPlayersText, { color: theme.mutedText }]}>
              No players on this team.
            </Text>
          )}

          {teamPlayers.map((player, idx) => {
            const shots       = playerBreakdown[player.id] ?? { drive: 0, approach: 0, putt: 0 };
            const initials    = `${player.firstName[0]}${player.lastName[0]}`;
            const playerTotal = shots.drive + shots.approach + shots.putt;
            const isFirst     = idx === 0;
            // Shot entry is disabled when the hole is marked complete
            const shotDisabled = !scoringEnabled || isCurrentHoleDone;

            // A foursome's expanded controls exceed every phone viewport, so on
            // short screens only the golfer being scored is expanded and the
            // rest sit as one-line rows you tap to open.
            const isExpanded = !layout.collapseInactivePlayers || activePlayerId === player.id;

            if (!isExpanded) {
              return (
                <Pressable
                  key={player.id}
                  onPress={() => setExpandedPlayer(player.id)}
                  style={[
                    styles.collapsedRow,
                    !isFirst && { borderTopColor: theme.colors.accent + '22', borderTopWidth: StyleSheet.hairlineWidth },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Enter shots for ${player.firstName} ${player.lastName}`}
                >
                  <Text style={[styles.collapsedName, { color: theme.colors.primary }]} numberOfLines={1}>
                    {player.firstName} {player.lastName}
                  </Text>
                  <Text style={[styles.collapsedTotal, { color: playerTotal > 0 ? theme.colors.primary : theme.mutedText }]}>
                    {playerTotal > 0 ? `${playerTotal}` : '—'}
                  </Text>
                </Pressable>
              );
            }

            return (
              <View
                key={player.id}
                style={[
                  styles.playerSection,
                  { paddingTop: layout.sectionPaddingTop, paddingBottom: layout.sectionPaddingBottom },
                  !isFirst && { borderTopColor: theme.colors.accent + '22', borderTopWidth: StyleSheet.hairlineWidth },
                ]}
              >
                {/* Name sits BESIDE the controls rather than above them. A
                    separate name row cost ~30px per golfer — 120px across a
                    foursome — which is most of what used to force the collapse. */}
                <View style={styles.playerNameBlock}>
                  <View style={[
                    styles.playerAvatar,
                    {
                      backgroundColor: theme.colors.highlight,
                      width: layout.avatar, height: layout.avatar, borderRadius: layout.avatar / 2,
                    },
                  ]}>
                    <Text style={[styles.playerInitials, { color: theme.colors.primary }]}>
                      {initials}
                    </Text>
                  </View>
                  <Text
                    style={[styles.playerName, { color: theme.colors.primary, fontSize: layout.nameFont }]}
                    numberOfLines={1}
                  >
                    {player.firstName}
                  </Text>
                  {playerTotal > 0 && (
                    <Text style={[styles.playerTotal, { color: theme.mutedText }]}>
                      {playerTotal}
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
                    size={shotSize}
                    showLabel={false}
                  />
                  <View style={[styles.colDivider, { backgroundColor: theme.colors.accent + '22', height: layout.shotButton * 1.8 }]} />
                  <ShotColumn
                    label="Approach"
                    value={shots.approach}
                    onDecrement={() => changePlayerShots(player.id, 'approach', -1)}
                    onIncrement={() => changePlayerShots(player.id, 'approach', 1)}
                    disabled={shotDisabled}
                    theme={theme}
                    size={shotSize}
                    showLabel={false}
                  />
                  <View style={[styles.colDivider, { backgroundColor: theme.colors.accent + '22', height: layout.shotButton * 1.8 }]} />
                  <ShotColumn
                    label="Putt"
                    value={shots.putt}
                    onDecrement={() => changePlayerShots(player.id, 'putt', -1)}
                    onIncrement={() => changePlayerShots(player.id, 'putt', 1)}
                    disabled={shotDisabled}
                    theme={theme}
                    size={shotSize}
                    showLabel={false}
                  />
                </View>
              </View>
            );
          })}
        </View>
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
      <View style={[styles.navBar, { backgroundColor: theme.colors.surface, borderTopColor: '#e0e0e0' }]}>
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
            <Text style={[styles.navBtnText, { color: theme.buttonLabel }]}>← Prev</Text>
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
            <Text style={[styles.navBtnText, { color: isLastHole ? theme.ctaLabel : theme.buttonLabel }]}>{isLastHole ? 'Finish ✓' : 'Next →'}</Text>
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
  scrollFlex: { flex: 1 },
  scroll: { paddingBottom: 32 },

  // Collapsed golfer on short screens: name + shot total, tap to expand.
  collapsedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 9, paddingHorizontal: 2,
  },
  collapsedName:  { flex: 1, fontSize: 14, fontWeight: '600' },
  collapsedTotal: { fontSize: 15, fontWeight: '800', minWidth: 28, textAlign: 'right' },

  readOnlyNotice: {
    borderWidth: 1, borderRadius: 10,
    padding: 12, marginBottom: 12, alignItems: 'center',
  },
  readOnlyText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  conflictNotice: {
    borderWidth: 1, borderRadius: 10,
    padding: 12, marginBottom: 12,
  },
  conflictNoticeText: { fontSize: 13, lineHeight: 18, color: '#a67100', fontWeight: '600' },

  header: {
    paddingTop:    Platform.OS === 'android' ? 12 : 0,
    paddingBottom: 12,
    paddingHorizontal: 20,
    alignItems:    'center',
  },
  headerTeam:  { fontSize: 18, fontWeight: '800' },
  headerEvent: { fontSize: 13, fontWeight: '500', opacity: 0.85, flexShrink: 1 },
  headerMetaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 2,
  },
  headerHole: { fontSize: 13, fontWeight: '700' },
  headerPar:  { fontSize: 13, fontWeight: '500', opacity: 0.85 },

  sponsorBadge: {
    borderWidth: 2, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12,
    gap: 8,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  sponsorContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  sponsorName:    { fontSize: 13, fontWeight: '700' },
  sponsorTagline: { fontSize: 11, fontWeight: '600', fontStyle: 'italic', textAlign: 'center' },
  sponsorChevron: { fontSize: 26, fontWeight: '400', lineHeight: 28, marginTop: -2 },

  // Stand-in for Par/HCP/yardages when they won't fit on one line.
  holeInfoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 10,
  },
  // Sizes are mirrored by the BUTTON_* constants in lib/chipsFit — "Yardages"
  // is far wider than the old "Hole 13", and the collapsed row has no further
  // fallback if it overflows.
  holeInfoBtnText:    { fontSize: 13, fontWeight: '800' },
  holeInfoBtnChevron: { fontSize: 18, fontWeight: '400', lineHeight: 20 },

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
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 16,
  },
  playerNameBlock: {
    width: 92, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  colHeaderRow: {
    flexDirection: 'row', alignItems: 'center', paddingBottom: 4,
  },
  colHeaderText: {
    flex: 1, textAlign: 'center',
    fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5,
  },
  colHeaderSpacer: { width: 1, marginHorizontal: 4 },
  playerAvatar:   { alignItems: 'center', justifyContent: 'center' },
  playerInitials: { fontSize: 12, fontWeight: '800' },
  playerName:     { flex: 1, fontSize: 14, fontWeight: '600' },
  // (playerTotal now shows just the number — the name block is narrow)
  playerTotal:    { fontSize: 13, fontWeight: '700' },

  playerCols: {
    flex: 1,
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

  completedBadge: {
    borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  badgeSynced:  { backgroundColor: '#27ae60' },
  // Amber reads as "in flight", not "broken" — an unsynced hole is normal on a
  // course with patchy signal and resolves itself.
  badgePending: { backgroundColor: '#f0a500' },
  completedBadgeText:  { color: '#fff', fontSize: 11, fontWeight: '700' },
  badgePendingText:    { color: '#4a3300' },

  btnRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6,
  },
  navBtn: {
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 10, minWidth: 80, alignItems: 'center',
  },
  navBtnText: { fontSize: 14, fontWeight: '700' },

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
