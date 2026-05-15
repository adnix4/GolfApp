import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
  ScrollView, Image, Platform, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ScoreCard, useTheme } from '@gfp/ui';
import type { ThemeContextValue } from '@gfp/ui';
import { useSession, getHoleOrder } from '@/lib/session';

// ── INLINE SUB-COMPONENTS ─────────────────────────────────────────────────────

function HoleInfoChip({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[infoChipStyles.chip, { backgroundColor: theme.colors.surface }]}>
      <Text style={[infoChipStyles.label, { color: theme.colors.accent }]}>{label}</Text>
      <Text style={[infoChipStyles.value, { color: theme.colors.primary }]}>{value}</Text>
    </View>
  );
}

const infoChipStyles = StyleSheet.create({
  chip:  { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 16, fontWeight: '700', marginTop: 2 },
});

function SyncStatusBar({
  status, pendingCount, onSync, theme,
}: {
  status: 'idle' | 'syncing' | 'error' | 'synced';
  pendingCount: number;
  onSync: () => void;
  theme: ThemeContextValue;
}) {
  if (pendingCount === 0) return null;

  const label =
    status === 'syncing' ? 'Syncing…' :
    status === 'synced'  ? `${pendingCount} hole(s) synced` :
    status === 'error'   ? 'Sync failed — tap to retry' :
                           `${pendingCount} hole(s) saved locally`;

  const barColor =
    status === 'error'  ? '#fdf2f2' :
    status === 'synced' ? '#f0faf4' : '#fffbf0';

  const textColor =
    status === 'error'  ? '#c0392b' :
    status === 'synced' ? '#27ae60' : '#7d6608';

  return (
    <Pressable
      onPress={onSync}
      disabled={status === 'syncing'}
      style={[syncStyles.bar, { backgroundColor: barColor }]}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      {status === 'syncing'
        ? <ActivityIndicator size="small" color={theme.colors.primary} style={syncStyles.spinner} />
        : null}
      <Text style={[syncStyles.text, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

const syncStyles = StyleSheet.create({
  bar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, marginTop: 12 },
  spinner: { marginRight: 8 },
  text:    { fontSize: 13, fontWeight: '600' },
});

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────

export default function ScorecardScreen() {
  const theme                  = useTheme();
  const router                 = useRouter();
  const {
    session, loading,
    pendingScores, syncStatus,
    upsertScore, syncScores,
  } = useSession();

  const [holeIndex,  setHoleIndex]  = useState(0);
  const [shotsOpen,  setShotsOpen]  = useState(false);

  const holeOrder = useMemo(
    () => session
      ? getHoleOrder(session.team.startingHole, session.event.holes)
      : [],
    [session],
  );

  useEffect(() => {
    if (!loading && !session) {
      router.replace('/join');
    }
  }, [loading, session]);

  const handleSync = useCallback(() => { syncScores(); }, [syncScores]);

  if (loading || !session) {
    return (
      <View style={[styles.center, { backgroundColor: theme.pageBackground }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const currentHoleNumber = holeOrder[holeIndex] ?? 1;
  const hole               = session.course?.holes.find(h => h.holeNumber === currentHoleNumber) ?? null;
  const par                = hole?.par ?? 4;
  const currentScore       = pendingScores.find(s => s.holeNumber === currentHoleNumber) ?? null;
  const isLastHole         = holeIndex === holeOrder.length - 1;

  const playerShots: Record<string, number> = currentScore?.playerShots ?? {};

  // Scoring input is only active during a live round (Scoring) or test mode (Draft).
  const scoringEnabled =
    session.event.status === 'Scoring' || session.event.status === 'Draft';

  function handleScoreChange(grossScore: number) {
    if (!scoringEnabled) return;
    upsertScore({
      holeNumber:        currentHoleNumber,
      grossScore,
      putts:             currentScore?.putts ?? null,
      playerShots:       currentScore?.playerShots,
      clientTimestampMs: Date.now(),
    });
  }

  function changePutts(delta: number) {
    if (!scoringEnabled) return;
    const curr = currentScore?.putts ?? 0;
    const next = Math.max(0, Math.min(10, curr + delta));
    upsertScore({
      holeNumber:        currentHoleNumber,
      grossScore:        currentScore?.grossScore ?? par,
      putts:             next,
      playerShots:       currentScore?.playerShots,
      clientTimestampMs: Date.now(),
    });
  }

  function changePlayerShots(playerId: string, delta: number) {
    if (!scoringEnabled) return;
    const curr = playerShots[playerId] ?? 0;
    const next = Math.max(0, curr + delta);
    const updated = { ...playerShots };
    if (next === 0) delete updated[playerId]; else updated[playerId] = next;
    upsertScore({
      holeNumber:        currentHoleNumber,
      grossScore:        currentScore?.grossScore ?? par,
      putts:             currentScore?.putts ?? null,
      playerShots:       Object.keys(updated).length > 0 ? updated : undefined,
      clientTimestampMs: Date.now(),
    });
  }

  function handlePrev() {
    if (holeIndex > 0) setHoleIndex(i => i - 1);
  }

  function handleNext() {
    if (isLastHole) {
      router.replace('/sync');
    } else {
      setHoleIndex(i => i + 1);
    }
  }

  const completedCount = pendingScores.length;
  const grossTotal     = pendingScores.reduce((sum, s) => sum + s.grossScore, 0);

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
            {completedCount} hole(s) · Total {grossTotal}
          </Text>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── HOLE SPONSOR ── */}
        {hole?.sponsorName && (
          <View style={[styles.sponsorBadge, { backgroundColor: theme.colors.accent + '22', borderColor: theme.colors.accent }]}>
            {hole.sponsorLogoUrl ? (
              <Image
                source={{ uri: hole.sponsorLogoUrl }}
                style={styles.sponsorLogo}
                resizeMode="contain"
                accessibilityLabel={`Hole sponsor: ${hole.sponsorName}`}
              />
            ) : (
              <Text style={[styles.sponsorName, { color: theme.colors.primary }]}>
                Sponsored by {hole.sponsorName}
              </Text>
            )}
          </View>
        )}

        {/* ── HOLE INFO CHIPS ── */}
        {hole && (
          <View style={styles.infoRow}>
            <HoleInfoChip label="Par"  value={String(hole.par)} />
            <HoleInfoChip label="HCP"  value={String(hole.handicapIndex)} />
            {hole.yardageWhite != null && <HoleInfoChip label="White" value={`${hole.yardageWhite}y`} />}
            {hole.yardageBlue  != null && <HoleInfoChip label="Blue"  value={`${hole.yardageBlue}y`} />}
            {hole.yardageRed   != null && <HoleInfoChip label="Red"   value={`${hole.yardageRed}y`} />}
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

        {/* ── SCORE CARD ── */}
        <ScoreCard
          holeNumber={currentHoleNumber}
          par={par}
          score={currentScore?.grossScore ?? null}
          onScoreChange={handleScoreChange}
        />

        {/* ── PUTTS ── */}
        <View style={[styles.puttsCard, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.puttsLabel, { color: theme.colors.primary }]}>Putts (optional)</Text>
          <View style={styles.puttsControls}>
            <Pressable
              onPress={() => changePutts(-1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => [
                styles.puttsBtn,
                { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
              ]}
              accessibilityLabel="Decrease putts"
              accessibilityRole="button"
            >
              <Text style={styles.puttsBtnText}>−</Text>
            </Pressable>

            <Text style={[styles.puttsValue, { color: theme.colors.primary }]}>
              {currentScore?.putts ?? '—'}
            </Text>

            <Pressable
              onPress={() => changePutts(1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => [
                styles.puttsBtn,
                { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
              ]}
              accessibilityLabel="Increase putts"
              accessibilityRole="button"
            >
              <Text style={styles.puttsBtnText}>+</Text>
            </Pressable>
          </View>
        </View>

        {/* ── PLAYER SHOTS ── */}
        {session.team.players.length > 0 && (
          <View style={[styles.playerShotsCard, { backgroundColor: theme.colors.surface }]}>
            <Pressable
              onPress={() => setShotsOpen(o => !o)}
              style={styles.playerShotsHeader}
              accessibilityRole="button"
              accessibilityLabel={shotsOpen ? 'Collapse player shots' : 'Expand player shots'}
            >
              <Text style={[styles.playerShotsTitle, { color: theme.colors.primary }]}>
                Player Shots (optional)
              </Text>
              <Text style={[styles.playerShotsChevron, { color: theme.colors.accent }]}>
                {shotsOpen ? '▲' : '▼'}
              </Text>
            </Pressable>

            {shotsOpen && session.team.players.map(player => {
              const shots    = playerShots[player.id] ?? 0;
              const initials = `${player.firstName[0]}${player.lastName[0]}`;
              return (
                <View key={player.id} style={[styles.playerRow, { borderTopColor: '#f0f0f0' }]}>
                  <View style={[styles.playerAvatar, { backgroundColor: theme.colors.highlight }]}>
                    <Text style={[styles.playerInitials, { color: theme.colors.primary }]}>
                      {initials}
                    </Text>
                  </View>
                  <Text style={[styles.playerName, { color: theme.colors.primary }]} numberOfLines={1}>
                    {player.firstName}
                  </Text>
                  <View style={styles.shotControls}>
                    <Pressable
                      onPress={() => changePlayerShots(player.id, -1)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={[styles.shotBtn, { backgroundColor: theme.colors.primary }]}
                      accessibilityLabel={`Decrease shots for ${player.firstName}`}
                    >
                      <Text style={styles.shotBtnText}>−</Text>
                    </Pressable>
                    <Text style={[styles.shotCount, { color: theme.colors.primary }]}>
                      {shots > 0 ? shots : '—'}
                    </Text>
                    <Pressable
                      onPress={() => changePlayerShots(player.id, 1)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={[styles.shotBtn, { backgroundColor: theme.colors.primary }]}
                      accessibilityLabel={`Increase shots for ${player.firstName}`}
                    >
                      <Text style={styles.shotBtnText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── SYNC STATUS ── */}
        <SyncStatusBar
          status={syncStatus}
          pendingCount={pendingScores.length}
          onSync={handleSync}
          theme={theme}
        />
      </ScrollView>

      {/* ── HOLE NAVIGATION ── */}
      <View style={[styles.navBar, { backgroundColor: theme.colors.surface, borderTopColor: '#e0e0e0' }]}>
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

        <Text style={[styles.holeCounter, { color: theme.colors.primary }]}>
          {holeIndex + 1} / {holeOrder.length}
        </Text>

        <Pressable
          onPress={handleNext}
          style={({ pressed }) => [
            styles.navBtn,
            {
              backgroundColor: pressed
                ? theme.colors.accent
                : isLastHole
                  ? theme.colors.action
                  : theme.colors.primary,
            },
          ]}
          accessibilityLabel={isLastHole ? 'Finish round' : 'Next hole'}
          accessibilityRole="button"
        >
          <Text style={styles.navBtnText}>{isLastHole ? 'Finish ✓' : 'Next →'}</Text>
        </Pressable>
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
    borderWidth: 1, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, paddingHorizontal: 16, marginBottom: 12,
  },
  sponsorLogo: { width: 120, height: 36 },
  sponsorName: { fontSize: 13, fontWeight: '600' },

  infoRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    justifyContent: 'center', marginBottom: 8,
  },

  puttsCard: {
    borderRadius: 12, padding: 16, marginTop: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  puttsLabel:    { fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 10 },
  puttsControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  puttsBtn: {
    minWidth: 48, minHeight: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  puttsBtnText: { fontSize: 26, fontWeight: '300', color: '#fff', lineHeight: 30 },
  puttsValue:   { fontSize: 32, fontWeight: '800', minWidth: 48, textAlign: 'center' },

  playerShotsCard: {
    borderRadius: 12, marginTop: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
    overflow: 'hidden',
  },
  playerShotsHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  playerShotsTitle:   { fontSize: 13, fontWeight: '600' },
  playerShotsChevron: { fontSize: 13, fontWeight: '700' },

  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  playerAvatar:   { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  playerInitials: { fontSize: 13, fontWeight: '800' },
  playerName:     { flex: 1, fontSize: 14, fontWeight: '600' },

  shotControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shotBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  shotBtnText: { fontSize: 20, fontWeight: '300', color: '#fff', lineHeight: 24 },
  shotCount:   { fontSize: 22, fontWeight: '800', minWidth: 28, textAlign: 'center' },

  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
  },
  navBtn: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderRadius: 10, minWidth: 100, alignItems: 'center',
  },
  navBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
  holeCounter: { fontSize: 15, fontWeight: '600' },
});
