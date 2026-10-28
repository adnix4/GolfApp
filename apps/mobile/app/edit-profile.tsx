import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useClasses } from '@gfp/ui';
import { useSession } from '@/lib/session';
import { notify, notifyFailure } from '@/lib/notify';
import { updateMyProfile } from '@/lib/api';
import { digitsOnly, fmtPhoneInput, isValidPhone, PHONE_INVALID } from '@gfp/shared-types';
import { fontSize, radius, spacing } from '@gfp/theme';

export default function EditProfileScreen() {
  const theme   = useTheme();
  const c       = useClasses();
  const router  = useRouter();
  const { session, setSession } = useSession();
  const player  = session?.player;

  const [firstName, setFirstName] = useState(player?.firstName ?? '');
  const [lastName,  setLastName]  = useState(player?.lastName  ?? '');
  // Sessions saved before the API returned the player's phone have none; the
  // field then starts blank, and saving it untouched leaves the stored one alone.
  const savedPhone = digitsOnly(player?.phone ?? '');
  const [phone,     setPhone]     = useState(fmtPhoneInput(savedPhone));
  const [saving,    setSaving]    = useState(false);

  // Opened cold (a reload, a deep link) the screen mounts before the stored
  // session loads, so the initial values above are empty. Fill them once the
  // player arrives; later session updates don't overwrite what's being typed.
  const [filledFor, setFilledFor] = useState(player?.id);
  if (player && filledFor !== player.id) {
    setFilledFor(player.id);
    setFirstName(player.firstName);
    setLastName(player.lastName);
    setPhone(fmtPhoneInput(savedPhone));
  }

  async function handleSave() {
    if (!player) return;
    if (!firstName.trim() || !lastName.trim()) {
      notify('Name required', 'Enter both a first and last name, then save again.', undefined, { kind: 'warning' });
      return;
    }
    const digits = digitsOnly(phone);
    if (digits && !isValidPhone(digits)) {
      notify('Check your phone number', PHONE_INVALID, undefined, { kind: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const updated = await updateMyProfile(
        player.id,
        session!.sessionToken,
        {
          firstName: firstName.trim(),
          lastName:  lastName.trim(),
          // Sent only when changed; an empty string clears it.
          ...(digits !== savedPhone ? { phone: digits } : {}),
        },
      );

      if (session) {
        const updatedSession = {
          ...session,
          player: { ...session.player, ...updated },
          team: session.team ? {
            ...session.team,
            players: session.team.players.map(p =>
              p.id === player.id ? { ...p, ...updated } : p
            ),
          } : undefined,
        };
        await setSession(updatedSession);
      }

      router.back();
    } catch (e: unknown) {
      notifyFailure("Couldn't save your profile", e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={c.screen}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: '#e0e0e0' }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Ionicons name="chevron-back" size={24} color={theme.colors.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.colors.primary }]}>Edit Profile</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Field
          label="First Name"
          value={firstName}
          onChangeText={setFirstName}
          placeholder="First name"
          theme={theme}
        />
        <Field
          label="Last Name"
          value={lastName}
          onChangeText={setLastName}
          placeholder="Last name"
          theme={theme}
        />
        <Field
          label="Phone (optional)"
          value={phone}
          onChangeText={v => setPhone(fmtPhoneInput(digitsOnly(v)))}
          placeholder="(555) 867-5309"
          keyboardType="phone-pad"
          theme={theme}
        />

        <View style={[styles.readonlyRow, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.readonlyLabel, { color: theme.mutedText }]}>Email</Text>
          <Text style={[styles.readonlyValue, { color: theme.colors.primary }]}>{player?.email}</Text>
          <Text style={styles.readonlyHint}>Email cannot be changed — it identifies you in the event.</Text>
        </View>

        <Pressable
          style={[styles.saveBtn, { backgroundColor: saving ? theme.colors.accent : theme.colors.primary }]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.saveBtnText}>Save Changes</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label, value, onChangeText, placeholder, keyboardType, theme,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad';
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: theme.mutedText }]}>{label}</Text>
      <TextInput
        style={[styles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#aaa"
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize="words"
      />
    </View>
  );
}

const styles = StyleSheet.create({

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing[2], paddingVertical: spacing[3], borderBottomWidth: 1,
  },
  backBtn:     { width: 44, alignItems: 'center' },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '700' },

  body: { padding: spacing[5], paddingBottom: spacing[12], gap: spacing[4] },

  fieldGroup:  { gap: spacing[2] },
  fieldLabel:  { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: spacing[4],
    paddingVertical: spacing[3], fontSize: fontSize.xl,
  },

  readonlyRow: {
    borderRadius: radius.lg, padding: spacing[4],
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.04)', elevation: 1,
  },
  readonlyLabel: { fontSize: fontSize.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  readonlyValue: { fontSize: fontSize.xl, fontWeight: '500', marginTop: spacing[1] },
  readonlyHint:  { fontSize: fontSize.xs, color: '#aaa', marginTop: spacing[2] },

  saveBtn: {
    borderRadius: radius.lg, paddingVertical: spacing[4],
    alignItems: 'center', marginTop: spacing[2],
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: fontSize.xl },
});
