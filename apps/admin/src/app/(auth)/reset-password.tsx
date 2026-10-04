import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authApi } from '@/lib/api';
import { friendlyApiError } from '@/lib/errors';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { AuthButton, AuthCard, AuthError, AuthField, AuthLink, AuthNote } from '@/components/AuthCard';

/**
 * Step 2 of a password reset (problemList D21), opened from the emailed link
 * (/reset-password?email=…&token=…). On success every existing session is
 * signed out, so the person signs in again with the new password.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; token?: string }>();
  const email  = typeof params.email === 'string' ? params.email : '';
  const token  = typeof params.token === 'string' ? params.token : '';
  useDocumentTitle('Choose a new password - Golf Fundraiser Pro');

  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [busy,     setBusy]     = useState(false);
  const [done,     setDone]     = useState(false);

  async function handleReset() {
    if (password.length < 8)   { setError('Use at least 8 characters, including a number.'); return; }
    if (password !== confirm)  { setError("The two passwords don't match."); return; }
    setError(null);
    setBusy(true);
    try {
      await authApi.resetPassword(email, token, password);
      setDone(true);
    } catch (e) {
      setError(friendlyApiError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!email || !token) {
    return (
      <AuthCard heading="This link is incomplete">
        <AuthNote>Open the link from your reset email again, or request a new one.</AuthNote>
        <AuthLink label="Request a new link" onPress={() => router.replace('/(auth)/forgot-password')} />
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard heading="Password changed">
        <AuthNote>You're signed out on every device. Sign in with your new password.</AuthNote>
        <AuthButton label="Sign in" onPress={() => router.replace('/(auth)/login')} />
      </AuthCard>
    );
  }

  return (
    <AuthCard heading="Choose a new password">
      <AuthNote>For {email}</AuthNote>
      <AuthError message={error} />
      <AuthField
        label="New password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        editable={!busy}
      />
      <AuthField
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        returnKeyType="done"
        onSubmitEditing={handleReset}
        editable={!busy}
      />
      <AuthButton label="Set new password" onPress={handleReset} busy={busy} />
      <AuthLink label="Request a new link" onPress={() => router.replace('/(auth)/forgot-password')} />
    </AuthCard>
  );
}
