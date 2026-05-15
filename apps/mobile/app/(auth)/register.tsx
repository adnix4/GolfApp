import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, ScrollView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { registerTeam, type PlayerInput } from '@/lib/api';

const MAX_TEAMMATES = 3; // 4 total including captain

type Step = 'form' | 'success';

interface TeammateFields {
  firstName: string;
  lastName:  string;
  email:     string;
}

const emptyTeammate = (): TeammateFields => ({ firstName: '', lastName: '', email: '' });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const theme  = useTheme();
  const router = useRouter();
  const { eventId, eventName } = useLocalSearchParams<{ eventId: string; eventName: string }>();

  const [step,       setStep]       = useState<Step>('form');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Captain (first player / team creator)
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [phone,     setPhone]     = useState('');
  const [handicap,  setHandicap]  = useState('');
  const [teamName,  setTeamName]  = useState('');

  // Teammates
  const [teammates, setTeammates] = useState<TeammateFields[]>([]);

  // Success
  const [confirmedTeamName, setConfirmedTeamName] = useState('');
  const [confirmedPlayers,  setConfirmedPlayers]  = useState<string[]>([]);

  const addTeammate = useCallback(() => {
    setTeammates(prev => [...prev, emptyTeammate()]);
  }, []);

  const removeTeammate = useCallback((idx: number) => {
    setTeammates(prev => prev.filter((_, i) => i !== idx));
    setError(null);
  }, []);

  const updateTeammate = useCallback((idx: number, field: keyof TeammateFields, value: string) => {
    setTeammates(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
    setError(null);
  }, []);

  async function handleRegister() {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const em = email.trim().toLowerCase();

    if (!fn) { setError('Your first name is required.');    return; }
    if (!ln) { setError('Your last name is required.');     return; }
    if (!em) { setError('Your email address is required.'); return; }
    if (!EMAIL_RE.test(em)) { setError('Enter a valid email address for yourself.'); return; }

    const handicapVal = handicap.trim() ? parseFloat(handicap.trim()) : undefined;
    if (handicapVal !== undefined && (isNaN(handicapVal) || handicapVal < 0 || handicapVal > 54)) {
      setError('Handicap must be a number between 0 and 54.');
      return;
    }

    for (let i = 0; i < teammates.length; i++) {
      const t   = teammates[i];
      const num = i + 1;
      const tfn = t.firstName.trim();
      const tln = t.lastName.trim();
      const tem = t.email.trim().toLowerCase();
      if (!tfn) { setError(`Teammate ${num}: first name is required.`);    return; }
      if (!tln) { setError(`Teammate ${num}: last name is required.`);     return; }
      if (!tem) { setError(`Teammate ${num}: email address is required.`); return; }
      if (!EMAIL_RE.test(tem)) { setError(`Teammate ${num}: enter a valid email address.`); return; }
      if (tem === em) { setError(`Teammate ${num}: email must differ from yours.`); return; }
      const earlier = teammates.slice(0, i).map(x => x.email.trim().toLowerCase());
      if (earlier.includes(tem)) { setError(`Teammate ${num}: duplicate email address.`); return; }
    }

    const resolvedTeamName = teamName.trim() || `${fn} ${ln}`;

    const players: PlayerInput[] = [
      { firstName: fn, lastName: ln, email: em, phone: phone.trim() || undefined, handicapIndex: handicapVal },
      ...teammates.map(t => ({
        firstName: t.firstName.trim(),
        lastName:  t.lastName.trim(),
        email:     t.email.trim().toLowerCase(),
      })),
    ];

    setError(null);
    setSubmitting(true);
    try {
      await registerTeam(eventId, resolvedTeamName, players);
      setConfirmedTeamName(resolvedTeamName);
      setConfirmedPlayers(players.map(p => `${p.firstName} ${p.lastName}`));
      setStep('success');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const logo = (
    <View style={styles.logoRow}>
      <Text style={styles.logoEmoji}>⛳</Text>
      <Text style={[styles.logoTitle, { color: theme.colors.primary }]}>GFP Scorer</Text>
      <Text style={[styles.logoSub, { color: theme.colors.accent }]}>Golf Fundraiser Pro</Text>
    </View>
  );

  // ── SUCCESS ───────────────────────────────────────────────────────────────────

  if (step === 'success') {
    return (
      <View style={[styles.page, { backgroundColor: theme.pageBackground }]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {logo}
          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={[styles.heading, { color: theme.colors.primary }]}>You're Registered!</Text>
            <Text style={[styles.sub, { color: theme.colors.accent }]}>
              <Text style={{ fontWeight: '700' }}>{confirmedTeamName}</Text> has been added to{' '}
              <Text style={{ fontWeight: '700' }}>{eventName}</Text>.
            </Text>

            <View style={[styles.rosterBox, { backgroundColor: theme.colors.primary + '0d', borderColor: theme.colors.primary + '33' }]}>
              <Text style={[styles.rosterLabel, { color: theme.colors.primary }]}>
                {confirmedPlayers.length === 1 ? '1 player registered' : `${confirmedPlayers.length} players registered`}
              </Text>
              {confirmedPlayers.map((name, i) => (
                <Text key={i} style={[styles.rosterRow, { color: theme.colors.accent }]}>
                  {i === 0 ? '★ ' : '  '}{name}{i === 0 ? ' (captain)' : ''}
                </Text>
              ))}
            </View>

            <Text style={[styles.successNote, { color: theme.colors.accent }]}>
              Confirmation emails will be sent to all registered players. Everyone can join the
              scoring app on the day of the event using their email address.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
              ]}
              onPress={() => router.replace('/join')}
              accessibilityRole="button"
            >
              <Text style={styles.submitBtnText}>Back to Home</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── FORM ──────────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[styles.page, { backgroundColor: theme.pageBackground }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {logo}

        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backBtnText, { color: theme.colors.accent }]}>← Back</Text>
        </Pressable>

        <View style={[styles.eventBanner, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary + '44' }]}>
          <Text style={[styles.eventBannerLabel, { color: theme.colors.accent }]}>Registering for</Text>
          <Text style={[styles.eventBannerName, { color: theme.colors.primary }]} numberOfLines={2}>
            {eventName}
          </Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── Captain ── */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Your Information</Text>

          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={[styles.label, { color: theme.colors.primary }]}>First Name *</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
                value={firstName}
                onChangeText={v => { setFirstName(v); setError(null); }}
                placeholder="Jane"
                placeholderTextColor="#aaa"
                autoCapitalize="words"
                autoCorrect={false}
                editable={!submitting}
                autoFocus
              />
            </View>
            <View style={styles.halfField}>
              <Text style={[styles.label, { color: theme.colors.primary }]}>Last Name *</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
                value={lastName}
                onChangeText={v => { setLastName(v); setError(null); }}
                placeholder="Smith"
                placeholderTextColor="#aaa"
                autoCapitalize="words"
                autoCorrect={false}
                editable={!submitting}
              />
            </View>
          </View>

          <Text style={[styles.label, { color: theme.colors.primary }]}>Email *</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
            value={email}
            onChangeText={v => { setEmail(v); setError(null); }}
            placeholder="you@example.com"
            placeholderTextColor="#aaa"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            editable={!submitting}
          />

          <Text style={[styles.label, { color: theme.colors.primary }]}>
            Phone <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
            value={phone}
            onChangeText={setPhone}
            placeholder="555-867-5309"
            placeholderTextColor="#aaa"
            keyboardType="phone-pad"
            editable={!submitting}
          />

          <Text style={[styles.label, { color: theme.colors.primary }]}>
            Handicap Index <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
            value={handicap}
            onChangeText={v => { setHandicap(v); setError(null); }}
            placeholder="e.g. 14.2"
            placeholderTextColor="#aaa"
            keyboardType="decimal-pad"
            editable={!submitting}
          />

          <Text style={[styles.label, { color: theme.colors.primary }]}>
            Team Name <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
            value={teamName}
            onChangeText={setTeamName}
            placeholder={firstName && lastName ? `${firstName} ${lastName}` : 'e.g. The Bogey Brothers'}
            placeholderTextColor="#aaa"
            autoCapitalize="words"
            editable={!submitting}
          />
          <Text style={[styles.fieldHint, { color: theme.colors.accent }]}>
            Defaults to your name if left blank.
          </Text>
        </View>

        {/* ── Teammates ── */}
        <View style={styles.teammatesHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>
            Teammates
          </Text>
          <Text style={[styles.teammateBadge, { color: theme.colors.accent }]}>
            {teammates.length} / {MAX_TEAMMATES}
          </Text>
        </View>

        {teammates.map((tm, idx) => (
          <View key={idx} style={[styles.card, styles.teammateCard, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.teammateCardHeader}>
              <Text style={[styles.teammateCardTitle, { color: theme.colors.primary }]}>
                Teammate {idx + 1}
              </Text>
              <Pressable
                onPress={() => removeTeammate(idx)}
                style={styles.removeBtn}
                accessibilityLabel={`Remove teammate ${idx + 1}`}
                hitSlop={8}
              >
                <Text style={[styles.removeBtnText, { color: theme.colors.accent }]}>✕ Remove</Text>
              </Pressable>
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={[styles.label, { color: theme.colors.primary }]}>First Name *</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
                  value={tm.firstName}
                  onChangeText={v => updateTeammate(idx, 'firstName', v)}
                  placeholder="Alex"
                  placeholderTextColor="#aaa"
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!submitting}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={[styles.label, { color: theme.colors.primary }]}>Last Name *</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
                  value={tm.lastName}
                  onChangeText={v => updateTeammate(idx, 'lastName', v)}
                  placeholder="Jones"
                  placeholderTextColor="#aaa"
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!submitting}
                />
              </View>
            </View>

            <Text style={[styles.label, { color: theme.colors.primary }]}>Email *</Text>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
              value={tm.email}
              onChangeText={v => updateTeammate(idx, 'email', v)}
              placeholder="teammate@example.com"
              placeholderTextColor="#aaa"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!submitting}
            />
          </View>
        ))}

        {teammates.length < MAX_TEAMMATES && (
          <Pressable
            style={({ pressed }) => [
              styles.addTeammateBtn,
              { borderColor: theme.colors.primary, opacity: pressed ? 0.65 : 1 },
            ]}
            onPress={addTeammate}
            disabled={submitting}
            accessibilityRole="button"
          >
            <Text style={[styles.addTeammateBtnText, { color: theme.colors.primary }]}>
              + Add Teammate
            </Text>
          </Pressable>
        )}

        {/* ── Submit ── */}
        <Pressable
          style={({ pressed }) => [
            styles.submitBtn,
            styles.submitBtnSpacing,
            { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
            submitting && { opacity: 0.6 },
          ]}
          onPress={handleRegister}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Complete registration"
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitBtnText}>
                Complete Registration
                {teammates.length > 0 ? ` (${teammates.length + 1} players)` : ''}
              </Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page:   { flex: 1 },
  scroll: { flexGrow: 1, padding: 20, paddingBottom: 48 },

  logoRow:   { alignItems: 'center', marginBottom: 28, marginTop: 16 },
  logoEmoji: { fontSize: 44 },
  logoTitle: { fontSize: 26, fontWeight: '800', marginTop: 8 },
  logoSub:   { fontSize: 13, fontWeight: '500', marginTop: 4 },

  backBtn:     { marginBottom: 12 },
  backBtnText: { fontSize: 14, fontWeight: '500' },

  eventBanner: {
    borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 1,
  },
  eventBannerLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  eventBannerName:  { fontSize: 16, fontWeight: '700' },

  errorBox: {
    backgroundColor: '#fdf2f2', borderRadius: 10, padding: 14, marginBottom: 14,
    borderLeftWidth: 3, borderLeftColor: '#e74c3c',
  },
  errorText: { color: '#c0392b', fontSize: 14 },

  card: {
    borderRadius: 16, padding: 20, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
  },
  heading: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  sub:     { fontSize: 14, marginBottom: 18, lineHeight: 20 },

  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },

  row:       { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },

  label:     { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  optional:  { fontSize: 12, fontWeight: '400' },
  fieldHint: { fontSize: 12, marginTop: 4 },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, backgroundColor: '#fafafa',
  },

  // Teammates section
  teammatesHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  teammateBadge: { fontSize: 13, fontWeight: '500' },

  teammateCard:       { paddingTop: 16 },
  teammateCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  teammateCardTitle:  { fontSize: 14, fontWeight: '700' },
  removeBtn:          { padding: 4 },
  removeBtnText:      { fontSize: 13, fontWeight: '500' },

  addTeammateBtn: {
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginBottom: 14,
  },
  addTeammateBtnText: { fontSize: 15, fontWeight: '600' },

  submitBtn: {
    paddingVertical: 16, borderRadius: 12, alignItems: 'center',
  },
  submitBtnSpacing: { marginTop: 6 },
  submitBtnText:    { fontSize: 17, fontWeight: '700', color: '#fff' },

  // Success
  successIcon: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  successNote: { fontSize: 13, lineHeight: 20, marginTop: 12, marginBottom: 4 },
  rosterBox: {
    borderRadius: 10, borderWidth: 1,
    padding: 14, marginTop: 14, gap: 4,
  },
  rosterLabel: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  rosterRow:   { fontSize: 14, lineHeight: 22 },
});
