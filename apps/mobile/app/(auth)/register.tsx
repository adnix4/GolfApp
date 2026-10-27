import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Share,
  ActivityIndicator, KeyboardAvoidingView, ScrollView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  StripeProvider, CardField, useStripe, type CardFieldInput,
} from '@stripe/stripe-react-native';
import { useTheme, useClasses } from '@gfp/ui';
import {
  formatCentsShort, digitsOnly, fmtPhoneInput,
  validateGolfer, validateRoster, toPlayerInput, parseInviteToken, ApiError,
  SKILL_LEVEL_OPTIONS as SKILL_OPTIONS, AGE_GROUP_OPTIONS as AGE_OPTIONS, PAIRING_NOTE_MAX,
  type GolferFields,
} from '@gfp/shared-types';
import { GfpLogo } from '@/components/GfpLogo';
import {
  registerTeam, registerFreeAgent, joinTeam, fetchInvitePreview, confirmEntryFee,
  type SkillLevel, type AgeGroup, type TeamInvitePreview,
} from '@/lib/api';
import { fontSize, radius, spacing, status } from '@gfp/theme';

const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

const MAX_TEAMMATES = 3;
type Step = 'form' | 'success';
// Start a team (captain), join a captain's team by invite, or no team yet (free agent).
type Mode = 'team' | 'join' | 'freeAgent';
const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'team',      label: 'Start a team' },
  { value: 'join',      label: 'Join a team' },
  { value: 'freeAgent', label: 'No team yet' },
];

// Same fields as web and admin — see packages/shared-types/src/registration.ts.
const emptyTeammate = (): GolferFields => ({ firstName: '', lastName: '', email: '', phone: '', handicap: '' });

