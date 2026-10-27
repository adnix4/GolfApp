import { useState } from 'react';
import {
  View, Text, TextInput, Pressable,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { useTheme, useClasses } from '@gfp/ui';
import { GfpLogo } from '@/components/GfpLogo';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { AuthLink } from '@/components/AuthCard';
import { useRouter } from 'expo-router';
import { fontSize, radius, spacing } from '@gfp/theme';

export default function LoginScreen() {
  const theme = useTheme();
  const c = useClasses();
  const { login } = useAuth();
  const router = useRouter();
  useDocumentTitle('Golf Fundraiser Pro');

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.page, { backgroundColor: theme.pageBackground }]}>
      <KeyboardAvoidingView style={styles.card}>
        {/* Logo / wordmark */}
        <View style={styles.logoRow}>
          <View style={styles.logoMarkRow}>
            <GfpLogo variant="onLight" size={46} />
            <Text style={[styles.logoText, { color: theme.colors.primary }]}>GFP</Text>
          </View>
          <Text style={[styles.logoSub, { color: theme.mutedText }]}>Admin Dashboard</Text>
        </View>

        <Text style={[styles.heading, { color: theme.colors.primary }]}>Sign in</Text>

        {error && (
          <View style={[c.errorBox, styles.errorBox]}>
            <Text style={c.errorText}>{error}</Text>
          </View>
        )}

        <Text style={[c.fieldLabel, styles.label]}>Email</Text>
        <TextInput
          style={[c.input, styles.input, { color: theme.colors.primary }]}
          value={email}
          onChangeText={setEmail}
          placeholder="organizer@email.com"
          placeholderTextColor="#999"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          returnKeyType="next"
          editable={!loading}
        />

        <Text style={[c.fieldLabel, styles.label]}>Password</Text>
        <TextInput
          style={[c.input, styles.input, { color: theme.colors.primary }]}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor="#999"
          secureTextEntry
          autoComplete="current-password"
          returnKeyType="done"
          onSubmitEditing={handleLogin}
          editable={!loading}
        />

        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
            loading && styles.buttonDisabled,
          ]}
          onPress={handleLogin}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
        >
          {loading
            ? <ActivityIndicator color={theme.colors.surface} />
            : <Text style={[styles.buttonText, { color: theme.colors.surface }]}>Sign in</Text>
          }
        </Pressable>

        {/* problemList D21: there was no way back in from a forgotten password. */}
        <AuthLink label="Forgot password?" onPress={() => router.push('/(auth)/forgot-password')} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[6],
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: radius.xl,
    padding: spacing[10],
    boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.08)',
  },
  logoRow: {
    alignItems: 'center',
    marginBottom: spacing[8],
  },
  logoMarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  logoText: {
    fontSize: 32,
    fontWeight: '800',
  },
  logoSub: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing[1],
  },
  heading: {
    fontSize: fontSize.title,
    fontWeight: '700',
    marginBottom: spacing[5],
  },
  label: { marginTop: spacing[4] },   // over c.fieldLabel
  input: { paddingHorizontal: spacing[4] },   // over c.input
  button: {
    marginTop: spacing[8],
    paddingVertical: spacing[4],
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  errorBox: { marginBottom: spacing[2] },   // over c.errorBox
});
