import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, ActivityIndicator, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export default function RegisterScreen() {
  const theme  = useTheme();
  const router = useRouter();
  const { register } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [orgName,     setOrgName]     = useState('');
  const [orgSlug,     setOrgSlug]     = useState('');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [confirmPw,   setConfirmPw]   = useState('');
  const [is501c3,     setIs501c3]     = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleOrgNameChange = useCallback((v: string) => {
    setOrgName(v);
    setOrgSlug(toSlug(v));
    if (fieldErrors.orgName) setFieldErrors(p => ({ ...p, orgName: '' }));
  }, [fieldErrors.orgName]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!displayName.trim()) errs.displayName = 'Your name is required.';
    if (!orgName.trim())     errs.orgName     = 'Organization name is required.';
    if (!orgSlug.trim())     errs.orgSlug     = 'URL slug is required.';
    else if (!/^[a-z0-9-]+$/.test(orgSlug))
      errs.orgSlug = 'Slug must be lowercase letters, numbers, and hyphens only.';
    if (!email.trim())       errs.email       = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = 'Enter a valid email address.';
    if (!password)           errs.password    = 'Password is required.';
    else if (password.length < 8)
      errs.password = 'Password must be at least 8 characters.';
    if (!confirmPw)          errs.confirmPw   = 'Please confirm your password.';
    else if (confirmPw !== password)
      errs.confirmPw = 'Passwords do not match.';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleRegister() {
    if (!validate()) return;
    setError(null);
    setLoading(true);
    try {
      await register({
        email:       email.trim(),
        password,
        displayName: displayName.trim(),
        orgName:     orgName.trim(),
        orgSlug:     orgSlug.trim(),
        is501c3,
      });
      // AuthGate will redirect to /(app)/events after user state updates
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409)
          setError('That URL slug is already taken. Try a different one.');
        else if (e.status === 400 && e.message.toLowerCase().includes('email'))
          setFieldErrors(p => ({ ...p, email: 'An account with this email already exists.' }));
        else
          setError(e.message || 'Registration failed. Please try again.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  function Field({
    label, value, onChangeText, placeholder, secureTextEntry,
    keyboardType, autoCapitalize, errorKey, hint,
  }: {
    label: string; value: string; onChangeText: (v: string) => void;
    placeholder?: string; secureTextEntry?: boolean;
    keyboardType?: 'default' | 'email-address' | 'numeric';
    autoCapitalize?: 'none' | 'words' | 'sentences';
    errorKey: string; hint?: string;
  }) {
    const err = fieldErrors[errorKey];
    return (
      <View style={styles.fieldWrap}>
        <Text style={[styles.label, { color: theme.colors.primary }]}>{label}</Text>
        <TextInput
          style={[styles.input, { borderColor: err ? '#e74c3c' : theme.colors.accent }]}
          value={value}
          onChangeText={v => {
            onChangeText(v);
            if (fieldErrors[errorKey]) setFieldErrors(p => ({ ...p, [errorKey]: '' }));
          }}
          placeholder={placeholder}
          placeholderTextColor="#aaa"
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize ?? 'sentences'}
          autoCorrect={false}
          editable={!loading}
        />
        {hint && !err && <Text style={[styles.hint, { color: theme.colors.accent }]}>{hint}</Text>}
        {err ? <Text style={styles.fieldError}>{err}</Text> : null}
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.page, { backgroundColor: '#f4f7de' }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push('/(public)/' as any)} style={styles.backBtn}>
          <Text style={[styles.backText, { color: theme.colors.primary }]}>← Back</Text>
        </Pressable>
        <Text style={[styles.logo, { color: theme.colors.primary }]}>⛳ GFP</Text>
      </View>

      <View style={styles.card}>
        <Text style={[styles.heading, { color: theme.colors.primary }]}>Create your account</Text>
        <Text style={[styles.subheading, { color: theme.colors.accent }]}>
          Set up your organization and run your first event in minutes.
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Field
          label="Your Name *"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Jane Smith"
          autoCapitalize="words"
          errorKey="displayName"
        />

        <Field
          label="Organization Name *"
          value={orgName}
          onChangeText={handleOrgNameChange}
          placeholder="Clear Lake High School Boosters"
          autoCapitalize="words"
          errorKey="orgName"
        />

        <Field
          label="Event URL Slug *"
          value={orgSlug}
          onChangeText={v => { setOrgSlug(toSlug(v)); setFieldErrors(p => ({ ...p, orgSlug: '' })); }}
          placeholder="clhs-boosters"
          autoCapitalize="none"
          errorKey="orgSlug"
          hint={`Your public event links will use: /e/${orgSlug || 'your-slug'}/EVENT-CODE`}
        />

        <Field
          label="Email Address *"
          value={email}
          onChangeText={setEmail}
          placeholder="organizer@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          errorKey="email"
        />

        <Field
          label="Password *"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          secureTextEntry
          errorKey="password"
        />

        <Field
          label="Confirm Password *"
          value={confirmPw}
          onChangeText={setConfirmPw}
          placeholder="Repeat your password"
          secureTextEntry
          errorKey="confirmPw"
        />

        {/* 501(c)3 toggle */}
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.colors.primary, marginBottom: 2 }]}>
              501(c)(3) Non-Profit
            </Text>
            <Text style={[styles.hint, { color: theme.colors.accent }]}>
              Enables IRS tax-deductibility language in donation receipts.
            </Text>
          </View>
          <Switch
            value={is501c3}
            onValueChange={setIs501c3}
            trackColor={{ true: theme.colors.primary }}
            disabled={loading}
          />
        </View>

        <Pressable
          style={[
            styles.submitBtn,
            { backgroundColor: theme.colors.primary },
            loading && { opacity: 0.6 },
          ]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitText}>Create Account & Start →</Text>}
        </Pressable>

        <View style={styles.signinRow}>
          <Text style={[styles.signinText, { color: theme.colors.accent }]}>Already have an account? </Text>
          <Pressable onPress={() => router.push('/(auth)/login')}>
            <Text style={[styles.signinLink, { color: theme.colors.primary }]}>Sign in</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page:    { flex: 1 },
  content: { padding: 20, paddingBottom: 60, alignItems: 'center' },

  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 520, marginBottom: 20 },
  backBtn:  { paddingVertical: 6, paddingHorizontal: 4 },
  backText: { fontSize: 14, fontWeight: '600' },
  logo:     { fontSize: 20, fontWeight: '800' },

  card:       { width: '100%', maxWidth: 520, backgroundColor: '#fff', borderRadius: 20, padding: 32, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  heading:    { fontSize: 24, fontWeight: '900', marginBottom: 8 },
  subheading: { fontSize: 14, lineHeight: 22, marginBottom: 20 },

  fieldWrap: { marginBottom: 4 },
  label:     { fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 6 },
  input:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, backgroundColor: '#fafafa' },
  hint:      { fontSize: 12, marginTop: 4 },
  fieldError:{ color: '#e74c3c', fontSize: 12, marginTop: 4 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, marginBottom: 4 },

  errorBox:  { backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
  errorText: { color: '#c0392b', fontSize: 14 },

  submitBtn:  { marginTop: 24, paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  submitText: { fontSize: 16, fontWeight: '800', color: '#fff' },

  signinRow:  { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  signinText: { fontSize: 14 },
  signinLink: { fontSize: 14, fontWeight: '700' },
});
