import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from '@gfp/ui';
import { orgApi, type CreateInviteResult, type OrgInvite, type OrgMember, type StaffRole } from '@/lib/api';
import { confirmAction } from '@/lib/confirmAction';
import { alertFailure } from '@/lib/dialog';
import { friendlyApiError } from '@/lib/errors';

const ROLE_LABEL: Record<string, string> = { OrgAdmin: 'Organizer', EventStaff: 'Event staff' };

const ROLE_HELP: Record<StaffRole, string> = {
  EventStaff: 'Check-in, entry fees, score entry, QR import and auction checkout. Cannot change settings.',
  OrgAdmin:   'Everything you can do, including settings, sponsors and inviting people.',
};

/**
 * Who can sign in to this org, and inviting more people (problemList D20).
 * Before this every desk volunteer had to share the organizer's own login.
 * Shown on the org Settings page, which only organizers can open.
 */
export function TeamMembersCard() {
  const theme = useTheme();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [email,   setEmail]   = useState('');
  const [role,    setRole]    = useState<StaffRole>('EventStaff');
  const [sending, setSending] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [result,  setResult]  = useState<CreateInviteResult | null>(null);
  const [copied,  setCopied]  = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await orgApi.members();
      setMembers(data.members);
      setInvites(data.invites);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(friendlyApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleInvite() {
    if (!email.trim()) { setFormErr('Enter the email to invite.'); return; }
    setFormErr(null);
    setSending(true);
    setResult(null);
    setCopied(false);
    try {
      setResult(await orgApi.invite(email.trim(), role));
      setEmail('');
      await load();
    } catch (e) {
      setFormErr(friendlyApiError(e));
    } finally {
      setSending(false);
    }
  }

  async function copyLink(url: string) {
    try {
      await globalThis.navigator?.clipboard?.writeText(url);
      setCopied(true);
    } catch { /* the link is on screen to copy by hand */ }
  }

  function removeMember(m: OrgMember) {
    const who = m.displayName || m.email;
    confirmAction(
      `Remove ${who}?`,
      `${m.email} will be signed out everywhere and won't be able to sign in to this org again. ` +
      'You can invite them again later.',
      async () => {
        try { await orgApi.removeMember(m.userId); await load(); }
        catch (e) { alertFailure(`Couldn't remove ${who}`, e); }
      },
      'Remove',
      { destructive: true, kind: 'warning' },
    );
  }

  function revokeInvite(i: OrgInvite) {
    confirmAction(
      `Cancel the invite for ${i.email}?`,
      'The link in their email will stop working. You can invite them again later.',
      async () => {
        try { await orgApi.revokeInvite(i.id); await load(); }
        catch (e) { alertFailure("Couldn't cancel the invite", e); }
      },
      'Cancel invite',
      { destructive: true, kind: 'warning' },
    );
  }

  return (
    <View style={styles.card}>
      <Text style={[styles.title, { color: theme.colors.primary }]}>Team members</Text>
      <Text style={styles.hint}>
        Invite desk volunteers as event staff so they don't need your login. Each person signs in with
        their own email and password.
      </Text>

      {loading ? <ActivityIndicator style={{ marginTop: 16 }} color={theme.colors.primary} /> : loadErr ? (
        <Text style={styles.error}>{loadErr}</Text>
      ) : (
        <>
          {members.map(m => (
            <View key={m.userId} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: theme.colors.primary }]}>
                  {m.displayName || m.email}{m.isYou ? ' (you)' : ''}
                </Text>
                <Text style={styles.sub}>{m.email} · {ROLE_LABEL[m.role] ?? m.role}</Text>
              </View>
              {!m.isYou && (
                <Pressable onPress={() => removeMember(m)} accessibilityRole="button"
                  accessibilityLabel={`Remove ${m.displayName || m.email}`} style={styles.textBtn}>
                  <Text style={styles.danger}>Remove</Text>
                </Pressable>
              )}
            </View>
          ))}

          {invites.length > 0 && (
            <Text style={[styles.subTitle, { color: theme.colors.primary }]}>Waiting to accept</Text>
          )}
          {invites.map(i => (
            <View key={i.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: theme.colors.primary }]}>{i.email}</Text>
                <Text style={styles.sub}>
                  {ROLE_LABEL[i.role] ?? i.role} · link expires {new Date(i.expiresAt).toLocaleDateString()}
                </Text>
              </View>
              <Pressable onPress={() => revokeInvite(i)} accessibilityRole="button"
                accessibilityLabel={`Cancel invite for ${i.email}`} style={styles.textBtn}>
                <Text style={styles.danger}>Cancel</Text>
              </Pressable>
            </View>
          ))}
        </>
      )}

      <Text style={[styles.subTitle, { color: theme.colors.primary }]}>Invite someone</Text>
      {formErr && <Text style={styles.error}>{formErr}</Text>}
      <TextInput
        style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
        value={email}
        onChangeText={setEmail}
        placeholder="volunteer@email.com"
        placeholderTextColor="#999"
        autoCapitalize="none"
        keyboardType="email-address"
        editable={!sending}
        accessibilityLabel="Email to invite"
      />
      <View style={styles.roleRow}>
        {(['EventStaff', 'OrgAdmin'] as StaffRole[]).map(r => {
          const on = role === r;
          return (
            <Pressable key={r} onPress={() => setRole(r)} accessibilityRole="radio"
              accessibilityState={{ selected: on }} accessibilityLabel={ROLE_LABEL[r]}
              style={[styles.roleChip, { borderColor: theme.colors.primary },
                      on && { backgroundColor: theme.colors.primary }]}>
              <Text style={[styles.roleText, { color: on ? theme.buttonLabel : theme.colors.primary }]}>
                {ROLE_LABEL[r]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>{ROLE_HELP[role]}</Text>
      <Pressable onPress={handleInvite} disabled={sending} accessibilityRole="button" accessibilityLabel="Send invite"
        style={[styles.primaryBtn, { backgroundColor: theme.colors.primary }, sending && { opacity: 0.6 }]}>
        {sending ? <ActivityIndicator color={theme.buttonLabel} />
                 : <Text style={[styles.primaryText, { color: theme.buttonLabel }]}>Send invite</Text>}
      </Pressable>

      {result && (
        <View style={styles.resultBox}>
          <Text style={styles.resultText}>
            {result.emailSent
              ? `Invite emailed to ${result.invite.email}. You can also share this link with them:`
              : `The email to ${result.invite.email} couldn't be sent. Share this link with them directly:`}
          </Text>
          <Text selectable style={styles.link}>{result.inviteUrl}</Text>
          {Platform.OS === 'web' && (
            <Pressable onPress={() => copyLink(result.inviteUrl)} accessibilityRole="button"
              accessibilityLabel="Copy invite link" style={styles.textBtn}>
              <Text style={[styles.copy, { color: theme.colors.primary }]}>{copied ? 'Copied' : 'Copy link'}</Text>
            </Pressable>
          )}
          <Text style={styles.hint}>The link works once and expires in 7 days.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card:        { backgroundColor: '#fff', borderRadius: 16, padding: 24, boxShadow: '0px 3px 12px rgba(0, 0, 0, 0.06)', elevation: 3 },
  title:       { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  subTitle:    { fontSize: 14, fontWeight: '800', marginTop: 20, marginBottom: 4 },
  hint:        { fontSize: 12, marginTop: 4, color: '#888' },
  error:       { color: '#c0392b', fontSize: 14, marginTop: 10 },
  row:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name:        { fontSize: 15, fontWeight: '700' },
  sub:         { fontSize: 13, color: '#666', marginTop: 2 },
  textBtn:     { paddingHorizontal: 8, paddingVertical: 6 },
  danger:      { color: '#c0392b', fontSize: 14, fontWeight: '700' },
  input:       { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, backgroundColor: '#fafafa', marginTop: 8 },
  roleRow:     { flexDirection: 'row', gap: 8, marginTop: 12 },
  roleChip:    { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  roleText:    { fontSize: 13, fontWeight: '700' },
  primaryBtn:  { marginTop: 16, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  primaryText: { fontSize: 15, fontWeight: '800' },
  resultBox:   { marginTop: 16, backgroundColor: '#f0fdf4', borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: '#27ae60' },
  resultText:  { color: '#1e8449', fontSize: 14, fontWeight: '600' },
  link:        { fontSize: 13, marginTop: 8, color: '#333', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  copy:        { fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
});
