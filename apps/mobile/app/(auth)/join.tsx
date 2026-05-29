import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, ScrollView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { FORMAT_LABELS } from '@gfp/shared-types';
import { useSession } from '@/lib/session';
import { joinEvent, fetchActiveEvents, type ActiveEventSummary } from '@/lib/api';
import { registerForPushNotifications } from '@/lib/pushNotifications';

type Step = 'pick' | 'join' | 'waiting';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  Registration: { label: 'Registration Open', color: '#2e7d32' },
  Active:       { label: 'Day of Event',       color: '#1565c0' },
  Scoring:      { label: 'In Progress',         color: '#e65100' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function JoinScreen() {
  const theme  = useTheme();
  const router = useRouter();
  const { session, loading, deviceId, setSession } = useSession();
  const { preEventId } = useLocalSearchParams<{ preEventId?: string }>();

  const [step,          setStep]          = useState<Step>('pick');
  const [events,        setEvents]        = useState<ActiveEventSummary[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selected,      setSelected]      = useState<ActiveEventSummary | null>(null);
  const [eventCode,     setEventCode]     = useState('');
  const [email,         setEmail]         = useState('');
  const [error,         setError]         = useState<string | null>(null);
  const [joining,       setJoining]       = useState(false);
  const [showManual,    setShowManual]    = useState(false);

  // Free-agent waiting state — stored so "Check Again" can re-poll with same credentials
  const [waitingEventCode, setWaitingEventCode] = useState('');
  const [waitingEmail,     setWaitingEmail]     = useState('');
  const [waitingName,      setWaitingName]      = useState('');
  const [waitingEventName, setWaitingEventName] = useState('');

  useEffect(() => {
    if (!loading && session) router.replace('/scorecard');
  }, [loading, session]);

  useEffect(() => {
    fetchActiveEvents().then(data => {
      setEvents(data);
      setEventsLoading(false);
      if (preEventId) {
        const found = data.find(e => e.id === preEventId);
        if (found) {
          setSelected(found);
          setEventCode(found.eventCode);
          setError(null);
          setStep('join');
        }
      }
    });
  }, []);

  function selectEvent(evt: ActiveEventSummary) {
    setSelected(evt);
    setEventCode(evt.eventCode);
    setError(null);
    setStep('join');
  }

  function continueWithCode() {
    const code = eventCode.trim().toUpperCase();
    if (!code) { setError('Enter an event code first.'); return; }
    setSelected(null);
    setError(null);
    setStep('join');
  }

  async function handleJoin() {
    const code   = eventCode.trim().toUpperCase();
    const emailT = email.trim().toLowerCase();
    if (!code)   { setError('Event code is required.');    return; }
    if (!emailT) { setError('Email address is required.'); return; }
    setError(null);
    setJoining(true);
    try {
      const data = await joinEvent(code, emailT, deviceId);

      if (data.awaitingAssignment) {
        // Free agent registered but not yet assigned to a team — show waiting screen
        setWaitingEventCode(code);
        setWaitingEmail(emailT);
        setWaitingName(`${data.player.firstName} ${data.player.lastName}`);
        setWaitingEventName(data.event.name);
        setStep('waiting');
        return;
      }

      await setSession(data);
      registerForPushNotifications(data.player.id).catch(() => {});
      router.replace('/preflight');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not join event. Check your code and email.');
    } finally {
      setJoining(false);
    }
  }

  async function handleCheckAgain() {
    setError(null);
    setJoining(true);
    try {
      const data = await joinEvent(waitingEventCode, waitingEmail, deviceId);

      if (data.awaitingAssignment) {
        // Still not assigned — stay on waiting screen, just update the name in case it changed
        setWaitingName(`${data.player.firstName} ${data.player.lastName}`);
        return;
      }

      // Assigned! Enter the normal join flow.
      await setSession(data);
      registerForPushNotifications(data.player.id).catch(() => {});
      router.replace('/preflight');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not check status. Please try again.');
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.pageBackground }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // ── LOGO ─────────────────────────────────────────────────────────────────────

  const logo = (
    <View style={styles.logoRow}>
      <Text style={styles.logoEmoji}>⛳</Text>
      <Text style={[styles.logoTitle, { color: theme.colors.primary }]}>GFP Scorer</Text>
      <Text style={[styles.logoSub,   { color: theme.colors.accent }]}>Golf Fundraiser Pro</Text>
    </View>
  );

  // ── WAITING STEP (free agent awaiting team assignment) ────────────────────────

  if (step === 'waiting') {
    return (
      <KeyboardAvoidingView
        style={[styles.page, { backgroundColor: theme.pageBackground }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {logo}

          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Text style={styles.waitingIcon}>⏳</Text>
            <Text style={[styles.heading, { color: theme.colors.primary }]}>
              Awaiting Team Assignment
            </Text>
            <Text style={[styles.sub, { color: theme.colors.accent }]}>
              <Text style={{ fontWeight: '700' }}>{waitingName}</Text>, you're in the free agent pool for{' '}
              <Text style={{ fontWeight: '700' }}>{waitingEventName}</Text>.{'\n\n'}
              The organizer will assign you to a team before the event starts. Tap{' '}
              <Text style={{ fontWeight: '700' }}>Check Again</Text> on the day of the event.
            </Text>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={[styles.waitingInfoBox, { backgroundColor: theme.colors.primary + '0d', borderColor: theme.colors.primary + '33' }]}>
              <Text style={[styles.waitingInfoLabel, { color: theme.colors.primary }]}>Your registration</Text>
              <Text style={[styles.waitingInfoRow,  { color: theme.colors.accent }]}>📧 {waitingEmail}</Text>
              <Text style={[styles.waitingInfoRow,  { color: theme.colors.accent }]}>🏌️ Free agent pool</Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.joinBtn,
                { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
                joining && { opacity: 0.6 },
              ]}
              onPress={handleCheckAgain}
              disabled={joining}
              accessibilityRole="button"
              accessibilityLabel="Check if you have been assigned to a team"
            >
              {joining
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.joinBtnText}>Check Again</Text>}
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.waitingBackBtn, { borderColor: theme.colors.primary, opacity: pressed ? 0.7 : 1 }]}
              onPress={() => { setStep('pick'); setError(null); }}
              accessibilityRole="button"
            >
              <Text style={[styles.waitingBackBtnText, { color: theme.colors.primary }]}>
                Back to Home
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── JOIN STEP ─────────────────────────────────────────────────────────────────

  if (step === 'join') {
    const statusMeta = selected ? STATUS_LABELS[selected.status] : null;

    return (
      <KeyboardAvoidingView
        style={[styles.page, { backgroundColor: theme.pageBackground }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {logo}

          <Pressable onPress={() => { setStep('pick'); setError(null); }} style={styles.backBtn}>
            <Text style={[styles.backBtnText, { color: theme.colors.accent }]}>
              ← Choose a different tournament
            </Text>
          </Pressable>

          {selected && (
            <View style={[styles.selectedCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary + '44' }]}>
              <View style={styles.selectedCardTop}>
                <Text style={[styles.selectedName, { color: theme.colors.primary }]} numberOfLines={2}>
                  {selected.name}
                </Text>
                {statusMeta && (
                  <View style={[styles.statusPill, { backgroundColor: statusMeta.color + '22' }]}>
                    <Text style={[styles.statusPillText, { color: statusMeta.color }]}>
                      {statusMeta.label}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.selectedMeta, { color: theme.colors.accent }]} numberOfLines={2}>
                {[
                  selected.orgName,
                  selected.courseName,
                  selected.courseCity && selected.courseState
                    ? `${selected.courseCity}, ${selected.courseState}`
                    : null,
                  selected.startAt ? formatDate(selected.startAt) : null,
                ].filter(Boolean).join(' · ')}
              </Text>
              <Text style={[styles.formatLabel, { color: theme.colors.accent }]}>
                {FORMAT_LABELS[selected.format] ?? selected.format}
              </Text>
            </View>
          )}

          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.heading, { color: theme.colors.primary }]}>Enter Your Email</Text>
            <Text style={[styles.sub, { color: theme.colors.accent }]}>
              Use the email address you registered with.
            </Text>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {!selected && (
              <>
                <Text style={[styles.label, { color: theme.colors.primary }]}>Event Code</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
                  value={eventCode}
                  onChangeText={v => setEventCode(v.toUpperCase())}
                  placeholder="e.g. ABC12345"
                  placeholderTextColor="#aaa"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!joining}
                />
              </>
            )}

            <Text style={[styles.label, { color: theme.colors.primary }]}>Your Email</Text>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#aaa"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="done"
              onSubmitEditing={handleJoin}
              editable={!joining}
              autoFocus
            />

            <Pressable
              style={({ pressed }) => [
                styles.joinBtn,
                { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
                joining && { opacity: 0.6 },
              ]}
              onPress={handleJoin}
              disabled={joining}
              accessibilityRole="button"
              accessibilityLabel="Join event"
            >
              {joining
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.joinBtnText}>Join Event</Text>}
            </Pressable>
          </View>

          {selected?.status === 'Registration' && (
            <View style={styles.registerSection}>
              <View style={styles.orDivider}>
                <View style={[styles.orLine, { backgroundColor: theme.colors.accent + '55' }]} />
                <Text style={[styles.orText, { color: theme.colors.accent }]}>or</Text>
                <View style={[styles.orLine, { backgroundColor: theme.colors.accent + '55' }]} />
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.registerBtn,
                  { borderColor: theme.colors.primary, opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={() => router.push({
                  pathname: '/(auth)/register',
                  params: {
                    eventId:          selected.id,
                    eventName:        selected.name,
                    freeAgentEnabled: selected.freeAgentEnabled ? '1' : '0',
                  },
                })}
                accessibilityRole="button"
                accessibilityLabel="Register for this event"
              >
                <Text style={[styles.registerBtnText, { color: theme.colors.primary }]}>
                  Not registered yet? Sign up →
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── PICK STEP ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[styles.page, { backgroundColor: theme.pageBackground }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {logo}

        <Text style={[styles.sectionHeading, { color: theme.colors.primary }]}>
          Select Your Tournament
        </Text>

        {eventsLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={[styles.loadingText, { color: theme.colors.accent }]}>
              Loading tournaments…
            </Text>
          </View>
        ) : events.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.emptyText, { color: theme.colors.accent }]}>
              No tournaments are currently open.
            </Text>
            <Text style={[styles.emptyHint, { color: theme.colors.accent }]}>
              Use the event code below if you have one.
            </Text>
          </View>
        ) : (
          events.map(evt => {
            const st = STATUS_LABELS[evt.status];
            const meta = [
              evt.courseCity && evt.courseState ? `${evt.courseCity}, ${evt.courseState}` : null,
              evt.startAt ? formatDate(evt.startAt) : null,
            ].filter(Boolean).join(' · ');

            return (
              <Pressable
                key={evt.id}
                style={({ pressed }) => [
                  styles.eventCard,
                  { backgroundColor: theme.colors.surface, opacity: pressed ? 0.82 : 1 },
                ]}
                onPress={() => selectEvent(evt)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${evt.name}`}
              >
                <View style={styles.eventCardBody}>
                  <Text style={[styles.eventName, { color: theme.colors.primary }]} numberOfLines={2}>
                    {evt.name}
                  </Text>
                  <Text style={[styles.eventOrg, { color: theme.colors.accent }]} numberOfLines={1}>
                    {evt.orgName}
                  </Text>
                  {meta.length > 0 && (
                    <Text style={[styles.eventMeta, { color: theme.colors.accent }]} numberOfLines={1}>
                      {meta}
                    </Text>
                  )}
                  <View style={styles.badgeRow}>
                    <View style={[styles.badge, { backgroundColor: theme.colors.primary + '18' }]}>
                      <Text style={[styles.badgeText, { color: theme.colors.primary }]}>
                        {FORMAT_LABELS[evt.format] ?? evt.format}
                      </Text>
                    </View>
                    {st && (
                      <View style={[styles.badge, { backgroundColor: st.color + '18' }]}>
                        <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={[styles.chevron, { color: theme.colors.primary }]}>›</Text>
              </Pressable>
            );
          })
        )}

        {/* Manual code entry */}
        <Pressable
          onPress={() => setShowManual(v => !v)}
          style={styles.manualToggle}
          accessibilityRole="button"
        >
          <Text style={[styles.manualToggleText, { color: theme.colors.accent }]}>
            {showManual ? 'Hide ↑' : 'Have a different event code? ↓'}
          </Text>
        </Pressable>

        {showManual && (
          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            <Text style={[styles.label, { color: theme.colors.primary }]}>Event Code</Text>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
              value={eventCode}
              onChangeText={v => { setEventCode(v.toUpperCase()); setError(null); }}
              placeholder="e.g. ABC12345"
              placeholderTextColor="#aaa"
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={continueWithCode}
            />
            <Pressable
              style={({ pressed }) => [
                styles.joinBtn,
                { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
              ]}
              onPress={continueWithCode}
              accessibilityRole="button"
            >
              <Text style={styles.joinBtnText}>Continue</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page:    { flex: 1 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:  { flexGrow: 1, padding: 20, paddingBottom: 40 },

  logoRow:   { alignItems: 'center', marginBottom: 28, marginTop: 16 },
  logoEmoji: { fontSize: 44 },
  logoTitle: { fontSize: 26, fontWeight: '800', marginTop: 8 },
  logoSub:   { fontSize: 13, fontWeight: '500', marginTop: 4 },

  sectionHeading: { fontSize: 18, fontWeight: '700', marginBottom: 14 },

  // Loading / empty
  loadingRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 24, justifyContent: 'center' },
  loadingText: { fontSize: 14 },
  emptyBox:    { borderRadius: 12, padding: 24, alignItems: 'center', marginBottom: 8 },
  emptyText:   { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  emptyHint:   { fontSize: 13, textAlign: 'center', marginTop: 6 },

  // Event cards
  eventCard: {
    borderRadius: 14, padding: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  eventCardBody: { flex: 1 },
  eventName:     { fontSize: 16, fontWeight: '700', marginBottom: 3 },
  eventOrg:      { fontSize: 13, fontWeight: '500', marginBottom: 2 },
  eventMeta:     { fontSize: 12, marginBottom: 8 },
  badgeRow:      { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge:         { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:     { fontSize: 11, fontWeight: '600' },
  chevron:       { fontSize: 26, fontWeight: '300', marginLeft: 8 },

  // Manual entry toggle
  manualToggle:    { alignItems: 'center', paddingVertical: 16 },
  manualToggleText: { fontSize: 14 },

  // Join step — back button
  backBtn:     { marginBottom: 12 },
  backBtnText: { fontSize: 14, fontWeight: '500' },

  // Selected event mini-card
  selectedCard: {
    borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  selectedCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  selectedName:    { fontSize: 16, fontWeight: '700', flex: 1 },
  selectedMeta:    { fontSize: 13, marginTop: 2 },
  formatLabel:     { fontSize: 12, marginTop: 4 },
  statusPill:      { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  statusPillText:  { fontSize: 11, fontWeight: '600' },

  // Email entry card
  card: {
    borderRadius: 16, padding: 24, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
  },
  heading: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  sub:     { fontSize: 14, marginBottom: 18 },
  label:   { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input:   {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, backgroundColor: '#fafafa',
  },
  joinBtn: {
    marginTop: 22, paddingVertical: 16,
    borderRadius: 12, alignItems: 'center',
  },
  joinBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },

  errorBox: {
    backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, marginBottom: 8,
    borderLeftWidth: 3, borderLeftColor: '#e74c3c',
  },
  errorText: { color: '#c0392b', fontSize: 14 },

  registerSection: { marginTop: 4 },
  orDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 10 },
  orLine:    { flex: 1, height: 1 },
  orText:    { fontSize: 13, fontWeight: '500' },
  registerBtn: {
    borderWidth: 1.5, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  registerBtnText: { fontSize: 15, fontWeight: '600' },

  // Waiting step
  waitingIcon:      { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  waitingInfoBox:   { borderRadius: 10, borderWidth: 1, padding: 14, marginTop: 16, marginBottom: 4, gap: 6 },
  waitingInfoLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  waitingInfoRow:   { fontSize: 14 },
  waitingBackBtn:   {
    borderWidth: 1.5, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 10,
  },
  waitingBackBtnText: { fontSize: 15, fontWeight: '600' },
});
