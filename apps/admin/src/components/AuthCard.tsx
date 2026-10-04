import type { ReactNode } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  type TextInputProps,
} from 'react-native';
import { useTheme } from '@gfp/ui';
import { GfpLogo } from '@/components/GfpLogo';

/**
 * The signed-out card the account screens share: forgot password, reset
 * password and accept invite (problemList D20/D21). Same look as the login
 * screen: logo, a heading, then the form.
 */
export function AuthCard({ heading, children }: { heading: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[authStyles.page, { backgroundColor: theme.pageBackground }]}>
      <KeyboardAvoidingView style={authStyles.card}>
        <View style={authStyles.logoRow}>
          <View style={authStyles.logoMarkRow}>
            <GfpLogo variant="onLight" size={46} />
            <Text style={[authStyles.logoText, { color: theme.colors.primary }]}>GFP</Text>
          </View>
          <Text style={[authStyles.logoSub, { color: theme.mutedText }]}>Admin Dashboard</Text>
        </View>
        <Text style={[authStyles.heading, { color: theme.colors.primary }]}>{heading}</Text>
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

export function AuthField({ label, ...input }: { label: string } & TextInputProps) {
  const theme = useTheme();
  return (
    <>
      <Text style={[authStyles.label, { color: theme.colors.primary }]}>{label}</Text>
      <TextInput
        style={[authStyles.input, { borderColor: theme.colors.accent, color: theme.colors.primary }]}
        placeholderTextColor="#999"
        {...input}
      />
    </>
  );
}

export function AuthButton({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        authStyles.button,
        { backgroundColor: pressed ? theme.colors.accent : theme.colors.primary },
        busy && authStyles.buttonDisabled,
      ]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {busy
        ? <ActivityIndicator color={theme.colors.surface} />
        : <Text style={[authStyles.buttonText, { color: theme.colors.surface }]}>{label}</Text>}
    </Pressable>
  );
}

/** Inline form error, worded by friendlyApiError (no codes or statuses). */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={authStyles.errorBox}>
      <Text style={authStyles.errorText}>{message}</Text>
    </View>
  );
}

export function AuthNote({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[authStyles.note, { color: theme.mutedText }]}>{children}</Text>;
}

export function AuthLink({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={label} style={authStyles.linkRow}>
      <Text style={[authStyles.link, { color: theme.colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

export const authStyles = StyleSheet.create({
  page:        { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card:        { width: '100%', maxWidth: 420, backgroundColor: '#ffffff', borderRadius: 16, padding: 36,
                 boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.08)' },
  logoRow:     { alignItems: 'center', marginBottom: 32 },
  logoMarkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoText:    { fontSize: 32, fontWeight: '800' },
  logoSub:     { fontSize: 13, fontWeight: '500', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  heading:     { fontSize: 22, fontWeight: '700', marginBottom: 20 },
  label:       { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 14 },
  input:       { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15,
                 backgroundColor: '#fafafa' },
  button:      { marginTop: 28, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText:  { fontSize: 16, fontWeight: '700' },
  errorBox:    { backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, marginBottom: 8,
                 borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
  errorText:   { color: '#c0392b', fontSize: 14 },
  note:        { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  linkRow:     { marginTop: 18, alignItems: 'center' },
  link:        { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
});
