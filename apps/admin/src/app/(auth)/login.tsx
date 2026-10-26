import { useState } from 'react';
import {
  View, Text, TextInput, Pressable,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { useTheme } from '@gfp/ui';
import { GfpLogo } from '@/components/GfpLogo';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { AuthLink } from '@/components/AuthCard';
import { useRouter } from 'expo-router';
import { fontSize, radius, spacing } from '@gfp/theme';

export default function LoginScreen() {
  const theme = useTheme();
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
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={[styles.label, { color: theme.colors.primary }]}>Email</Text>
        <TextInput
          style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
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

        <Text style={[styles.label, { color: theme.colors.primary }]}>Password</Text>
        <TextInput
          style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
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
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing[2],
    marginTop: spacing[4],
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: fontSize.lg,
    backgroundColor: '#fafafa',
  },
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
  errorBox: {
    backgroundColor: '#fdf2f2',
    borderRadius: radius.md,
    padding: spacing[3],
    marginBottom: spacing[2],
    borderLeftWidth: 3,
    borderLeftColor: '#e74c3c',
  },
  errorText: {
    color: '#c0392b',
    fontSize: fontSize.md,
  },
});
