import { useState } from 'react';
import { useRouter } from 'expo-router';
import { authApi } from '@/lib/api';
import { friendlyApiError } from '@/lib/errors';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { AuthButton, AuthCard, AuthError, AuthField, AuthLink, AuthNote } from '@/components/AuthCard';

/**
 * Step 1 of a password reset (problemList D21): ask for the account email.
 * The API answers the same way whether or not the email has an account, so
 * this screen does too.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  useDocumentTitle('Reset password - Golf Fundraiser Pro');

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy,  setBusy]  = useState(false);
  const [sent,  setSent]  = useState(false);

  async function handleSend() {
    if (!email.trim()) { setError('Enter the email you sign in with.'); return; }
    setError(null);
    setBusy(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (e) {
      setError(friendlyApiError(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthCard heading="Check your email">
        <AuthNote>
          If {email.trim()} has an account, a link to choose a new password is on its way. It expires in
          1 hour. Check your spam folder if it doesn't arrive in a few minutes.
        </AuthNote>
        <AuthLink label="Back to sign in" onPress={() => router.replace('/(auth)/login')} />
      </AuthCard>
    );
  }

  return (
    <AuthCard heading="Forgot your password?">
      <AuthNote>Enter the email you sign in with and we'll send you a link to choose a new password.</AuthNote>
      <AuthError message={error} />
      <AuthField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="organizer@email.com"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        returnKeyType="send"
        onSubmitEditing={handleSend}
        editable={!busy}
      />
      <AuthButton label="Send reset link" onPress={handleSend} busy={busy} />
      <AuthLink label="Back to sign in" onPress={() => router.replace('/(auth)/login')} />
    </AuthCard>
  );
}
