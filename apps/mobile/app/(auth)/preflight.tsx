import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
  ScrollView, Platform, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Battery from 'expo-battery';
import { useTheme } from '@gfp/ui';
import { useSession } from '@/lib/session';
import { checkConnectivity } from '@/lib/api';

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
                 state.status === 'warn' ? '#b7770d' : theme.colors.accent,
        }]}>
          {state.detail}
        </Text>
      </View>
    </View>
  );
}

const itemStyles = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  iconBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  icon:    { fontSize: 18, fontWeight: '700' },
  text:    { flex: 1, justifyContent: 'center' },
  label:   { fontSize: 15, fontWeight: '700' },
  detail:  { fontSize: 13, marginTop: 2 },
});

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────

export default function PreflightScreen() {
  const theme  = useTheme();
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

  const rosterCheck: CheckState = !session || session.team.players.length === 0
    ? { status: 'fail', detail: 'No players found on your team' }
    : { status: 'ok', detail: `${session.team.players.length} player${session.team.players.length !== 1 ? 's' : ''} on ${session.team.name}` };

  const startCheck: CheckState = !session
    ? { status: 'fail', detail: 'No session' }
    : session.team.startingHole != null
      ? { status: 'ok', detail: `Shotgun start — Hole ${session.team.startingHole}` }
      : session.team.teeTime != null
        ? { status: 'ok', detail: `Tee time — ${new Date(session.team.teeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` }
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
  }, []);

  // ── Navigation guard ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!loading && !session) router.replace('/join');
  }, [loading, session]);

  if (loading || !session) {
    return (
      <View style={[styles.center, { backgroundColor: theme.pageBackground }]}>
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
    <SafeAreaView style={[styles.page, { backgroundColor: theme.pageBackground }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
        <Text style={[styles.headerTitle, { color: theme.colors.highlight }]}>Pre-Flight Check</Text>
        <Text style={[styles.headerSub,   { color: theme.colors.highlight }]} numberOfLines={1}>
          {session.event.name}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.intro, { color: theme.colors.accent }]}>
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
            <Text style={[styles.offlineBtnText, { color: theme.colors.accent }]}>
              Start in Offline Mode
            </Text>
            <Text style={[styles.offlineNote, { color: theme.colors.accent }]}>
              Scores save locally and sync when connection is restored
            </Text>
          </Pressable>
        )}

        {offlineMode && (
          <View style={[styles.offlineBadge, { backgroundColor: '#fffbf0', borderColor: '#f39c12' }]}>
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
          <Text style={[styles.blocked, { color: theme.colors.accent }]}>
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
  page:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    paddingTop:        Platform.OS === 'android' ? 12 : 0,
    paddingBottom:     14,
    paddingHorizontal: 20,
    alignItems:        'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  headerSub:   { fontSize: 13, fontWeight: '500', marginTop: 4, opacity: 0.85 },

  scroll: { padding: 20, paddingBottom: 40 },
  intro:  { fontSize: 14, lineHeight: 20, marginBottom: 20 },

  card: {
    borderRadius: 14, padding: 20, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },

  offlineBtn: {
    borderWidth: 1.5, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 20,
    alignItems: 'center', marginBottom: 12,
  },
  offlineBtnText: { fontSize: 15, fontWeight: '700' },
  offlineNote:    { fontSize: 12, marginTop: 4 },

  offlineBadge: {
    borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12,
  },
  offlineBadgeText: { fontSize: 13, color: '#b7770d', textAlign: 'center' },

  retryRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  retryBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#f0f0f0' },
  retryText: { fontSize: 13, fontWeight: '600' },

  startBtn: {
    paddingVertical: 18, borderRadius: 14, alignItems: 'center', marginBottom: 12,
  },
  startBtnText: { fontSize: 17, fontWeight: '800', color: '#fff' },
  blocked:      { fontSize: 13, textAlign: 'center' },
});
