import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, ActivityIndicator, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, useClasses } from '@gfp/ui';
import { GfpLogo } from '@/components/GfpLogo';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { fontSize, radius, spacing, status } from '@gfp/theme';

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export default function RegisterScreen() {
  const theme  = useTheme();
  const c      = useClasses();
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
        <Text style={[c.fieldLabel, styles.label]}>{label}</Text>
        <TextInput
          style={[c.input, styles.input, !!err && c.inputError]}
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
        {hint && !err && <Text style={[styles.hint, { color: theme.mutedText }]}>{hint}</Text>}
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
        <Pressable
          onPress={() => router.push('/(public)/' as any)} style={styles.backBtn}>
          <Text style={[styles.backText, { color: theme.colors.primary }]}>← Back</Text>
        </Pressable>
        <View style={styles.logoRow}>
          <GfpLogo variant="onLight" size={28} />
          <Text style={[styles.logo, { color: theme.colors.primary }]}>GFP</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={[styles.heading, { color: theme.colors.primary }]}>Create your account</Text>
        <Text style={[styles.subheading, { color: theme.mutedText }]}>
          Set up your organization and run your first event in minutes.
        </Text>

        {error && (
          <View style={[c.errorBox, styles.errorBox]}>
            <Text style={c.errorText}>{error}</Text>
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
            <Text style={[c.fieldLabel, styles.label, { marginBottom: spacing[0.5] }]}>
              501(c)(3) Non-Profit
            </Text>
            <Text style={[styles.hint, { color: theme.mutedText }]}>
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
          <Text style={[styles.signinText, { color: theme.mutedText }]}>Already have an account? </Text>
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
  content: { padding: spacing[5], paddingBottom: 60, alignItems: 'center' },

  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 520, marginBottom: spacing[5] },
  backBtn:  { paddingVertical: spacing[2], paddingHorizontal: spacing[1] },
  backText: { fontSize: fontSize.md, fontWeight: '600' },
  logoRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  logo:     { fontSize: fontSize.xxl, fontWeight: '800' },

  card:       { width: '100%', maxWidth: 520, backgroundColor: '#fff', borderRadius: radius.xxl, padding: spacing[8], boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.08)', elevation: 4 },
  heading:    { fontSize: fontSize.title, fontWeight: '900', marginBottom: spacing[2] },
  subheading: { fontSize: fontSize.md, lineHeight: 22, marginBottom: spacing[5] },

  fieldWrap: { marginBottom: spacing[1] },
  label:     { marginTop: spacing[4] },   // over c.fieldLabel
  input:     { paddingHorizontal: spacing[4] },   // over c.input
  hint:      { fontSize: fontSize.xs, marginTop: spacing[1] },
  fieldError:{ color: status.danger, fontSize: fontSize.xs, marginTop: spacing[1] },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: spacing[4], marginBottom: spacing[1] },

  errorBox:  { marginBottom: spacing[2] },   // over c.errorBox

  submitBtn:  { marginTop: spacing[6], paddingVertical: spacing[4], borderRadius: radius.lg, alignItems: 'center' },
  submitText: { fontSize: fontSize.xl, fontWeight: '800', color: '#fff' },

  signinRow:  { flexDirection: 'row', justifyContent: 'center', marginTop: spacing[5] },
  signinText: { fontSize: fontSize.md },
  signinLink: { fontSize: fontSize.md, fontWeight: '700' },
});
