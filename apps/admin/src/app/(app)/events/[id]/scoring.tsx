import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ScoreCard, useTheme } from '@gfp/ui';
import { teamsApi, scoresApi, eventsApi, type Team, type Scorecard, type EventDetail } from '@/lib/api';
import { useResponsive } from '@/lib/responsive';

export default function ScoringScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const { width, isMobile } = useResponsive();
  const cardWidth = isMobile ? Math.floor((width - 40) / 2) : 180;

  const [event,        setEvent]        = useState<EventDetail | null>(null);
  const [teams,        setTeams]        = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [scorecard,    setScorecard]    = useState<Scorecard | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState<number | null>(null); // hole being saved
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const [e, t] = await Promise.all([eventsApi.get(id), teamsApi.list(id)]);
        setEvent(e);
        setTeams(t);
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
    } catch {
      setScorecard(null);
    }
  }, [id]);

  useEffect(() => {
    if (selectedTeam) loadScorecard(selectedTeam);
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

  const holes = event?.course?.holes ?? [];
  const holesCount = event?.holes ?? 18;
  const holeNumbers = holes.length > 0
    ? holes.map(h => h.holeNumber)
    : Array.from({ length: holesCount }, (_, i) => i + 1);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;
  }

  return (
    <View style={styles.page}>
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
            {scorecard.teamName} · Gross: {scorecard.grossTotal} · To Par: {scorecard.toPar >= 0 ? `+${scorecard.toPar}` : scorecard.toPar} · {scorecard.holesComplete}/{holesCount} holes
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
            const isSaving = saving === holeNum;

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
                  disabled={isSaving}
                />
                {isConflicted && score != null && (
                  <Pressable
                    style={[styles.resolveBtn, { backgroundColor: '#e67e22' }]}
                    onPress={() => handleResolveConflict(holeNum, score)}
                  >
                    <Text style={styles.resolveBtnText}>Accept {score}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.colors.accent }]}>Select a team to enter scores.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page:    { flex: 1 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
    ...StyleSheet.absoluteFillObject,
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
  emptyText: { fontSize: 15 },
});
