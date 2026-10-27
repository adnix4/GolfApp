import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
  ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Battery from 'expo-battery';
import { useTheme, useClasses } from '@gfp/ui';
import { useSession } from '@/lib/session';
import { checkConnectivity } from '@/lib/api';
import { formatTime } from '@gfp/shared-types';
import { fontSize, radius, spacing, status } from '@gfp/theme';

// ── TYPES ─────────────────────────────────────────────────────────────────────

type CheckStatus = 'checking' | 'ok' | 'warn' | 'fail';

interface CheckState {
  status:   CheckStatus;
  detail:   string;
}

// ── CHECK ITEM ────────────────────────────────────────────────────────────────

function CheckItem({
  label, state,
}: {
  label: string;
  state: CheckState;
}) {
  const theme = useTheme();
  const icon =
    state.status === 'checking' ? null :
    state.status === 'ok'       ? '✓' :
    state.status === 'warn'     ? '⚠' : '✗';
  const iconColor =
    state.status === 'ok'   ? '#27ae60' :
    state.status === 'warn' ? '#f39c12' : '#e74c3c';

  return (
    <View style={itemStyles.row}>
      <View style={[itemStyles.iconBox, {
        backgroundColor:
          state.status === 'checking' ? '#f5f5f5' :
          state.status === 'ok'       ? '#f0faf4' :
          state.status === 'warn'     ? '#fffbf0' : '#fdf2f2',
      }]}>
        {state.status === 'checking'
          ? <ActivityIndicator size="small" color={theme.colors.accent} />
          : <Text style={[itemStyles.icon, { color: iconColor }]}>{icon}</Text>}
      </View>
      <View style={itemStyles.text}>
        <Text style={[itemStyles.label, { color: theme.colors.primary }]}>{label}</Text>
        <Text style={[itemStyles.detail, {
          color: state.status === 'fail' ? '#c0392b' :
                 state.status === 'warn' ? '#b7770d' : theme.mutedText,
        }]}>
          {state.detail}
        </Text>
      </View>
    </View>
  );
}

const itemStyles = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing[4] },
  iconBox: { width: 40, height: 40, borderRadius: radius.xxl, alignItems: 'center', justifyContent: 'center', marginRight: spacing[4] },
  icon:    { fontSize: fontSize.xl, fontWeight: '700' },
  text:    { flex: 1, justifyContent: 'center' },
  label:   { fontSize: fontSize.lg, fontWeight: '700' },
  detail:  { fontSize: fontSize.sm, marginTop: spacing[0.5] },
});

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────

