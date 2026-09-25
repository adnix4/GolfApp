import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Switch,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useEventDetail } from '@/lib/eventContext';
import { ScoreCard, useTheme } from '@gfp/ui';
import { teamsApi, scoresApi, eventsApi, testDataApi, challengesApi, type Team, type Scorecard, type LeaderboardEntry, type HoleChallenge } from '@/lib/api';
import { useResponsive } from '@/lib/responsive';
import { resolveGrossScore, needsAceConfirmation, aceGolferIds } from '@/lib/scoring';
import { countingPlayerId, isOwnBallFormat, stablefordPoints, FORMAT_LABELS } from '@gfp/shared-types';
import { TestDataWarningModal } from '@/components/TestDataWarningModal';

export default function ScoringScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const { width, isMobile } = useResponsive();
  // 200px compact cards keep +/− buttons inside the card boundary (44pt × 2 + 60pt score = 148px + 24px padding = 172px ≤ 200px)
  const cardWidth = isMobile ? Math.floor((width - 40) / 2) : 200;

  const { event, setEvent } = useEventDetail();
  const [teams,        setTeams]        = useState<Team[]>([]);
  const [leaderboard,  setLeaderboard]  = useState<LeaderboardEntry[]>([]);
  const [challenges,   setChallenges]   = useState<HoleChallenge[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [scorecard,    setScorecard]    = useState<Scorecard | null>(null);
  const [playerShotsByHole, setPlayerShotsByHole] = useState<Record<number, Record<string, number>>>({});
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState<number | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [togglingTest, setTogglingTest] = useState(false);
  const [showToggleWarning, setShowToggleWarning] = useState(false);
  /** Hole awaiting hole-in-one confirmation before it is marked complete. */
  const [pendingAce, setPendingAce] = useState<number | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const [t, lb, ch] = await Promise.all([
          teamsApi.list(id),
          eventsApi.getLeaderboard(id).catch(() => [] as LeaderboardEntry[]),
          challengesApi.list(id).catch(() => [] as HoleChallenge[]),
        ]);
        setTeams(t);
        setLeaderboard(lb);
        setChallenges(ch);
        if (t.length > 0) setSelectedTeam(t[0].id);
      } catch (e: any) {
        setError(e.message ?? 'Failed to load data.');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [id]);

  const loadScorecard = useCallback(async (teamId: string) => {
    try {
      const sc = await scoresApi.getScorecard(id, teamId);
      setScorecard(sc);
      // Hydrate per-player shots from stored JSON on each hole
      const hydrated: Record<number, Record<string, number>> = {};
      for (const hole of sc.holes) {
        if (hole.playerShotsJson) {
          try { hydrated[hole.holeNumber] = JSON.parse(hole.playerShotsJson); } catch { /* ignore */ }
        }
      }
      setPlayerShotsByHole(hydrated);
    } catch {
      setScorecard(null);
      setPlayerShotsByHole({});
    }
  }, [id]);

  useEffect(() => {
    if (selectedTeam) {
      setPlayerShotsByHole({});
      loadScorecard(selectedTeam);
    }
  }, [selectedTeam, loadScorecard]);

  async function handleScoreChange(holeNumber: number, grossScore: number) {
    if (!selectedTeam) return;
    setSaving(holeNumber);
    setError(null);

    // Check for existing score to determine submit vs update
    const existingHole = scorecard?.holes.find(h => h.holeNumber === holeNumber);
    try {
      if (existingHole?.grossScore != null) {
        // Find score ID by fetching all scores — simplification: just submit again
        await scoresApi.submit(id, { teamId: selectedTeam, holeNumber, grossScore });
      } else {
        await scoresApi.submit(id, { teamId: selectedTeam, holeNumber, grossScore });
      }
      await loadScorecard(selectedTeam);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save score.');
    } finally {
      setSaving(null);
    }
  }

  async function handlePlayerShotChange(holeNumber: number, playerId: string, delta: number) {
    if (!selectedTeam) return;
    const current = playerShotsByHole[holeNumber]?.[playerId] ?? 0;
    const next    = Math.max(0, current + delta);
    const newHoleShots = { ...(playerShotsByHole[holeNumber] ?? {}), [playerId]: next };
    if (next === 0) delete newHoleShots[playerId];
    setPlayerShotsByHole(prev => ({ ...prev, [holeNumber]: newHoleShots }));

    // The golfers' strokes drive the team score (U1), the way the event's
    // format counts them (U8) — see lib/scoring.ts.
    const existingGross = scorecard?.holes.find(h => h.holeNumber === holeNumber)?.grossScore;
    const grossScore    = resolveGrossScore(format, newHoleShots, existingGross);
    if (grossScore == null) return;

    setSaving(holeNumber);
    setError(null);
    try {
      await scoresApi.submit(id, {
        teamId: selectedTeam,
        holeNumber,
        grossScore,
        playerShotsJson: Object.keys(newHoleShots).length > 0
          ? JSON.stringify(newHoleShots)
          : undefined,
      });
      await loadScorecard(selectedTeam);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save player shots.');
    } finally {
      setSaving(null);
    }
  }

  // U1: the desk transcribes paper cards after the round, so strokes auto-save
  // hole-by-hole and a hole sits half-entered for as long as it takes to type
  // the foursome. "Hole Complete" is the explicit done signal; "Edit Score"
  // reopens it. A hole synced from a golfer's phone arrives already complete.
  // Completing a hole is what publishes it: the leaderboard moves and, at a
  // gross of 1, a hole-in-one alert goes out to every scoreboard AND as a push
  // notification. An ace is a once-a-tournament event and the alert can't be
  // recalled, so the desk confirms before it fires. Miskeys are far more common
  // than aces — that asymmetry is the whole reason for this prompt.
  function handleToggleComplete(holeNumber: number, complete: boolean) {
    if (!selectedTeam) return;
    const gross = scorecard?.holes.find(h => h.holeNumber === holeNumber)?.grossScore;
    if (needsAceConfirmation(complete, format, gross, playerShotsByHole[holeNumber])) {
      setPendingAce(holeNumber);
      return;
    }
    doToggleComplete(holeNumber, complete);
  }

  async function doToggleComplete(holeNumber: number, complete: boolean) {
    if (!selectedTeam) return;
    setPendingAce(null);
    setSaving(holeNumber);
    setError(null);
    try {
      await scoresApi.setHoleComplete(id, selectedTeam, holeNumber, complete);
      await loadScorecard(selectedTeam);
    } catch (e: any) {
      setError(e.message ?? 'Failed to update hole status.');
    } finally {
      setSaving(null);
    }
  }

  async function handleResolveConflict(holeNumber: number, score: number) {
    const allScores = await scoresApi.getAll(id);
    const conflicted = allScores.find(
      s => s.teamId === selectedTeam && s.holeNumber === holeNumber && s.isConflicted
    );
    if (!conflicted) return;
    try {
      await scoresApi.resolveConflict(id, conflicted.id, score);
      if (selectedTeam) await loadScorecard(selectedTeam);
    } catch (e: any) {
      setError(e.message ?? 'Failed to resolve conflict.');
    }
  }

  function handleTestModeToggle(value: boolean) {
    if (!value && (event?.testDataSummary?.totalCount ?? 0) > 0) {
      // Turning off while data exists — warn first. The modal only ever asks
      // about disabling (see its copy), so the confirm hardcodes false rather
      // than parking the requested value the way pendingAce does below.
      setShowToggleWarning(true);
    } else {
      doToggleTestMode(value);
    }
  }

  async function doToggleTestMode(enabled: boolean) {
    setShowToggleWarning(false);
    setTogglingTest(true);
    try {
      const updated = await testDataApi.setTestMode(id, enabled);
      setEvent(updated);
    } catch (e: any) {
      setError(e.message ?? 'Failed to toggle test mode.');
    } finally {
      setTogglingTest(false);
    }
  }

  const selectedTeamPlayers = teams.find(t => t.id === selectedTeam)?.players ?? [];
  const format    = event?.format ?? 'Scramble';
  // U8: outside a scramble each golfer plays their own ball, so the team's
  // number is derived from the golfers (lowest, or the aggregate) and can't be
  // typed on the card directly — a typed total says nothing about whose
  // strokes it holds, and Stroke/Stableford score per golfer.
  const ownBall   = isOwnBallFormat(format);
  const typedGrossLocked = ownBall && selectedTeamPlayers.length > 0;

  // Who the ace confirmation is about: the golfers at 1, or the team.
  const aceNames = pendingAce === null ? [] : aceGolferIds(format, playerShotsByHole[pendingAce])
    .map(pid => selectedTeamPlayers.find(p => p.id === pid))
    .filter(p => p != null)
    .map(p => `${p.firstName} ${p.lastName}`.trim());
  const holes = event?.course?.holes ?? [];
  const holesCount = event?.holes ?? 18;
  const holeNumbers = holes.length > 0
    ? holes.map(h => h.holeNumber)
    : Array.from({ length: holesCount }, (_, i) => i + 1);

  const totalTeams    = teams.length;
  const completedTeams = leaderboard.filter(e => e.isComplete).length;
  const allComplete   = totalTeams > 0 && completedTeams === totalTeams;
  const showSyncBar   = totalTeams > 0 && (event?.status === 'Scoring' || event?.status === 'Active');

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;
  }

  return (
    <View style={styles.page}>

      {/* Test mode toggle — Registration phase only */}
      {event?.status === 'Registration' && (
        <View style={[styles.testModeBar, { backgroundColor: '#fff8e1', borderBottomColor: '#f39c12' }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.testModeLabel}>Testing Mode</Text>
            <Text style={styles.testModeDesc}>
              {event.isTestMode
                ? `Active — ${event.testDataSummary?.totalCount ?? 0} test records. Seed from Overview tab.`
                : 'Enable to add test data and preview scoring flow.'}
            </Text>
          </View>
          {togglingTest
            ? <ActivityIndicator size="small" color="#f39c12" />
            : (
              <Switch
                value={event.isTestMode}
                onValueChange={handleTestModeToggle}
                trackColor={{ false: '#ccc', true: '#f39c12' }}
                thumbColor="#fff"
              />
            )}
        </View>
      )}

      <TestDataWarningModal
        visible={showToggleWarning}
        title="Disable Testing Mode?"
        description={`This event has ${event?.testDataSummary?.totalCount ?? 0} test record(s). Turning off test mode hides the warning bar but does not remove test data. Clear test data separately from the Fundraising tab.`}
        confirmLabel="Disable Test Mode"
        loading={togglingTest}
        onConfirm={() => doToggleTestMode(false)}
        onCancel={() => setShowToggleWarning(false)}
      />

      <TestDataWarningModal
        visible={pendingAce !== null}
        title="Confirm Hole-in-One"
        description={
          `Hole ${pendingAce} is recorded as 1 stroke for ${
            aceNames.length > 0
              ? aceNames.join(' & ')
              : teams.find(t => t.id === selectedTeam)?.name ?? 'this team'
          }. Completing it announces a hole-in-one on every live scoreboard and sends a push notification to subscribers. This cannot be undone.\n\n` +
          'If the hole is still half-entered, cancel and finish entering the rest of the team’s strokes first.'
        }
        confirmLabel="Yes, it's an ace"
        loading={saving === pendingAce}
        onConfirm={() => { if (pendingAce !== null) doToggleComplete(pendingAce, true); }}
        onCancel={() => setPendingAce(null)}
      />

      {/* Pending sync counter */}
      {showSyncBar && (
        <View style={[
          styles.syncBar,
          { backgroundColor: allComplete ? '#f0fdf4' : '#fff8e1',
            borderBottomColor: allComplete ? '#27ae60' : '#f39c12' },
        ]}>
          <Text style={[styles.syncText, { color: allComplete ? '#1e8449' : '#856404' }]}>
            {allComplete
              ? `✓ All ${totalTeams} teams have complete scorecards`
              : `⏳ ${completedTeams} of ${totalTeams} teams have all holes scored · ${totalTeams - completedTeams} pending`}
          </Text>
          {!allComplete && event?.status === 'Scoring' && (
            <Text style={[styles.syncHint, { color: '#856404' }]}>
              Collect QR codes or enter scores for remaining teams before publishing final results.
            </Text>
          )}
        </View>
      )}

      {/* Team selector */}
      <View style={styles.teamBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamScroll}>
          {teams.map(team => {
            const isSelected = team.id === selectedTeam;
            return (
              <Pressable
                key={team.id}
                style={[
                  styles.teamChip,
                  { borderColor: isSelected ? theme.colors.primary : '#ccc' },
                  isSelected && { backgroundColor: theme.colors.primary },
                ]}
                onPress={() => setSelectedTeam(team.id)}
              >
                <Text style={[styles.teamChipText, { color: isSelected ? '#fff' : theme.colors.primary }]}>
                  {team.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Scorecard summary */}
      {scorecard && (
        <View style={[styles.summaryBar, { backgroundColor: theme.colors.highlight }]}>
          <Text style={[styles.summaryText, { color: theme.colors.primary }]}>
            {scorecard.teamName} · {FORMAT_LABELS[format] ?? format} · {format === 'Stableford' ? `Points: ${scorecard.stablefordPoints} · ` : ''}Gross: {scorecard.grossTotal} · To Par: {scorecard.toPar >= 0 ? `+${scorecard.toPar}` : scorecard.toPar} · {scorecard.holesComplete}/{holesCount} holes
          </Text>
          {scorecard.hasConflicts && (
            <Text style={styles.conflictWarning}>⚠ Has conflicts</Text>
          )}
        </View>
      )}

      {/* Score cards grid */}
      {selectedTeam ? (
        <ScrollView contentContainerStyle={styles.grid}>
          {holeNumbers.map(holeNum => {
            const courseHole = holes.find(h => h.holeNumber === holeNum);
            const par = courseHole?.par ?? 4;
            const scoredHole = scorecard?.holes.find(h => h.holeNumber === holeNum);
            const score = scoredHole?.grossScore ?? null;
            const isConflicted = scoredHole?.hasConflict ?? false;
            const proposedScore = scoredHole?.proposedScore ?? null;
            const isSaving = saving === holeNum;
            const holeChallenge = challenges.find(c => c.holeNumber === holeNum) ?? null;
            const isComplete = scoredHole?.completedAt != null;

            return (
              <View key={holeNum} style={[styles.cardWrapper, { width: cardWidth }]}>
                {isSaving && (
                  <View style={styles.savingOverlay}>
                    <ActivityIndicator color={theme.colors.primary} />
                  </View>
                )}
                <ScoreCard
                  holeNumber={holeNum}
                  par={par}
                  score={score}
                  onScoreChange={newScore => handleScoreChange(holeNum, newScore)}
                  isConflicted={isConflicted}
                  disabled={isSaving || isComplete || typedGrossLocked}
                  compact
                  challenge={holeChallenge}
                />
                {isConflicted && score != null && (
                  proposedScore != null ? (
                    <View style={styles.resolveRow}>
                      <Text style={styles.resolvePrompt}>
                        Golfer proposes {proposedScore} (recorded {score})
                      </Text>
                      <View style={styles.resolveBtnRow}>
                        <Pressable
                          style={[styles.resolveBtn, styles.resolveBtnHalf, { backgroundColor: '#27ae60' }]}
                          onPress={() => handleResolveConflict(holeNum, proposedScore)}
                        >
                          <Text style={styles.resolveBtnText}>Approve {proposedScore}</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.resolveBtn, styles.resolveBtnHalf, { backgroundColor: '#7f8c8d' }]}
                          onPress={() => handleResolveConflict(holeNum, score)}
                        >
                          <Text style={styles.resolveBtnText}>Keep {score}</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      style={[styles.resolveBtn, { backgroundColor: '#e67e22' }]}
                      onPress={() => handleResolveConflict(holeNum, score)}
                    >
                      <Text style={styles.resolveBtnText}>Accept {score}</Text>
                    </Pressable>
                  )
                )}
                {/* Per-player shot entry */}
                {selectedTeamPlayers.length > 0 && (
                  <View style={[styles.playerShotsBox, { backgroundColor: theme.colors.surface }]}>
                    <Text style={[styles.playerShotsCaption, { color: theme.mutedText }]}>
                      {ownBall ? 'Strokes (own ball)' : 'Shots used by the team'}
                    </Text>
                    {selectedTeamPlayers.map(player => {
                      const shots = playerShotsByHole[holeNum]?.[player.id] ?? 0;
                      // Best Ball: mark whose ball counts. Stableford: each
                      // golfer's own points (they're summed for the team).
                      const counts = countingPlayerId(format, playerShotsByHole[holeNum]) === player.id;
                      const note = format === 'Stableford' && shots > 0
                        ? `${stablefordPoints(par, shots)}p`
                        : counts ? '★' : '';
                      return (
                        <View key={player.id} style={styles.playerShotRow}>
                          <Text style={[styles.playerShotName, { color: theme.colors.primary }]} numberOfLines={1}>
                            {player.firstName}
                          </Text>
                          <Text
                            style={[styles.playerShotNote, { color: theme.mutedText }]}
                            accessibilityLabel={counts ? 'counting score' : note ? `${stablefordPoints(par, shots)} Stableford points` : undefined}
                          >
                            {note}
                          </Text>
                          <Pressable
                            onPress={() => handlePlayerShotChange(holeNum, player.id, -1)}
                            disabled={shots <= 0 || isSaving || isComplete}
                            style={[styles.shotBtn, { backgroundColor: theme.colors.primary, opacity: shots <= 0 || isComplete ? 0.3 : 1 }]}
                          >
                            <Text style={styles.shotBtnText}>−</Text>
                          </Pressable>
                          <Text style={[styles.shotCount, { color: theme.colors.primary }]}>
                            {shots > 0 ? shots : '—'}
                          </Text>
                          <Pressable
                            onPress={() => handlePlayerShotChange(holeNum, player.id, 1)}
                            disabled={isSaving || isComplete}
                            style={[styles.shotBtn, { backgroundColor: theme.colors.primary, opacity: isComplete ? 0.3 : 1 }]}
                          >
                            <Text style={styles.shotBtnText}>+</Text>
                          </Pressable>
                        </View>
                      );
                    })}

                    {/* Done signal for the hole — sits under the names (U1). */}
                    <Pressable
                      onPress={() => handleToggleComplete(holeNum, !isComplete)}
                      disabled={isSaving || score == null}
                      style={[
                        styles.completeBtn,
                        isComplete
                          ? { backgroundColor: 'transparent', borderColor: theme.colors.primary }
                          : { backgroundColor: '#27ae60', borderColor: '#27ae60' },
                        score == null && { opacity: 0.35 },
                      ]}
                    >
                      <Text style={[
                        styles.completeBtnText,
                        { color: isComplete ? theme.colors.primary : '#fff' },
                      ]}>
                        {isComplete ? '✎ Edit Score' : '✓ Hole Complete'}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.mutedText }]}>Select a team to enter scores.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page:    { flex: 1 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  syncBar:  { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  syncText: { fontSize: 13, fontWeight: '700' },
  syncHint: { fontSize: 12, marginTop: 2 },

  testModeBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1,
  },
  testModeLabel: { fontSize: 13, fontWeight: '700', color: '#856404' },
  testModeDesc:  { fontSize: 12, color: '#856404', marginTop: 1 },
  teamBar: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e0e0e0' },
  teamScroll: { gap: 8 },
  teamChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  teamChipText: { fontSize: 13, fontWeight: '600' },
  errorBox: {
    backgroundColor: '#fdf2f2', margin: 16, borderRadius: 8, padding: 12,
    borderLeftWidth: 3, borderLeftColor: '#e74c3c',
  },
  errorText: { color: '#c0392b', fontSize: 14 },
  summaryBar: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryText: { fontSize: 14, fontWeight: '600' },
  conflictWarning: { fontSize: 13, fontWeight: '700', color: '#e67e22' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 8,
  },
  cardWrapper: {
    position: 'relative',
  },
  savingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    borderRadius: 12,
  },
  resolveBtn: {
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 4,
  },
  resolveBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  resolveRow:     { marginTop: 4 },
  resolvePrompt:  { fontSize: 11, fontWeight: '600', color: '#c0392b', textAlign: 'center', marginBottom: 4 },
  resolveBtnRow:  { flexDirection: 'row', gap: 6 },
  resolveBtnHalf: { flex: 1, marginTop: 0 },
  emptyText: { fontSize: 15 },

  playerShotsBox: {
    borderRadius: 8, marginTop: 4,
    paddingVertical: 6, paddingHorizontal: 8,
  },
  playerShotRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 3, gap: 6,
  },
  playerShotName: { flex: 1, fontSize: 12, fontWeight: '600' },
  playerShotNote: { fontSize: 11, fontWeight: '700', minWidth: 18, textAlign: 'right' },
  playerShotsCaption: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  completeBtn: {
    marginTop: 6, paddingVertical: 7, borderRadius: 6, borderWidth: 1.5,
    alignItems: 'center',
  },
  completeBtnText: { fontSize: 12, fontWeight: '700' },
  shotBtn: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  shotBtnText: { fontSize: 16, fontWeight: '400', color: '#fff', lineHeight: 20 },
  shotCount:   { fontSize: 14, fontWeight: '700', minWidth: 22, textAlign: 'center' },
});
