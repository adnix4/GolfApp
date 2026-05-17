import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
  ScrollView, Image, Platform, SafeAreaView,
  Modal, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@gfp/ui';
import type { ThemeContextValue } from '@gfp/ui';
import { useSession, getHoleOrder } from '@/lib/session';
import { fetchPublicChallenges, type ChallengeCacheDto, type PlayerShotBreakdown } from '@/lib/api';

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

function ScoreChip({ grossScore, par }: { grossScore: number | null; par: number }) {
  const theme = useTheme();
  const rel   = grossScore !== null ? grossScore - par : null;
  const relLabel =
    rel === null ? '—' : rel === 0 ? 'E' : rel > 0 ? `+${rel}` : `${rel}`;
  const relColor =
    rel === null ? theme.colors.accent :
    rel < 0      ? '#27ae60' :
    rel > 0      ? '#e74c3c' : theme.colors.accent;

  return (
    <View style={[scoreChipStyles.chip, { backgroundColor: theme.colors.primary + '12', borderColor: theme.colors.primary + '40' }]}>
      <Text style={[scoreChipStyles.label, { color: theme.colors.accent }]}>Score</Text>
      <Text style={[scoreChipStyles.value, { color: theme.colors.primary }]}>
        {grossScore !== null ? grossScore : '—'}
      </Text>
      <Text style={[scoreChipStyles.rel, { color: relColor }]}>{relLabel}</Text>
    </View>
  );
}

const infoChipStyles = StyleSheet.create({
  chip:  { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 16, fontWeight: '700', marginTop: 2 },
});

const scoreChipStyles = StyleSheet.create({
  chip:  { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 22, fontWeight: '800', marginTop: 2, lineHeight: 26 },
  rel:   { fontSize: 13, fontWeight: '700', marginTop: 1 },
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

// ── HOLE-IN-ONE CELEBRATION MODAL ────────────────────────────────────────────

function HoleInOneModal({ visible, holeName, onDismiss }: {
  visible:  boolean;
  holeName: string;
  onDismiss: () => void;
}) {
  const scale   = useRef(new Animated.Value(0.3)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 18 }),
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.3);
      opacity.setValue(0);
    }
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onDismiss}>
      <Pressable style={hioStyles.backdrop} onPress={onDismiss} accessibilityLabel="Dismiss" accessibilityRole="button">
        <Animated.View style={[hioStyles.card, { opacity, transform: [{ scale }] }]}>
          <Text style={hioStyles.emoji}>⛳</Text>
          <Text style={hioStyles.headline}>HOLE IN ONE!</Text>
          <Text style={hioStyles.sub}>{holeName}</Text>
          <Text style={hioStyles.hint}>Tap anywhere to dismiss</Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const hioStyles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center',
  },
  card: {
    backgroundColor: '#1a1a2e', borderRadius: 24, padding: 40,
    alignItems: 'center', marginHorizontal: 32,
    borderWidth: 3, borderColor: '#f1c40f',
    shadowColor: '#f1c40f', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 20, elevation: 20,
  },
  emoji:    { fontSize: 64, marginBottom: 12 },
  headline: { fontSize: 34, fontWeight: '900', color: '#f1c40f', letterSpacing: 2, textAlign: 'center' },
  sub:      { fontSize: 18, fontWeight: '600', color: '#fff', marginTop: 8, textAlign: 'center' },
  hint:     { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 20 },
});

// ── SHOT COUNTER COLUMN ───────────────────────────────────────────────────────

function ShotColumn({
  label, value, onDecrement, onIncrement, disabled, theme,
}: {
  label:       string;
  value:       number;
  onDecrement: () => void;
  onIncrement: () => void;
  disabled:    boolean;
  theme:       ThemeContextValue;
}) {
  return (
    <View style={shotColStyles.col}>
      <Text style={[shotColStyles.label, { color: theme.colors.accent }]}>{label}</Text>
      <Pressable
        onPress={onIncrement}
        disabled={disabled}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={({ pressed }) => [
          shotColStyles.btn,
          { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
          disabled && shotColStyles.btnDisabled,
        ]}
        accessibilityLabel={`Increase ${label}`}
        accessibilityRole="button"
      >
        <Text style={shotColStyles.btnText}>+</Text>
      </Pressable>
      <Text style={[shotColStyles.value, { color: theme.colors.primary }]}>
        {value > 0 ? value : '—'}
      </Text>
      <Pressable
        onPress={onDecrement}
        disabled={disabled || value <= 0}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={({ pressed }) => [
          shotColStyles.btn,
          { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
          (disabled || value <= 0) && shotColStyles.btnDisabled,
        ]}
        accessibilityLabel={`Decrease ${label}`}
        accessibilityRole="button"
      >
        <Text style={shotColStyles.btnText}>−</Text>
      </Pressable>
    </View>
  );
}

const shotColStyles = StyleSheet.create({
  col:        { alignItems: 'center', flex: 1, gap: 6 },
  label:      { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  btn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.3 },
  btnText:    { fontSize: 24, fontWeight: '300', color: '#fff', lineHeight: 28 },
  value:      { fontSize: 28, fontWeight: '800', lineHeight: 32, minWidth: 36, textAlign: 'center' },
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

  const [holeIndex,  setHoleIndex]  = useState(0);
  const [showHio,    setShowHio]    = useState(false);
  const [completing, setCompleting] = useState(false);
  const [challenges, setChallenges] = useState<ChallengeCacheDto[]>([]);

  const holeOrder = useMemo(
    () => session ? getHoleOrder(session.team.startingHole, session.event.holes) : [],
    [session],
  );

  useEffect(() => {
    if (!loading && !session) router.replace('/join');
  }, [loading, session]);

  useEffect(() => {
    if (!session) return;
    fetchPublicChallenges(session.event.eventCode).then(setChallenges);
  }, [session?.event.eventCode]);

  const handleSync = useCallback(() => { syncScores(); }, [syncScores]);

  if (loading || !session) {
    return (
      <View style={[styles.center, { backgroundColor: theme.pageBackground }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const currentHoleNumber    = holeOrder[holeIndex] ?? 1;
  const hole                 = session.course?.holes.find(h => h.holeNumber === currentHoleNumber) ?? null;
  const par                  = hole?.par ?? 4;
  const currentScore         = pendingScores.find(s => s.holeNumber === currentHoleNumber) ?? null;
  const isLastHole           = holeIndex === holeOrder.length - 1;
  const holeChallenge        = challenges.find(c => c.holeNumber === currentHoleNumber) ?? null;
  const isCurrentHoleDone    = completedHoles.has(currentHoleNumber);

  // Team gross = sum of every player's (drive + approach + putt)
  const playerBreakdown = currentScore?.playerShots ?? {};
  const grossScore      = Object.values(playerBreakdown).reduce(
    (sum, b) => sum + b.drive + b.approach + b.putt, 0,
  );
  const displayScore = grossScore > 0 ? grossScore : null;
  const hasShots     = grossScore > 0;

  const scoringEnabled =
    session.event.status === 'Scoring' || session.event.status === 'Draft';

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
    borderWidth: 1, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, paddingHorizontal: 16, marginBottom: 12,
  },
  sponsorLogo: { width: 120, height: 36 },
  sponsorName: { fontSize: 13, fontWeight: '600' },

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
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
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
});