export default function PreflightScreen() {
  const theme  = useTheme();
  const c      = useClasses();
  const router = useRouter();
  const { session, loading } = useSession();

  const [batteryCheck,      setBatteryCheck]      = useState<CheckState>({ status: 'checking', detail: 'Checking battery…' });
  const [connectivityCheck, setConnectivityCheck] = useState<CheckState>({ status: 'checking', detail: 'Checking connection…' });
  const [offlineMode,       setOfflineMode]       = useState(false);

  // ── Derived checks from session (synchronous) ──────────────────────────────

  const dataCheck: CheckState = !session
    ? { status: 'fail', detail: 'No event data — return to join screen' }
    : !session.course
      ? { status: 'warn', detail: 'No course attached yet — par data unavailable' }
      : { status: 'ok', detail: `${session.event.name} · ${session.course.name}` };

  const rosterCheck: CheckState = !session || !session.team || session.team.players.length === 0
    ? { status: 'fail', detail: 'No players found on your team' }
    : { status: 'ok', detail: `${session.team.players.length} player${session.team.players.length !== 1 ? 's' : ''} on ${session.team.name}` };

  const startCheck: CheckState = !session || !session.team
    ? { status: 'fail', detail: 'No session' }
    : session.team.startingHole != null
      ? { status: 'ok', detail: `Shotgun start — Hole ${session.team.startingHole}` }
      : session.team.teeTime != null
        ? { status: 'ok', detail: `Tee time — ${formatTime(session.team.teeTime)}` }
        : { status: 'warn', detail: 'Start assignment not set yet — check with organizer' };

  // ── Async checks ───────────────────────────────────────────────────────────

  const runBatteryCheck = useCallback(async () => {
    setBatteryCheck({ status: 'checking', detail: 'Checking battery…' });
    try {
      const level = await Battery.getBatteryLevelAsync();
      if (level < 0) {
        setBatteryCheck({ status: 'ok', detail: 'Battery level unavailable on this device' });
      } else {
        const pct = Math.round(level * 100);
        setBatteryCheck(
          pct >= 30
            ? { status: 'ok',   detail: `${pct}% — good to go` }
            : { status: 'warn', detail: `${pct}% — consider charging before the round` },
        );
      }
    } catch {
      setBatteryCheck({ status: 'ok', detail: 'Battery check unavailable' });
    }
  }, []);

  const runConnectivityCheck = useCallback(async () => {
    setConnectivityCheck({ status: 'checking', detail: 'Checking connection…' });
    setOfflineMode(false);
    const ok = await checkConnectivity();
    setConnectivityCheck(
      ok
        ? { status: 'ok',   detail: 'Server reachable — scores will sync in real time' }
        : { status: 'fail', detail: 'Cannot reach server — tap "Start Offline" to continue without sync' },
    );
  }, []);

  useEffect(() => {
    runBatteryCheck();
    runConnectivityCheck();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- both checks are useCallback(..., []) and this is a deliberate one-shot on mount
  }, []);

  // ── Navigation guard ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!loading && !session) router.replace('/join');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- expo-router's router is a module singleton, so its identity never changes
  }, [loading, session]);

  if (loading || !session) {
    return (
      <View style={[c.center, { backgroundColor: theme.pageBackground }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // ── Start conditions ───────────────────────────────────────────────────────

  const requiredOk =
    dataCheck.status !== 'fail' &&
    rosterCheck.status === 'ok' &&
    (connectivityCheck.status === 'ok' || offlineMode);

  return (
    <SafeAreaView style={c.screen}>
      <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
        <Text style={[styles.headerTitle, { color: theme.colors.highlight }]}>Pre-Flight Check</Text>
        <Text style={[styles.headerSub,   { color: theme.colors.highlight }]} numberOfLines={1}>
          {session.event.name}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.intro, { color: theme.mutedText }]}>
          Complete all checks before the round begins. The scorecard unlocks when everything is ready.
        </Text>

        <View style={[styles.card, { backgroundColor: '#fff' }]}>
          <CheckItem label="Event Data"       state={dataCheck}         />
          <CheckItem label="Team Roster"      state={rosterCheck}       />
          <CheckItem label="Start Assignment" state={startCheck}        />
          <CheckItem label="Network"          state={connectivityCheck} />
          <CheckItem label="Battery"          state={batteryCheck}      />
        </View>

        {/* Offline mode option */}
        {connectivityCheck.status === 'fail' && !offlineMode && (
          <Pressable
            onPress={() => setOfflineMode(true)}
            style={({ pressed }) => [styles.offlineBtn, { borderColor: theme.colors.accent, opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
          >
            <Text style={[styles.offlineBtnText, { color: theme.mutedText }]}>
              Start in Offline Mode
            </Text>
            <Text style={[styles.offlineNote, { color: theme.mutedText }]}>
              Scores save locally and sync when connection is restored
            </Text>
          </Pressable>
        )}

        {offlineMode && (
          <View style={[styles.offlineBadge, { backgroundColor: '#fffbf0', borderColor: status.warning }]}>
            <Text style={styles.offlineBadgeText}>Offline mode — scores will sync automatically when connected</Text>
          </View>
        )}

        {/* Retry buttons */}
        <View style={styles.retryRow}>
          {connectivityCheck.status !== 'checking' && (
            <Pressable onPress={runConnectivityCheck} style={styles.retryBtn}>
              <Text style={[styles.retryText, { color: theme.colors.primary }]}>Retry Network</Text>
            </Pressable>
          )}
          {batteryCheck.status !== 'checking' && (
            <Pressable onPress={runBatteryCheck} style={styles.retryBtn}>
              <Text style={[styles.retryText, { color: theme.colors.primary }]}>Retry Battery</Text>
            </Pressable>
          )}
        </View>

        {/* Start button */}
        <Pressable
          onPress={() => router.replace('/scorecard')}
          disabled={!requiredOk}
          style={({ pressed }) => [
            styles.startBtn,
            {
              backgroundColor: requiredOk
                ? (pressed ? theme.colors.accent : theme.colors.action)
                : '#ccc',
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Start round"
        >
          <Text style={styles.startBtnText}>
            {offlineMode ? 'Start Round (Offline)' : 'Start Round'}
          </Text>
        </Pressable>

        {!requiredOk && (
          <Text style={[styles.blocked, { color: theme.mutedText }]}>
            {rosterCheck.status !== 'ok'
              ? 'Roster check must pass before starting.'
              : 'Resolve the issues above to start.'}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  header: {
    paddingTop:        Platform.OS === 'android' ? 12 : 0,
    paddingBottom:     spacing[4],
    paddingHorizontal: spacing[5],
    alignItems:        'center',
  },
  headerTitle: { fontSize: fontSize.xxl, fontWeight: '800' },
  headerSub:   { fontSize: fontSize.sm, fontWeight: '500', marginTop: spacing[1], opacity: 0.85 },

  scroll: { padding: spacing[5], paddingBottom: spacing[10] },
  intro:  { fontSize: fontSize.md, lineHeight: 20, marginBottom: spacing[5] },

  card: {
    borderRadius: radius.xl, padding: spacing[5], marginBottom: spacing[4],
    boxShadow: '0px 1px 8px rgba(0, 0, 0, 0.06)', elevation: 2,
  },

  offlineBtn: {
    borderWidth: 1.5, borderRadius: radius.lg,
    paddingVertical: spacing[4], paddingHorizontal: spacing[5],
    alignItems: 'center', marginBottom: spacing[3],
  },
  offlineBtnText: { fontSize: fontSize.lg, fontWeight: '700' },
  offlineNote:    { fontSize: fontSize.xs, marginTop: spacing[1] },

  offlineBadge: {
    borderWidth: 1, borderRadius: radius.lg, padding: spacing[3], marginBottom: spacing[3],
  },
  offlineBadgeText: { fontSize: fontSize.sm, color: '#b7770d', textAlign: 'center' },

  retryRow: { flexDirection: 'row', gap: spacing[3], marginBottom: spacing[5] },
  retryBtn: { paddingVertical: spacing[2], paddingHorizontal: spacing[4], borderRadius: radius.md, backgroundColor: '#f0f0f0' },
  retryText: { fontSize: fontSize.sm, fontWeight: '600' },

  startBtn: {
    paddingVertical: spacing[5], borderRadius: radius.xl, alignItems: 'center', marginBottom: spacing[3],
  },
  startBtnText: { fontSize: fontSize.xl, fontWeight: '800', color: '#fff' },
  blocked:      { fontSize: fontSize.sm, textAlign: 'center' },
});
