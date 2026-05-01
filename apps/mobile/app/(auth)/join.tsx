import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, ScrollView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { useSession } from '@/lib/session';
import { joinEvent } from '@/lib/api';

export default function JoinScreen() {
  const theme  = useTheme();
  const router = useRouter();
  const { session, loading, deviceId, setSession } = useSession();

  const [eventCode, setEventCode] = useState('');
  const [email,     setEmail]     = useState('');
  const [error,     setError]     = useState<string | null>(null);
  const [joining,   setJoining]   = useState(false);

  // Resume existing session without re-joining
  useEffect(() => {
    if (!loading && session) {
      router.replace('/scorecard');
    }
  }, [loading, session]);

  async function handleJoin() {
    const code   = eventCode.trim().toUpperCase();
    const emailT = email.trim().toLowerCase();
    if (!code)   { setError('Event code is required.'); return; }
    if (!emailT) { setError('Email address is required.'); return; }
    setError(null);
    setJoining(true);
    try {
      const data = await joinEvent(code, emailT, deviceId);
      await setSession(data);
      router.replace('/preflight');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not join event. Check your code and email.');
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

  return (
    <KeyboardAvoidingView
      style={[styles.page, { backgroundColor: theme.pageBackground }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={styles.logoRow}>
          <Text style={styles.logoEmoji}>⛳</Text>
          <Text style={[styles.logoTitle, { color: theme.colors.primary }]}>GFP Scorer</Text>
          <Text style={[styles.logoSub,   { color: theme.colors.accent }]}>Golf Fundraiser Pro</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.heading, { color: theme.colors.primary }]}>Join Your Event</Text>
          <Text style={[styles.sub,     { color: theme.colors.accent }]}>
            Enter the event code and your registered email address.
          </Text>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Text style={[styles.label, { color: theme.colors.primary }]}>Event Code</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
            value={eventCode}
            onChangeText={v => setEventCode(v.toUpperCase())}
            placeholder="e.g. ABC12345"
            placeholderTextColor="#aaa"
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="next"
            editable={!joining}
          />

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

        <Text style={[styles.hint, { color: theme.colors.accent }]}>
          Your event code is on the tournament sign-in sheet or was sent by the organizer.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page:    { flex: 1 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:  { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoRow: { alignItems: 'center', marginBottom: 32 },
  logoEmoji: { fontSize: 48 },
  logoTitle: { fontSize: 28, fontWeight: '800', marginTop: 8 },
  logoSub:   { fontSize: 13, fontWeight: '500', marginTop: 4 },
  card: {
    borderRadius: 16, padding: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  heading: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  sub:     { fontSize: 14, marginBottom: 20 },
  label:   { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 14 },
  input:   {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, backgroundColor: '#fafafa',
  },
  joinBtn: {
    marginTop: 24, paddingVertical: 16,
    borderRadius: 12, alignItems: 'center',
  },
  joinBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  errorBox: {
    backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, marginBottom: 4,
    borderLeftWidth: 3, borderLeftColor: '#e74c3c',
  },
  errorText: { color: '#c0392b', fontSize: 14 },
  hint: { textAlign: 'center', fontSize: 13, marginTop: 20, lineHeight: 18 },
});
