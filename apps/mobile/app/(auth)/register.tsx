import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, ScrollView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import {
  registerTeam, registerFreeAgent,
  type PlayerInput, type SkillLevel, type AgeGroup,
} from '@/lib/api';

const MAX_TEAMMATES = 3;
type Step = 'form' | 'success';

interface TeammateFields { firstName: string; lastName: string; email: string; }
const emptyTeammate = (): TeammateFields => ({ firstName: '', lastName: '', email: '' });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function digitsOnly(v: string): string { return v.replace(/\D/g, '').slice(0, 10); }
function fmtPhoneInput(digits: string): string {
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const SKILL_OPTIONS: { value: SkillLevel; label: string }[] = [
  { value: 'Beginner',     label: 'Beginner'     },
  { value: 'Intermediate', label: 'Intermediate' },
  { value: 'Advanced',     label: 'Advanced'     },
  { value: 'Competitive',  label: 'Competitive'  },
];

const AGE_OPTIONS: { value: AgeGroup; label: string }[] = [
  { value: 'Under30',    label: 'Under 30' },
  { value: 'From30To50', label: '30 – 50'  },
  { value: 'Over50',     label: 'Over 50'  },
];

export default function RegisterScreen() {
  const theme  = useTheme();
  const router = useRouter();
  const { eventId, eventName, freeAgentEnabled: faeParam } =
    useLocalSearchParams<{ eventId: string; eventName: string; freeAgentEnabled?: string }>();

  const freeAgentEnabled = faeParam === '1';

  const [step,       setStep]       = useState<Step>('form');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Shared player fields
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [phone,     setPhone]     = useState('');
  const [handicap,  setHandicap]  = useState('');

  // Team name — blank means free agent
  const [teamName,  setTeamName]  = useState('');
  const [teammates, setTeammates] = useState<TeammateFields[]>([]);

  // Free-agent pairing prefs
  const [skillLevel,  setSkillLevel]  = useState<SkillLevel | null>(null);
  const [ageGroup,    setAgeGroup]    = useState<AgeGroup | null>(null);
  const [pairingNote, setPairingNote] = useState('');

  // Success state
  const [confirmedName,      setConfirmedName]      = useState('');
  const [confirmedPlayers,   setConfirmedPlayers]   = useState<string[]>([]);
  const [entryFeeCents,      setEntryFeeCents]      = useState<number | null>(null);
  const [isFreeAgentSuccess, setIsFreeAgentSuccess] = useState(false);

  // If no team name typed, treat as free agent
  const isFreeAgent = !teamName.trim();

  const addTeammate    = useCallback(() => setTeammates(p => [...p, emptyTeammate()]), []);
  const removeTeammate = useCallback((idx: number) => {
    setTeammates(p => p.filter((_, i) => i !== idx)); setError(null);
  }, []);
  const updateTeammate = useCallback((idx: number, field: keyof TeammateFields, value: string) => {
    setTeammates(p => p.map((t, i) => i === idx ? { ...t, [field]: value } : t)); setError(null);
  }, []);

  async function handleRegister() {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const em = email.trim().toLowerCase();

    if (!fn) { setError('Your first name is required.');    return; }
    if (!ln) { setError('Your last name is required.');     return; }
    if (!em) { setError('Your email address is required.'); return; }
    if (!EMAIL_RE.test(em)) { setError('Enter a valid email address.'); return; }

    const ph = phone.trim();
    if (ph && digitsOnly(ph).length !== 10) { setError('Phone number must be 10 digits.'); return; }

    const hcp = handicap.trim() ? parseFloat(handicap.trim()) : undefined;
    if (hcp !== undefined && (isNaN(hcp) || hcp < 0 || hcp > 54)) {
      setError('Handicap must be a number between 0 and 54.'); return;
    }

    const player: PlayerInput = {
      firstName: fn, lastName: ln, email: em,
      phone: phone.trim() || undefined,
      handicapIndex: hcp,
    };

    setError(null);
    setSubmitting(true);

    try {
      if (isFreeAgent) {
        const result = await registerFreeAgent(eventId, {
          player,
          skillLevel:  skillLevel  ?? undefined,
          ageGroup:    ageGroup    ?? undefined,
          pairingNote: pairingNote.trim() || undefined,
        });
        setConfirmedName(`${fn} ${ln}`);
        setConfirmedPlayers([`${fn} ${ln}`]);
        setEntryFeeCents(result.entryFeeCents ?? null);
        setIsFreeAgentSuccess(true);
        setStep('success');
        return;
      }

      // Team registration — validate teammates
      for (let i = 0; i < teammates.length; i++) {
        const t = teammates[i];
        const num = i + 1;
        const tfn = t.firstName.trim(); const tln = t.lastName.trim(); const tem = t.email.trim().toLowerCase();
        if (!tfn) { setError(`Teammate ${num}: first name is required.`);    return; }
        if (!tln) { setError(`Teammate ${num}: last name is required.`);     return; }
        if (!tem) { setError(`Teammate ${num}: email address is required.`); return; }
        if (!EMAIL_RE.test(tem)) { setError(`Teammate ${num}: enter a valid email address.`); return; }
        if (tem === em)          { setError(`Teammate ${num}: email must differ from yours.`); return; }
        const earlier = teammates.slice(0, i).map(x => x.email.trim().toLowerCase());
        if (earlier.includes(tem)) { setError(`Teammate ${num}: duplicate email address.`); return; }
      }

      const players: PlayerInput[] = [
        player,
        ...teammates.map(t => ({
          firstName: t.firstName.trim(),
          lastName:  t.lastName.trim(),
          email:     t.email.trim().toLowerCase(),
        })),
      ];

      const result = await registerTeam(eventId, teamName.trim(), players);
      setConfirmedName(teamName.trim());
      setConfirmedPlayers(players.map(p => `${p.firstName} ${p.lastName}`));
      setEntryFeeCents(result.entryFeeCents ?? null);
      setIsFreeAgentSuccess(false);
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
      <Text style={[styles.logoSub,   { color: theme.colors.accent }]}>Golf Fundraiser Pro</Text>
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

            {isFreeAgentSuccess ? (
              <Text style={[styles.sub, { color: theme.colors.accent }]}>
                <Text style={{ fontWeight: '700' }}>{confirmedName}</Text> has been added to the free agent pool for{' '}
                <Text style={{ fontWeight: '700' }}>{eventName}</Text>.{'\n\n'}
                The organizer will assign you to a team before the event starts.
              </Text>
            ) : (
              <Text style={[styles.sub, { color: theme.colors.accent }]}>
                <Text style={{ fontWeight: '700' }}>{confirmedName}</Text> has been added to{' '}
                <Text style={{ fontWeight: '700' }}>{eventName}</Text>.
              </Text>
            )}

            <View style={[styles.rosterBox, { backgroundColor: theme.colors.primary + '0d', borderColor: theme.colors.primary + '33' }]}>
              <Text style={[styles.rosterLabel, { color: theme.colors.primary }]}>
                {confirmedPlayers.length === 1 ? '1 player registered' : `${confirmedPlayers.length} players registered`}
              </Text>
              {confirmedPlayers.map((name, i) => (
                <Text key={i} style={[styles.rosterRow, { color: theme.colors.accent }]}>
                  {!isFreeAgentSuccess && i === 0 ? '★ ' : '  '}{name}
                  {!isFreeAgentSuccess && i === 0 ? ' (captain)' : ''}
                </Text>
              ))}
            </View>

            {entryFeeCents != null && entryFeeCents > 0 && (
              <View style={[styles.feeNotice, { backgroundColor: '#fffbf0', borderColor: '#f39c12' }]}>
                <Text style={styles.feeNoticeTitle}>Entry Fee Due</Text>
                <Text style={styles.feeNoticeText}>
                  This event requires a ${(entryFeeCents / 100).toFixed(2)} entry fee.
                  A payment link has been sent to your email — please complete payment before the event starts.
                </Text>
              </View>
            )}

            <Text style={[styles.successNote, { color: theme.colors.accent }]}>
              {isFreeAgentSuccess
                ? 'A confirmation email has been sent. You can join the scoring app on the day of the event using your email address.'
                : 'Confirmation emails will be sent to all registered players. Everyone can join the scoring app using their email address on the day of the event.'}
            </Text>

            <Pressable
              style={({ pressed }) => [styles.submitBtn, { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary }]}
              onPress={() => router.replace({ pathname: '/(auth)/join', params: { preEventId: eventId } })}
              accessibilityRole="button"
            >
              <Text style={styles.submitBtnText}>View Event Details</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.homeBtn, { borderColor: theme.colors.primary, opacity: pressed ? 0.7 : 1 }]}
              onPress={() => router.replace('/join')}
              accessibilityRole="button"
            >
              <Text style={[styles.homeBtnText, { color: theme.colors.primary }]}>Back to Home</Text>
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
          <Text style={[styles.eventBannerName,  { color: theme.colors.primary }]} numberOfLines={2}>{eventName}</Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── Your Information ── */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Your Information</Text>

          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={[styles.label, { color: theme.colors.primary }]}>First Name *</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
                value={firstName} onChangeText={v => { setFirstName(v); setError(null); }}
                placeholder="Jane" placeholderTextColor="#aaa"
                autoCapitalize="words" autoCorrect={false} editable={!submitting} autoFocus
              />
            </View>
            <View style={styles.halfField}>
              <Text style={[styles.label, { color: theme.colors.primary }]}>Last Name *</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
                value={lastName} onChangeText={v => { setLastName(v); setError(null); }}
                placeholder="Smith" placeholderTextColor="#aaa"
                autoCapitalize="words" autoCorrect={false} editable={!submitting}
              />
            </View>
          </View>

          <Text style={[styles.label, { color: theme.colors.primary }]}>Email *</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
            value={email} onChangeText={v => { setEmail(v); setError(null); }}
            placeholder="you@example.com" placeholderTextColor="#aaa"
            autoCapitalize="none" keyboardType="email-address" autoComplete="email" editable={!submitting}
          />

          <Text style={[styles.label, { color: theme.colors.primary }]}>
            Phone <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
            value={phone} onChangeText={v => setPhone(fmtPhoneInput(digitsOnly(v)))}
            placeholder="(555) 867-5309" placeholderTextColor="#aaa"
            keyboardType="phone-pad" editable={!submitting}
          />

          <Text style={[styles.label, { color: theme.colors.primary }]}>
            Handicap Index <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
            value={handicap} onChangeText={v => { setHandicap(v); setError(null); }}
            placeholder="e.g. 14.2" placeholderTextColor="#aaa"
            keyboardType="decimal-pad" editable={!submitting}
          />
        </View>

        {/* ── Team section ── */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Team</Text>

          {/* Assignment notice */}
          <View style={[styles.assignNotice, { backgroundColor: theme.colors.highlight, borderColor: theme.colors.primary + '44' }]}>
            <Text style={[styles.assignNoticeText, { color: theme.colors.primary }]}>
              Don't have a team yet? Leave the team name blank — you'll be added to the free agent pool and the organizer will assign you to a team before the event starts.
            </Text>
          </View>

          <Text style={[styles.label, { color: theme.colors.primary }]}>
            Team Name <Text style={styles.optional}>(leave blank to be assigned)</Text>
          </Text>
          <TextInput
            style={[styles.input, { borderColor: isFreeAgent ? theme.colors.accent + '88' : theme.colors.accent, color: theme.colors.primary }]}
            value={teamName} onChangeText={v => { setTeamName(v); setError(null); }}
            placeholder="e.g. The Bogey Brothers"
            placeholderTextColor="#aaa"
            autoCapitalize="words" editable={!submitting}
          />

          {/* Status indicator */}
          {isFreeAgent ? (
            <View style={[styles.statusPill, { backgroundColor: theme.colors.highlight }]}>
              <Text style={[styles.statusPillText, { color: theme.colors.primary }]}>
                Free agent — you'll be assigned to a team by the organizer
              </Text>
            </View>
          ) : (
            <View style={[styles.statusPill, { backgroundColor: '#e8f5e9' }]}>
              <Text style={[styles.statusPillText, { color: '#2e7d32' }]}>
                Creating team "{teamName.trim()}"
              </Text>
            </View>
          )}
        </View>

        {/* ── Free agent pairing prefs (shown when no team name) ── */}
        {isFreeAgent && (
          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>
              Pairing Preferences <Text style={styles.optional}>(optional)</Text>
            </Text>
            <Text style={[styles.fieldHint, { color: theme.colors.accent, marginTop: 0, marginBottom: 8 }]}>
              Help the organizer match you with the right team.
            </Text>

            <Text style={[styles.label, { color: theme.colors.primary }]}>Skill Level</Text>
            <View style={styles.chipRow}>
              {SKILL_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.chip,
                    { borderColor: theme.colors.accent },
                    skillLevel === opt.value && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
                  ]}
                  onPress={() => setSkillLevel(p => p === opt.value ? null : opt.value)}
                >
                  <Text style={[styles.chipText, { color: skillLevel === opt.value ? '#fff' : theme.colors.accent }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: theme.colors.primary }]}>Age Group</Text>
            <View style={styles.chipRow}>
              {AGE_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.chip,
                    { borderColor: theme.colors.accent },
                    ageGroup === opt.value && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
                  ]}
                  onPress={() => setAgeGroup(p => p === opt.value ? null : opt.value)}
                >
                  <Text style={[styles.chipText, { color: ageGroup === opt.value ? '#fff' : theme.colors.accent }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: theme.colors.primary }]}>Note to Organizer</Text>
            <TextInput
              style={[styles.input, styles.textArea, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
              value={pairingNote} onChangeText={setPairingNote}
              placeholder="e.g. I know the Johnson family — please pair me with them if possible."
              placeholderTextColor="#aaa" multiline numberOfLines={3} maxLength={500} editable={!submitting}
            />
          </View>
        )}

        {/* ── Teammates (shown when team name is entered) ── */}
        {!isFreeAgent && (
          <>
            <View style={styles.teammatesHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Teammates</Text>
              <Text style={[styles.teammateBadge, { color: theme.colors.accent }]}>
                {teammates.length} / {MAX_TEAMMATES}
              </Text>
            </View>

            {teammates.map((tm, idx) => (
              <View key={idx} style={[styles.card, styles.teammateCard, { backgroundColor: theme.colors.surface }]}>
                <View style={styles.teammateCardHeader}>
                  <Text style={[styles.teammateCardTitle, { color: theme.colors.primary }]}>Teammate {idx + 1}</Text>
                  <Pressable onPress={() => removeTeammate(idx)} style={styles.removeBtn} hitSlop={8}>
                    <Text style={[styles.removeBtnText, { color: theme.colors.accent }]}>✕ Remove</Text>
                  </Pressable>
                </View>
                <View style={styles.row}>
                  <View style={styles.halfField}>
                    <Text style={[styles.label, { color: theme.colors.primary }]}>First Name *</Text>
                    <TextInput
                      style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
                      value={tm.firstName} onChangeText={v => updateTeammate(idx, 'firstName', v)}
                      placeholder="Alex" placeholderTextColor="#aaa" autoCapitalize="words" autoCorrect={false} editable={!submitting}
                    />
                  </View>
                  <View style={styles.halfField}>
                    <Text style={[styles.label, { color: theme.colors.primary }]}>Last Name *</Text>
                    <TextInput
                      style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
                      value={tm.lastName} onChangeText={v => updateTeammate(idx, 'lastName', v)}
                      placeholder="Jones" placeholderTextColor="#aaa" autoCapitalize="words" autoCorrect={false} editable={!submitting}
                    />
                  </View>
                </View>
                <Text style={[styles.label, { color: theme.colors.primary }]}>Email *</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
                  value={tm.email} onChangeText={v => updateTeammate(idx, 'email', v)}
                  placeholder="teammate@example.com" placeholderTextColor="#aaa"
                  autoCapitalize="none" keyboardType="email-address" autoComplete="email" editable={!submitting}
                />
              </View>
            ))}

            {teammates.length < MAX_TEAMMATES && (
              <Pressable
                style={({ pressed }) => [styles.addTeammateBtn, { borderColor: theme.colors.primary, opacity: pressed ? 0.65 : 1 }]}
                onPress={addTeammate} disabled={submitting} accessibilityRole="button"
              >
                <Text style={[styles.addTeammateBtnText, { color: theme.colors.primary }]}>+ Add Teammate</Text>
              </Pressable>
            )}
          </>
        )}

        {/* ── Submit ── */}
        <Pressable
          style={({ pressed }) => [
            styles.submitBtn, styles.submitBtnSpacing,
            { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
            submitting && { opacity: 0.6 },
          ]}
          onPress={handleRegister} disabled={submitting} accessibilityRole="button"
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitBtnText}>
                {isFreeAgent
                  ? 'Register — I\'ll be assigned to a team'
                  : `Register Team${teammates.length > 0 ? ` (${teammates.length + 1} players)` : ''}`}
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

  eventBanner: { borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1 },
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

  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },

  assignNotice: { borderRadius: 10, padding: 12, marginBottom: 4, borderWidth: 1 },
  assignNoticeText: { fontSize: 13, lineHeight: 19 },

  statusPill:     { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, marginTop: 10 },
  statusPillText: { fontSize: 13, fontWeight: '600' },

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
  textArea: { height: 90, textAlignVertical: 'top', paddingTop: 12 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip:    { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  chipText:{ fontSize: 13, fontWeight: '600' },

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

  submitBtn:        { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  submitBtnSpacing: { marginTop: 6 },
  submitBtnText:    { fontSize: 17, fontWeight: '700', color: '#fff' },
  homeBtn:          { paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, marginTop: 10 },
  homeBtnText:      { fontSize: 15, fontWeight: '600' },

  successIcon: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  successNote: { fontSize: 13, lineHeight: 20, marginTop: 12, marginBottom: 4 },

  feeNotice:      { borderWidth: 1, borderRadius: 10, padding: 14, marginTop: 12 },
  feeNoticeTitle: { fontSize: 14, fontWeight: '700', color: '#7d6608', marginBottom: 4 },
  feeNoticeText:  { fontSize: 13, lineHeight: 19, color: '#7d6608' },
  rosterBox:      { borderRadius: 10, borderWidth: 1, padding: 14, marginTop: 14, gap: 4 },
  rosterLabel:    { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  rosterRow:      { fontSize: 14, lineHeight: 22 },
});
