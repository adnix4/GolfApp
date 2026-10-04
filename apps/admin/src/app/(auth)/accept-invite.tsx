import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { authApi, type InvitePreview } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { friendlyApiError } from '@/lib/errors';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { AuthButton, AuthCard, AuthError, AuthField, AuthLink, AuthNote } from '@/components/AuthCard';

const ROLE_WORDS: Record<string, string> = {
  EventStaff: 'event staff (check-in, scoring and checkout)',
  OrgAdmin:   'an organizer',
};

/**
 * Accepting a staff invite (problemList D20), opened from the emailed link
 * (/accept-invite?token=…). Shows who the invite is for, then the person picks
 * their name and password; the account is created and they're signed in (the
 * root AuthGate then takes them into the dashboard).
 */
export default function AcceptInviteScreen() {
  const theme  = useTheme();
  const router = useRouter();
  const { acceptInvite } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();
  const token  = typeof params.token === 'string' ? params.token : '';
  useDocumentTitle('Accept invite - Golf Fundraiser Pro');

  const [invite,   setInvite]   = useState<InvitePreview | null>(null);
  const [linkErr,  setLinkErr]  = useState<string | null>(null);
  const [name,     setName]     = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [busy,     setBusy]     = useState(false);

  useEffect(() => {
    if (!token) { setLinkErr('This invite link is incomplete. Open it from the invite email again.'); return; }
    authApi.previewInvite(token)
      .then(setInvite)
      .catch(e => setLinkErr(friendlyApiError(e)));
  }, [token]);

  async function handleAccept() {
    if (name.trim().length < 2)  { setError('Enter your name.'); return; }
    if (password.length < 8)     { setError('Use at least 8 characters, including a number.'); return; }
    if (password !== confirm)    { setError("The two passwords don't match."); return; }
    setError(null);
    setBusy(true);
    try {
      await acceptInvite(token, name.trim(), password);
      // Signed in: AuthGate moves us into the dashboard.
    } catch (e) {
      setError(friendlyApiError(e));
      setBusy(false);
    }
  }

  if (linkErr) {
    return (
      <AuthCard heading="This invite can't be used">
        <AuthNote>{linkErr}</AuthNote>
        <AuthLink label="Go to sign in" onPress={() => router.replace('/(auth)/login')} />
      </AuthCard>
    );
  }

  if (!invite) {
    return (
      <AuthCard heading="Checking your invite…">
        <ActivityIndicator color={theme.colors.primary} />
      </AuthCard>
    );
  }

  return (
    <AuthCard heading={`Join ${invite.orgName}`}>
      <AuthNote>
        You've been invited as {ROLE_WORDS[invite.role] ?? invite.role}. You'll sign in as {invite.email}.
      </AuthNote>
      <AuthError message={error} />
      <AuthField label="Your name" value={name} onChangeText={setName} autoComplete="name" editable={!busy} />
      <AuthField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        editable={!busy}
      />
      <AuthField
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        returnKeyType="done"
        onSubmitEditing={handleAccept}
        editable={!busy}
      />
      <AuthButton label="Create account" onPress={handleAccept} busy={busy} />
    </AuthCard>
  );
}