export default function RegisterScreen() {
  const theme  = useTheme();
  const c      = useClasses();
  const router = useRouter();
  // `invite` arrives from the captain's link via the web hand-off
  // (gfp://register?eventId=…&invite=…), which doesn't know the event name.
  const params = useLocalSearchParams<{
    eventId: string; eventName?: string; freeAgentEnabled?: string; invite?: string;
  }>();
  const { eventId, freeAgentEnabled } = params;

  const [step,       setStep]       = useState<Step>('form');
  const [mode,       setMode]       = useState<Mode>(params.invite ? 'join' : 'team');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Shared player fields
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [phone,     setPhone]     = useState('');
  const [handicap,  setHandicap]  = useState('');

  // Starting a team
  const [teamName,  setTeamName]  = useState('');
  const [teammates, setTeammates] = useState<GolferFields[]>([]);

  // Joining a team — the pasted invite and the team it points at
  const [inviteInput,  setInviteInput]  = useState(params.invite ?? '');
  const [preview,      setPreview]      = useState<TeamInvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing,   setPreviewing]   = useState(false);

  // Free-agent pairing prefs
  const [skillLevel,  setSkillLevel]  = useState<SkillLevel | null>(null);
  const [ageGroup,    setAgeGroup]    = useState<AgeGroup | null>(null);
  const [pairingNote, setPairingNote] = useState('');

  // Success state
  const [confirmedName,      setConfirmedName]      = useState('');
  const [confirmedPlayers,   setConfirmedPlayers]   = useState<string[]>([]);
  const [entryFeeCents,      setEntryFeeCents]      = useState<number | null>(null);
  const [entryFeeSecret,     setEntryFeeSecret]     = useState<string | null>(null);
  const [entryFeePaid,       setEntryFeePaid]       = useState(false);
  const [isFreeAgentSuccess, setIsFreeAgentSuccess] = useState(false);
  const [inviteUrl,          setInviteUrl]          = useState<string | null>(null);
  const [inviteExpiresAt,    setInviteExpiresAt]    = useState<string | null>(null);
  const [spotsLeft,          setSpotsLeft]          = useState(0);
  const [joinedTeam,         setJoinedTeam]         = useState(false);

  // The preview is the server's word for this eventId, so it wins: a deep link
  // delivered to an already-open screen keeps that screen's old eventName.
  const eventName   = preview?.eventName || params.eventName || 'this event';
  const isFreeAgent = mode === 'freeAgent';
  const inviteToken = parseInviteToken(inviteInput);

  // A new invite link can arrive while this screen is already open (Android
  // hands the deep link to the running screen), so follow it.
  useEffect(() => {
    if (!params.invite) return;
    setMode('join');
    setInviteInput(params.invite);
    setError(null);
  }, [params.invite]);

  // Look the team up as soon as a whole token is pasted. The debounce keeps
  // typing from firing a request per keystroke; a stale reply is dropped.
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    if (mode !== 'join' || !inviteToken) { setPreviewing(false); return; }

    let current = true;
    setPreviewing(true);
    const timer = setTimeout(() => {
      fetchInvitePreview(eventId, inviteToken)
        .then(p => { if (current) setPreview(p); })
        .catch((e: unknown) => {
          if (!current) return;
          setPreviewError(e instanceof ApiError && e.status === 404
            ? `This invite isn't for ${params.eventName || 'this event'}. Check you picked the right event.`
            : e instanceof Error ? e.message : 'Couldn\'t check that invite. Please try again.');
        })
        .finally(() => { if (current) setPreviewing(false); });
    }, 400);
    return () => { current = false; clearTimeout(timer); };
  }, [mode, inviteToken, eventId, params.eventName]);

  const addTeammate    = useCallback(() => setTeammates(p => [...p, emptyTeammate()]), []);
  const removeTeammate = useCallback((idx: number) => {
    setTeammates(p => p.filter((_, i) => i !== idx)); setError(null);
  }, []);
  const updateTeammate = useCallback((idx: number, field: keyof GolferFields, value: string) => {
    setTeammates(p => p.map((t, i) => i === idx ? { ...t, [field]: value } : t)); setError(null);
  }, []);

  async function handleRegister() {
    // You are the organizer's contact for the team (or for yourself as a free
    // agent), so your phone is required; teammates' is optional.
    const me: GolferFields = { firstName, lastName, email, phone, handicap };
    const myProblem = validateGolfer(me, { phoneRequired: true });
    if (myProblem) { setError(myProblem); return; }

    if (mode === 'team' && !teamName.trim()) { setError('Enter a name for your team.'); return; }
    if (mode === 'join' && !preview) {
      setError(previewError ?? (inviteToken
        ? 'Still checking your invite — try again in a moment.'
        : 'Paste the invite link or code your team captain sent you.'));
      return;
    }
    if (mode === 'join' && preview?.isFull) { setError(`${preview.teamName} is already full.`); return; }

    if (mode === 'team') {
      const rosterProblem = validateRoster([me, ...teammates], {
        first:      { phoneRequired: true },
        otherLabel: i => `Teammate ${i}`,
      });
      if (rosterProblem) { setError(rosterProblem); return; }
    }

    const player = toPlayerInput(me);
    const fn = player.firstName;
    const ln = player.lastName;

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
        setEntryFeeSecret(result.entryFeeClientSecret ?? null);
        setIsFreeAgentSuccess(true);
        setStep('success');
        return;
      }

      if (mode === 'join' && preview && inviteToken) {
        const result = await joinTeam(eventId, { inviteToken, player });
        setConfirmedName(preview.teamName);
        setConfirmedPlayers([...preview.playerNames, `${fn} ${ln}`]);
        setEntryFeeCents(result.entryFeeCents ?? null);
        setEntryFeeSecret(result.entryFeeClientSecret ?? null);
        setIsFreeAgentSuccess(false);
        setJoinedTeam(true);
        setStep('success');
        return;
      }

      const players = [player, ...teammates.map(toPlayerInput)];

      const result = await registerTeam(eventId, teamName.trim(), players);
      setConfirmedName(teamName.trim());
      setConfirmedPlayers(players.map(p => `${p.firstName} ${p.lastName}`));
      setEntryFeeCents(result.entryFeeCents ?? null);
      setEntryFeeSecret(result.entryFeeClientSecret ?? null);
      setInviteUrl(result.inviteUrl ?? null);
      setInviteExpiresAt(result.inviteExpiresAt ?? null);
      setSpotsLeft(Math.max(0, (result.team.maxPlayers ?? 0) - players.length));
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
      <GfpLogo variant="onLight" size={56} />
      <Text style={[styles.logoTitle, { color: theme.colors.primary }]}>GFP Scorer</Text>
      <Text style={[styles.logoSub,   { color: theme.mutedText }]}>Golf Fundraiser Pro</Text>
    </View>
  );

  // ── SUCCESS ───────────────────────────────────────────────────────────────────

  if (step === 'success') {
    return (
      <View style={c.screen}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {logo}
          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={[styles.heading, { color: theme.colors.primary }]}>You're Registered!</Text>

            {isFreeAgentSuccess ? (
              <Text style={[styles.sub, { color: theme.mutedText }]}>
                <Text style={{ fontWeight: '700' }}>{confirmedName}</Text> has been added to the free agent pool for{' '}
                <Text style={{ fontWeight: '700' }}>{eventName}</Text>.{'\n\n'}
                The organizer will assign you to a team before the event starts.
              </Text>
            ) : joinedTeam ? (
              <Text style={[styles.sub, { color: theme.mutedText }]}>
                You&apos;ve joined <Text style={{ fontWeight: '700' }}>{confirmedName}</Text> for{' '}
                <Text style={{ fontWeight: '700' }}>{eventName}</Text>.
              </Text>
            ) : (
              <Text style={[styles.sub, { color: theme.mutedText }]}>
                <Text style={{ fontWeight: '700' }}>{confirmedName}</Text> has been added to{' '}
                <Text style={{ fontWeight: '700' }}>{eventName}</Text>.
              </Text>
            )}

            <View style={[styles.rosterBox, { backgroundColor: theme.colors.primary + '0d', borderColor: theme.colors.primary + '33' }]}>
              <Text style={[styles.rosterLabel, { color: theme.colors.primary }]}>
                {joinedTeam
                  ? `${confirmedPlayers.length} on the team`
                  : confirmedPlayers.length === 1 ? '1 player registered' : `${confirmedPlayers.length} players registered`}
              </Text>
              {confirmedPlayers.map((name, i) => {
                const captain = !isFreeAgentSuccess && !joinedTeam && i === 0;
                const you     = joinedTeam && i === confirmedPlayers.length - 1;
                return (
                  <Text key={i} style={[styles.rosterRow, { color: theme.mutedText }]}>
                    {captain || you ? '★ ' : '  '}{name}
                    {captain ? ' (captain)' : you ? ' (you)' : ''}
                  </Text>
                );
              })}
            </View>

            {inviteUrl && (
              <InviteTeammatesCard
                url={inviteUrl}
                expiresAt={inviteExpiresAt}
                spotsLeft={spotsLeft}
                teamName={confirmedName}
                eventName={eventName}
              />
            )}

            {entryFeeCents != null && entryFeeCents > 0 && (
              entryFeePaid ? (
                <View style={[styles.feeNotice, { backgroundColor: '#f0faf3', borderColor: status.success }]}>
                  <Text style={[styles.feeNoticeTitle, { color: '#1e8449' }]}>✓ Entry Fee Paid</Text>
                  <Text style={styles.feeNoticeText}>
                    Your {formatCentsShort(entryFeeCents)} entry fee has been paid. See you on the course!
                  </Text>
                </View>
              ) : entryFeeSecret && STRIPE_PK ? (
                <StripeProvider publishableKey={STRIPE_PK}>
                  <EntryFeePayCard
                    clientSecret={entryFeeSecret}
                    amountCents={entryFeeCents}
                    golferCount={confirmedPlayers.length}
                    onPaid={() => setEntryFeePaid(true)}
                  />
                </StripeProvider>
              ) : (
                <View style={[styles.feeNotice, { backgroundColor: '#fffbf0', borderColor: status.warning }]}>
                  <Text style={styles.feeNoticeTitle}>Entry Fee Due</Text>
                  <Text style={styles.feeNoticeText}>
                    This event has a {formatCentsShort(entryFeeCents)} entry fee.
                    You can pay at event check-in.
                  </Text>
                </View>
              )
            )}

            <Text style={[styles.successNote, { color: theme.mutedText }]}>
              {isFreeAgentSuccess || joinedTeam
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
      style={c.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {logo}

        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backBtnText, { color: theme.mutedText }]}>← Back</Text>
        </Pressable>

        <View style={[styles.eventBanner, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary + '44' }]}>
          <Text style={[styles.eventBannerLabel, { color: theme.mutedText }]}>Registering for</Text>
          <Text style={[styles.eventBannerName,  { color: theme.colors.primary }]} numberOfLines={2}>{eventName}</Text>
        </View>

        {error && (
          <View style={[c.errorBox, styles.errorBox]}>
            <Text style={c.errorText}>{error}</Text>
          </View>
        )}

        {/* ── Your Information ── */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Your Information</Text>

          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={c.fieldLabel}>First Name *</Text>
              <TextInput
                style={c.inputLg}
                value={firstName} onChangeText={v => { setFirstName(v); setError(null); }}
                placeholder="Jane" placeholderTextColor="#aaa"
                autoCapitalize="words" autoCorrect={false} editable={!submitting} autoFocus
              />
            </View>
            <View style={styles.halfField}>
              <Text style={c.fieldLabel}>Last Name *</Text>
              <TextInput
                style={c.inputLg}
                value={lastName} onChangeText={v => { setLastName(v); setError(null); }}
                placeholder="Smith" placeholderTextColor="#aaa"
                autoCapitalize="words" autoCorrect={false} editable={!submitting}
              />
            </View>
          </View>

          <Text style={c.fieldLabel}>Email *</Text>
          <TextInput
            style={c.inputLg}
            value={email} onChangeText={v => { setEmail(v); setError(null); }}
            placeholder="you@example.com" placeholderTextColor="#aaa"
            autoCapitalize="none" keyboardType="email-address" autoComplete="email" editable={!submitting}
          />

          <Text style={c.fieldLabel}>Phone *</Text>
          <TextInput
            style={c.inputLg}
            value={phone} onChangeText={v => { setPhone(fmtPhoneInput(digitsOnly(v))); setError(null); }}
            placeholder="(555) 867-5309" placeholderTextColor="#aaa"
            keyboardType="phone-pad" editable={!submitting}
          />

          <Text style={c.fieldLabel}>
            Handicap Index <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={c.inputLg}
            value={handicap} onChangeText={v => { setHandicap(v); setError(null); }}
            placeholder="e.g. 14.2" placeholderTextColor="#aaa"
            keyboardType="decimal-pad" editable={!submitting}
          />
        </View>

        {/* ── Team section ── */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Team</Text>

          <View style={[styles.chipRow, styles.modeRow]} accessibilityRole="radiogroup">
            {MODE_OPTIONS.filter(opt => opt.value !== 'freeAgent' || freeAgentEnabled !== '0').map(opt => {
              const on = mode === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.chip,
                    { borderColor: theme.colors.accent },
                    on && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
                  ]}
                  onPress={() => { setMode(opt.value); setError(null); }}
                  disabled={submitting}
                  accessibilityRole="radio" accessibilityState={{ checked: on }}
                >
                  <Text style={[styles.chipText, { color: on ? theme.buttonLabel : theme.mutedText }]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {mode === 'team' && (
            <>
              <Text style={c.fieldLabel}>Team Name *</Text>
              <TextInput
                style={c.inputLg}
                value={teamName} onChangeText={v => { setTeamName(v); setError(null); }}
                placeholder="e.g. The Bogey Brothers"
                placeholderTextColor="#aaa"
                autoCapitalize="words" editable={!submitting}
              />
              <Text style={[styles.fieldHint, { color: theme.mutedText }]}>
                You&apos;ll be the captain. Add teammates below, or send them a link after you register.
              </Text>
            </>
          )}

          {mode === 'join' && (
            <>
              <Text style={c.fieldLabel}>Invite Link or Code *</Text>
              <TextInput
                style={c.inputLg}
                value={inviteInput} onChangeText={v => { setInviteInput(v); setError(null); }}
                placeholder="Paste the link your captain sent you"
                placeholderTextColor="#aaa"
                autoCapitalize="none" autoCorrect={false} editable={!submitting}
                accessibilityLabel="Invite link or code"
              />
              {inviteInput.trim() !== '' && !inviteToken && (
                <Text style={[styles.fieldHint, { color: status.dangerText }]}>
                  That doesn&apos;t look like an invite. Paste the whole link from your captain.
                </Text>
              )}
              {previewing && (
                <Text style={[styles.fieldHint, { color: theme.mutedText }]}>Checking your invite…</Text>
              )}
              {previewError && (
                <Text style={[styles.fieldHint, { color: status.dangerText }]}>{previewError}</Text>
              )}
              {preview && (
                <View style={[styles.rosterBox, { backgroundColor: theme.colors.primary + '0d', borderColor: theme.colors.primary + '33' }]}>
                  <Text style={[styles.rosterLabel, { color: theme.colors.primary }]}>{preview.teamName}</Text>
                  {preview.playerNames.map((name, i) => (
                    <Text key={i} style={[styles.rosterRow, { color: theme.mutedText }]}>  {name}</Text>
                  ))}
                  <Text style={[styles.fieldHint, { color: preview.isFull ? '#c0392b' : theme.mutedText }]}>
                    {preview.isFull
                      ? 'This team is full.'
                      : `${preview.spotsRemaining} spot${preview.spotsRemaining === 1 ? '' : 's'} left`}
                  </Text>
                </View>
              )}
            </>
          )}

          {isFreeAgent && (
            <View style={[styles.assignNotice, { backgroundColor: theme.colors.highlight, borderColor: theme.colors.primary + '44' }]}>
              <Text style={[styles.assignNoticeText, { color: theme.colors.primary }]}>
                You&apos;ll join the free agent pool, and the organizer will put you on a team before the event starts.
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
            <Text style={[styles.fieldHint, { color: theme.mutedText, marginTop: 0, marginBottom: spacing[2] }]}>
              Help the organizer match you with the right team.
            </Text>

            <Text style={c.fieldLabel}>Skill Level</Text>
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
                  <Text style={[styles.chipText, { color: skillLevel === opt.value ? '#fff' : theme.mutedText }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={c.fieldLabel}>Age Group</Text>
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
                  <Text style={[styles.chipText, { color: ageGroup === opt.value ? '#fff' : theme.mutedText }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={c.fieldLabel}>Note to Organizer</Text>
            <TextInput
              style={[c.inputLg, styles.textArea]}
              value={pairingNote} onChangeText={setPairingNote}
              placeholder="e.g. I know the Johnson family — please pair me with them if possible."
              placeholderTextColor="#aaa" multiline numberOfLines={3} maxLength={PAIRING_NOTE_MAX} editable={!submitting}
            />
          </View>
        )}

        {/* ── Teammates (captain only) ── */}
        {mode === 'team' && (
          <>
            <View style={styles.teammatesHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Teammates</Text>
              <Text style={[styles.teammateBadge, { color: theme.mutedText }]}>
                {teammates.length} / {MAX_TEAMMATES}
              </Text>
            </View>

            {teammates.map((tm, idx) => (
              <View key={idx} style={[styles.card, styles.teammateCard, { backgroundColor: theme.colors.surface }]}>
                <View style={styles.teammateCardHeader}>
                  <Text style={[styles.teammateCardTitle, { color: theme.colors.primary }]}>Teammate {idx + 1}</Text>
                  <Pressable onPress={() => removeTeammate(idx)} style={styles.removeBtn} hitSlop={8}>
                    <Text style={[styles.removeBtnText, { color: theme.mutedText }]}>✕ Remove</Text>
                  </Pressable>
                </View>
                <View style={styles.row}>
                  <View style={styles.halfField}>
                    <Text style={c.fieldLabel}>First Name *</Text>
                    <TextInput
                      style={c.inputLg}
                      value={tm.firstName} onChangeText={v => updateTeammate(idx, 'firstName', v)}
                      placeholder="Alex" placeholderTextColor="#aaa" autoCapitalize="words" autoCorrect={false} editable={!submitting}
                    />
                  </View>
                  <View style={styles.halfField}>
                    <Text style={c.fieldLabel}>Last Name *</Text>
                    <TextInput
                      style={c.inputLg}
                      value={tm.lastName} onChangeText={v => updateTeammate(idx, 'lastName', v)}
                      placeholder="Jones" placeholderTextColor="#aaa" autoCapitalize="words" autoCorrect={false} editable={!submitting}
                    />
                  </View>
                </View>
                <Text style={c.fieldLabel}>Email *</Text>
                <TextInput
                  style={c.inputLg}
                  value={tm.email} onChangeText={v => updateTeammate(idx, 'email', v)}
                  placeholder="teammate@example.com" placeholderTextColor="#aaa"
                  autoCapitalize="none" keyboardType="email-address" autoComplete="email" editable={!submitting}
                />
                <View style={styles.row}>
                  <View style={styles.halfField}>
                    <Text style={c.fieldLabel}>
                      Phone <Text style={styles.optional}>(optional)</Text>
                    </Text>
                    <TextInput
                      style={c.inputLg}
                      value={tm.phone ?? ''} onChangeText={v => updateTeammate(idx, 'phone', fmtPhoneInput(digitsOnly(v)))}
                      placeholder="(555) 867-5309" placeholderTextColor="#aaa"
                      keyboardType="phone-pad" editable={!submitting}
                    />
                  </View>
                  <View style={styles.halfField}>
                    <Text style={c.fieldLabel}>
                      Handicap <Text style={styles.optional}>(optional)</Text>
                    </Text>
                    <TextInput
                      style={c.inputLg}
                      value={tm.handicap ?? ''} onChangeText={v => updateTeammate(idx, 'handicap', v)}
                      placeholder="e.g. 14.2" placeholderTextColor="#aaa"
                      keyboardType="decimal-pad" editable={!submitting}
                    />
                  </View>
                </View>
              </View>
            ))}

            {teammates.length < MAX_TEAMMATES && (
              <Text style={[styles.fieldHint, { color: theme.mutedText, marginBottom: spacing[3] }]}>
                Don&apos;t have everyone&apos;s details? After you register you&apos;ll get a link to send
                the rest of your team so they can sign themselves up.
              </Text>
            )}

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
                  : mode === 'join'
                    ? preview ? `Join ${preview.teamName}` : 'Join Team'
                    : `Register Team${teammates.length > 0 ? ` (${teammates.length + 1} players)` : ''}`}
              </Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── INVITE TEAMMATES ─────────────────────────────────────────────────────────
// The captain's link for teammates who weren't on the form. It opens the web
// event page with "Join a Team" filled in for this team, where they enter
// their own details and pay their own share. Share opens the OS share sheet
// (text, email, WhatsApp…); on web it uses the browser's share or copies.

interface InviteTeammatesCardProps {
  url:       string;
  expiresAt: string | null;
  spotsLeft: number;
  teamName:  string;
  eventName: string;
}

function InviteTeammatesCard({ url, expiresAt, spotsLeft, teamName, eventName }: InviteTeammatesCardProps) {
  const theme = useTheme();
  const [shareError, setShareError] = useState<string | null>(null);

  async function handleShare() {
    setShareError(null);
    const message = `Join my team "${teamName}" for ${eventName}: ${url}`;
    try {
      // iOS shows `url` as a link preview alongside the message; Android and
      // web read the message, which already carries the link.
      await Share.share(Platform.OS === 'ios' ? { message: `Join my team "${teamName}" for ${eventName}`, url } : { message });
    } catch {
      setShareError("Couldn't open sharing on this device — press and hold the link to copy it.");
    }
  }

  const until = expiresAt
    ? new Date(expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <View style={[styles.inviteCard, { borderColor: theme.colors.primary + '55', backgroundColor: theme.colors.primary + '0d' }]}>
      <Text style={[styles.inviteTitle, { color: theme.colors.primary }]}>Invite your teammates</Text>
      <Text style={[styles.inviteText, { color: theme.mutedText }]}>
        {spotsLeft > 0 ? `Your team has ${spotsLeft} open spot${spotsLeft === 1 ? '' : 's'}. ` : ''}
        Send this link to the rest of your team so they can sign themselves up.
      </Text>
      <Text selectable style={[styles.inviteUrl, { color: theme.colors.primary }]}>{url}</Text>
      <Pressable
        style={({ pressed }) => [styles.shareBtn, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.8 : 1 }]}
        onPress={handleShare}
        accessibilityRole="button"
        accessibilityLabel="Share the team invite link"
      >
        <Text style={[styles.shareBtnText, { color: theme.buttonLabel }]}>Share Invite Link</Text>
      </Pressable>
      {shareError && <Text style={styles.feePayError}>{shareError}</Text>}
      {until && (
        <Text style={[styles.inviteNote, { color: theme.mutedText }]}>
          Works until the tournament starts ({until}) or your team fills up.
        </Text>
      )}
    </View>
  );
}

// ── ENTRY FEE PAYMENT ────────────────────────────────────────────────────────
// In-app Stripe card payment for the per-golfer entry fee. The registering
// golfer pays for everyone they just registered in one charge. Must be
// rendered inside a StripeProvider.

interface EntryFeePayCardProps {
  clientSecret: string;
  amountCents:  number;
  golferCount:  number;
  onPaid:       () => void;
}

function EntryFeePayCard({ clientSecret, amountCents, golferCount, onPaid }: EntryFeePayCardProps) {
  const { confirmPayment } = useStripe();
  const [cardComplete, setCardComplete] = useState(false);
  const [paying,       setPaying]       = useState(false);
  const [payError,     setPayError]     = useState<string | null>(null);

  async function handlePay() {
    if (!cardComplete || paying) return;
    setPaying(true); setPayError(null);
    try {
      const { paymentIntent, error } = await confirmPayment(clientSecret, {
        paymentMethodType: 'Card',
      });
      if (error) throw new Error(error.message);
      if (!paymentIntent?.id) throw new Error('Payment did not complete.');

      // Record immediately server-side (verified against Stripe); the Stripe
      // webhook is the backstop if this call fails.
      await confirmEntryFee(paymentIntent.id).catch(() => {});
      onPaid();
    } catch (e: unknown) {
      setPayError(e instanceof Error ? e.message : 'Payment failed. Please try again.');
    } finally {
      setPaying(false);
    }
  }

  return (
    <View style={[styles.feeNotice, { backgroundColor: '#fffbf0', borderColor: status.warning }]}>
      <Text style={styles.feeNoticeTitle}>Entry Fee Due</Text>
      <Text style={styles.feeNoticeText}>
        {formatCentsShort(amountCents)}
        {golferCount > 1 ? ` (${golferCount} golfers)` : ''} — pay now by card,
        or pay at event check-in.
      </Text>

      <CardField
        postalCodeEnabled={false}
        cardStyle={{
          backgroundColor: '#fff',
          textColor: '#1a1a1a',
          borderColor: '#d0d0d0',
          borderWidth: 1.5,
          borderRadius: radius.lg,
        }}
        style={styles.feeCardField}
        onCardChange={(details: CardFieldInput.Details) => setCardComplete(details.complete)}
      />

      {payError && <Text style={styles.feePayError}>{payError}</Text>}

      <Pressable
        style={[styles.feePayBtn, { backgroundColor: cardComplete && !paying ? '#27ae60' : '#aaa' }]}
        onPress={handlePay}
        disabled={!cardComplete || paying}
        accessibilityRole="button"
      >
        {paying
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.feePayBtnText}>Pay {formatCentsShort(amountCents)} Now</Text>}
      </Pressable>

      <Text style={styles.feeSecureNote}>Secured by Stripe · Card details never touch our servers</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: spacing[5], paddingBottom: spacing[12] },

  logoRow:   { alignItems: 'center', marginBottom: spacing[8], marginTop: spacing[4] },
  logoTitle: { fontSize: fontSize.display, fontWeight: '800', marginTop: spacing[2] },
  logoSub:   { fontSize: fontSize.sm, fontWeight: '500', marginTop: spacing[1] },

  backBtn:     { marginBottom: spacing[3] },
  backBtnText: { fontSize: fontSize.md, fontWeight: '500' },

  eventBanner: { borderRadius: radius.lg, padding: spacing[4], marginBottom: spacing[4], borderWidth: 1 },
  eventBannerLabel: { fontSize: fontSize.xxs, fontWeight: '600', textTransform: 'uppercase', marginBottom: spacing[1] },
  eventBannerName:  { fontSize: fontSize.xl, fontWeight: '700' },

  errorBox: { borderRadius: radius.lg, padding: spacing[4], marginBottom: spacing[4] },   // over c.errorBox: roomier on a phone

  card: {
    borderRadius: radius.xl, padding: spacing[5], marginBottom: spacing[4],
    boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.07)', elevation: 3,
  },
  heading: { fontSize: fontSize.xxl, fontWeight: '800', marginBottom: spacing[1] },
  sub:     { fontSize: fontSize.md, marginBottom: spacing[5], lineHeight: 20 },

  sectionTitle: { fontSize: fontSize.xl, fontWeight: '700', marginBottom: spacing[2] },

  assignNotice: { borderRadius: radius.lg, padding: spacing[3], marginBottom: spacing[1], borderWidth: 1 },
  assignNoticeText: { fontSize: fontSize.sm, lineHeight: 19 },

  modeRow:        { marginTop: 0, marginBottom: spacing[3] },

  row:       { flexDirection: 'row', gap: spacing[3] },
  halfField: { flex: 1 },

  optional:  { fontSize: fontSize.xs, fontWeight: '400' },
  fieldHint: { fontSize: fontSize.xs, marginTop: spacing[1] },
  textArea: { height: 90, textAlignVertical: 'top', paddingTop: spacing[3] },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[1] },
  chip:    { borderWidth: 1, borderRadius: radius.xxl, paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  chipText:{ fontSize: fontSize.sm, fontWeight: '600' },

  teammatesHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: spacing[3],
  },
  teammateBadge: { fontSize: fontSize.sm, fontWeight: '500' },

  teammateCard:       { paddingTop: spacing[4] },
  teammateCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[0.5] },
  teammateCardTitle:  { fontSize: fontSize.md, fontWeight: '700' },
  removeBtn:          { padding: spacing[1] },
  removeBtnText:      { fontSize: fontSize.sm, fontWeight: '500' },

  addTeammateBtn: {
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.lg,
    paddingVertical: spacing[4], alignItems: 'center', marginBottom: spacing[4],
  },
  addTeammateBtnText: { fontSize: fontSize.lg, fontWeight: '600' },

  submitBtn:        { paddingVertical: spacing[4], borderRadius: radius.lg, alignItems: 'center' },
  submitBtnSpacing: { marginTop: spacing[2] },
  submitBtnText:    { fontSize: fontSize.xl, fontWeight: '700', color: '#fff' },
  homeBtn:          { paddingVertical: spacing[4], borderRadius: radius.lg, alignItems: 'center', borderWidth: 1, marginTop: spacing[3] },
  homeBtnText:      { fontSize: fontSize.lg, fontWeight: '600' },

  successIcon: { fontSize: 48, textAlign: 'center', marginBottom: spacing[3] },
  successNote: { fontSize: fontSize.sm, lineHeight: 20, marginTop: spacing[3], marginBottom: spacing[1] },

  feeNotice:      { borderWidth: 1, borderRadius: radius.lg, padding: spacing[4], marginTop: spacing[3] },
  feeNoticeTitle: { fontSize: fontSize.md, fontWeight: '700', color: '#7d6608', marginBottom: spacing[1] },
  feeNoticeText:  { fontSize: fontSize.sm, lineHeight: 19, color: '#7d6608' },
  feeCardField:   { width: '100%', height: 50, marginTop: spacing[3] },
  feePayError:    { fontSize: fontSize.xs, color: status.dangerText, marginTop: spacing[2] },
  feePayBtn:      { borderRadius: radius.lg, paddingVertical: spacing[3], alignItems: 'center', marginTop: spacing[3] },
  feePayBtnText:  { color: '#fff', fontWeight: '700', fontSize: fontSize.lg },
  feeSecureNote:  { fontSize: fontSize.xxs, color: '#aaa', textAlign: 'center', marginTop: spacing[2] },
  rosterBox:      { borderRadius: radius.lg, borderWidth: 1, padding: spacing[4], marginTop: spacing[4], gap: spacing[1] },
  inviteCard:     { borderRadius: radius.lg, borderWidth: 1, padding: spacing[4], marginTop: spacing[4] },
  inviteTitle:    { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing[1] },
  inviteText:     { fontSize: fontSize.sm, lineHeight: 19 },
  inviteUrl:      { fontSize: fontSize.xs, marginTop: spacing[3], fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  inviteNote:     { fontSize: fontSize.xs, lineHeight: 17, marginTop: spacing[2] },
  shareBtn:       { borderRadius: radius.lg, paddingVertical: spacing[3], alignItems: 'center', marginTop: spacing[3] },
  shareBtnText:   { fontSize: fontSize.lg, fontWeight: '700' },
  rosterLabel:    { fontSize: fontSize.sm, fontWeight: '700', marginBottom: spacing[2] },
  rosterRow:      { fontSize: fontSize.md, lineHeight: 22 },
});
