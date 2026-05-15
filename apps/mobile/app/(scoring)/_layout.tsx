import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, SafeAreaView } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@gfp/ui';
import { useSession } from '@/lib/session';
import { fetchEventStatus } from '@/lib/api';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const POLL_MS = 5000;

export default function ScoringLayout() {
  const theme  = useTheme();
  const router = useRouter();
  const { session, networkTier, updateEventStatus, clearSession } = useSession();

  const [liveStatus, setLiveStatus] = useState(session?.event.status ?? '');
  const [checking,   setChecking]   = useState(false);
  const [dismissed,  setDismissed]  = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isTestMode  = liveStatus === 'Draft';
  const scoringOpen = liveStatus === 'Scoring' || isTestMode;
  const isEnded     = liveStatus === 'Completed' || liveStatus === 'Cancelled';

  // Show tabs when scoring is live, in test mode, or the player dismissed the warning.
  const showTabs = scoringOpen || dismissed;

  // Sync status change back to session so preflight and other screens stay accurate.
  useEffect(() => {
    if (liveStatus && session && liveStatus !== session.event.status) {
      updateEventStatus(liveStatus);
    }
  }, [liveStatus]);

  // Poll for status change regardless of dismissed state — so opening scoring
  // removes the pre-scoring banner automatically without any player action.
  useEffect(() => {
    if (!session || scoringOpen) return;

    async function poll() {
      if (!session) return;
      try {
        const status = await fetchEventStatus(session.event.eventCode);
        setLiveStatus(status);
      } catch { /* silent — will retry next interval */ }
    }

    poll();
    pollRef.current = setInterval(poll, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [session?.event.eventCode, scoringOpen]);

  async function handleManualCheck() {
    if (!session || checking) return;
    setChecking(true);
    try {
      const status = await fetchEventStatus(session.event.eventCode);
      setLiveStatus(status);
    } catch { /* ignore */ } finally {
      setChecking(false);
    }
  }

  async function handleLeave() {
    await clearSession();
    router.replace('/join');
  }

  // ── Waiting screen (shown until dismissed or scoring opens) ──────────────────

  if (!showTabs) {
    const statusLabel =
      liveStatus === 'Registration' ? 'Registration Open'   :
      liveStatus === 'Active'       ? 'Event Starting Soon' :
      liveStatus === 'Completed'    ? 'Event Ended'         :
      liveStatus === 'Cancelled'    ? 'Event Cancelled'     :
      'Waiting…';

    return (
      <SafeAreaView style={[styles.waitPage, { backgroundColor: theme.pageBackground }]}>
        <View style={[styles.waitHeader, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.waitHeaderTitle} numberOfLines={1}>
            {session?.event.name ?? 'Tournament'}
          </Text>
        </View>

        <View style={styles.waitBody}>
          <View style={[styles.waitCard, { backgroundColor: theme.colors.surface }]}>
            {isEnded ? (
              <Text style={styles.waitIconEnded}>🏁</Text>
            ) : (
              <ActivityIndicator
                size="large"
                color={theme.colors.primary}
                style={styles.waitSpinner}
              />
            )}

            <Text style={[styles.waitTitle, { color: theme.colors.primary }]}>
              {isEnded ? statusLabel : 'Scoring Not Open Yet'}
            </Text>

            <Text style={[styles.waitSub, { color: theme.colors.accent }]}>
              {isEnded
                ? 'Scoring for this event is no longer available.'
                : 'The organizer hasn\'t opened scoring yet. You can browse the event now and the scorecard will unlock automatically when the round begins.'}
            </Text>

            <View style={[styles.statusPill, { backgroundColor: theme.colors.primary + '18' }]}>
              <Text style={[styles.statusPillText, { color: theme.colors.primary }]}>
                {statusLabel}
              </Text>
            </View>

            {!isEnded && (
              <Pressable
                style={({ pressed }) => [
                  styles.continueBtn,
                  { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
                ]}
                onPress={() => setDismissed(true)}
                accessibilityRole="button"
              >
                <Text style={styles.continueBtnText}>Continue to Event →</Text>
              </Pressable>
            )}

            {!isEnded && (
              <Pressable
                style={({ pressed }) => [
                  styles.checkBtn,
                  { borderColor: theme.colors.primary, opacity: pressed ? 0.65 : 1 },
                  checking && { opacity: 0.5 },
                ]}
                onPress={handleManualCheck}
                disabled={checking}
                accessibilityRole="button"
              >
                {checking
                  ? <ActivityIndicator size="small" color={theme.colors.primary} />
                  : <Text style={[styles.checkBtnText, { color: theme.colors.primary }]}>Check Again</Text>}
              </Pressable>
            )}

            <Pressable
              style={styles.leaveBtn}
              onPress={handleLeave}
              accessibilityRole="button"
            >
              <Text style={[styles.leaveBtnText, { color: theme.colors.accent }]}>
                Leave Event
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Tabs (scoring open, test mode, or player dismissed the warning) ───────────

  const preScoringBrowse = dismissed && !scoringOpen && !isTestMode;

  return (
    <View style={styles.root}>
      {isTestMode && (
        <View style={styles.testBanner}>
          <Text style={styles.bannerText}>Test Mode — scores will not appear on the live leaderboard</Text>
        </View>
      )}
      {preScoringBrowse && (
        <View style={styles.preScoringBanner}>
          <Text style={styles.bannerText}>Scoring not open yet — browsing only, scorecard is read-only</Text>
        </View>
      )}
      {networkTier === 'offline' && (
        <View style={styles.offlineBanner}>
          <Text style={styles.bannerText}>No connection — scores saved locally</Text>
        </View>
      )}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor:   theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.accent,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopColor:  '#e0e0e0',
            borderTopWidth:  1,
          },
          tabBarLabelStyle:    { fontSize: 11, fontWeight: '600' },
          tabBarIconStyle:     { marginBottom: -2 },
          tabBarIcon: ({ color, focused }) => {
            // Overridden per-screen below; this fallback should never render.
            return <Ionicons name="ellipse-outline" size={22} color={color} />;
          },
        }}
      >
        <Tabs.Screen
          name="scorecard"
          options={{
            title: 'Scorecard',
            tabBarLabel: 'Scorecard',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'golf' : 'golf-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="leaderboard"
          options={{
            title: 'Standings',
            tabBarLabel: 'Standings',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'trophy' : 'trophy-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="team"
          options={{
            title: 'Team',
            tabBarLabel: 'Team',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="auction"
          options={{
            title: 'Auction',
            tabBarLabel: 'Auction',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'pricetag' : 'pricetag-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="league"
          options={{
            title: 'League',
            tabBarLabel: 'League',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'ribbon' : 'ribbon-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="help"
          options={{
            title: 'Help',
            tabBarLabel: 'Help',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'help-circle' : 'help-circle-outline'} size={22} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Banners (stack at top above tabs)
  bannerText:       { color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  testBanner:       { backgroundColor: '#6a0dad', paddingVertical: 6, alignItems: 'center' },
  preScoringBanner: { backgroundColor: '#b45309', paddingVertical: 6, alignItems: 'center' },
  offlineBanner:    { backgroundColor: '#e74c3c', paddingVertical: 6, alignItems: 'center' },

  // Waiting screen
  waitPage: { flex: 1 },

  waitHeader: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  waitHeaderTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },

  waitBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  waitCard: {
    width: '100%',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },

  waitSpinner:   { marginBottom: 24 },
  waitIconEnded: { fontSize: 48, marginBottom: 16 },

  waitTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  waitSub:   { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 20 },

  statusPill: {
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 24,
  },
  statusPillText: { fontSize: 13, fontWeight: '700' },

  continueBtn: {
    paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: 12, alignItems: 'center',
    width: '100%', marginBottom: 12,
  },
  continueBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  checkBtn: {
    borderWidth: 1.5, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 28,
    alignItems: 'center', width: '100%', marginBottom: 12,
  },
  checkBtnText: { fontSize: 15, fontWeight: '600' },

  leaveBtn:     { paddingVertical: 8 },
  leaveBtnText: { fontSize: 14, fontWeight: '500' },
});
