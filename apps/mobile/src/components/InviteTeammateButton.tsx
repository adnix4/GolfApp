import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { useSession } from '@/lib/session';
import { fetchTeammateInvite, issueTeammateInvite, type TeammateInvite } from '@/lib/api';
import { shareTeamInvite } from '@/lib/teamInvite';
import { fontSize, radius, spacing, status } from '@gfp/theme';

/**
 * "Invite a teammate" on the Team tab. Any golfer on the team can send it.
 *
 * Shown only while the server says inviting works: registration still open
 * (the same rule as joining through the link) and the team not full. The
 * cached session can't tell either — it has no team size, and teammates who
 * joined since aren't in it — so the server is asked each time the tab gains
 * focus. Offline or on error the button simply stays hidden.
 *
 * Tapping fetches the team's link (created on first use) and opens the OS
 * share sheet, which covers text, email, chat apps and Copy. The link is also
 * shown, selectable, for a device that can't share.
 */
export function InviteTeammateButton() {
  const theme = useTheme();
  const { session } = useSession();
  const playerId     = session?.player.id;
  const sessionToken = session?.sessionToken;

  const [invite, setInvite] = useState<TeammateInvite | null>(null);
  const [link,   setLink]   = useState<string | null>(null);
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!playerId || !sessionToken) return;
    let live = true;
    fetchTeammateInvite(playerId, sessionToken)
      .then(res => { if (live) setInvite(res); })
      .catch(() => { if (live) setInvite(null); });
    return () => { live = false; };
  }, [playerId, sessionToken]));

  if (!invite?.canInvite || !playerId || !sessionToken) return null;

  async function handleInvite() {
    setBusy(true); setError(null);
    let res;
    try {
      res = await issueTeammateInvite(playerId!, sessionToken!);
    } catch (e) {
      // Usually the team filled up or registration closed since the tab opened.
      setError(e instanceof Error ? e.message : "Couldn't get an invite link.");
      fetchTeammateInvite(playerId!, sessionToken!).then(setInvite).catch(() => setInvite(null));
      return;
    } finally {
      // The spinner covers fetching the link, not the share sheet, which stays
      // open for as long as the golfer takes to pick someone.
      setBusy(false);
    }
    setLink(res.inviteUrl);
    try {
      await shareTeamInvite({ url: res.inviteUrl, teamName: res.teamName, eventName: res.eventName });
    } catch {
      setError("Couldn't open sharing on this device. Press and hold the link above to copy it.");
    }
  }

  const spots = `${invite.spotsLeft} open spot${invite.spotsLeft === 1 ? '' : 's'}`;

  return (
    <View style={[styles.card, { borderColor: theme.colors.primary + '55', backgroundColor: theme.colors.primary + '0d' }]}>
      <Text style={[styles.title, { color: theme.colors.primary }]}>Invite a teammate</Text>
      <Text style={[styles.text, { color: theme.mutedText }]}>
        Your team has {spots}. Send a link and they can sign themselves up.
      </Text>
      {link && <Text selectable style={[styles.url, { color: theme.colors.primary }]}>{link}</Text>}
      <Pressable
        style={({ pressed }) => [styles.btn, { backgroundColor: theme.colors.primary, opacity: busy ? 0.6 : pressed ? 0.8 : 1 }]}
        onPress={handleInvite}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Invite a teammate, ${spots}`}
        accessibilityState={{ disabled: busy, busy }}
      >
        {busy
          ? <ActivityIndicator color={theme.buttonLabel} />
          : <Text style={[styles.btnText, { color: theme.buttonLabel }]}>Invite a Teammate</Text>}
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card:    { borderRadius: radius.lg, borderWidth: 1, padding: spacing[4], marginTop: spacing[4] },
  title:   { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing[1] },
  text:    { fontSize: fontSize.sm, lineHeight: 19 },
  url:     { fontSize: fontSize.xs, marginTop: spacing[3], fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  btn:     { borderRadius: radius.lg, paddingVertical: spacing[3], alignItems: 'center', marginTop: spacing[3] },
  btnText: { fontSize: fontSize.lg, fontWeight: '700' },
  error:   { fontSize: fontSize.xs, color: status.dangerText, marginTop: spacing[2] },
});
