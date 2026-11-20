import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  Switch, StyleSheet, ActivityIndicator, Platform, Image,
} from 'react-native';
import { useTheme, useClasses, Heading } from '@gfp/ui';
import { ECO_GREEN_DEFAULT, isThemeSaveBlocked, type GFPTheme, spacing, radius, fontSize, status, neutral } from '@gfp/theme';
import { useResponsive } from '@/lib/responsive';
import { orgApi, type OrgProfile } from '@/lib/api';
import { TeamMembersCard } from '@/components/TeamMembersCard';
import { BrandColorEditor, BLOCKED_SAVE_MESSAGE, allColorsValid, parseTheme } from '@/components/BrandColorEditor';
import { useAuth } from '@/lib/auth';

// ── Main Screen ───────────────────────────────────────────────────────────────

// Event staff (problemList D20) reach this only by typing the URL; the nav
// doesn't offer it. Everything on it is organizer-only in the API.
export default function OrgSettingsScreen() {
  const { user } = useAuth();
  const theme    = useTheme();
  const c        = useClasses();
  if (user?.role === 'EventStaff') {
    return (
      <View style={[c.screen, { padding: spacing[6] }]}>
        <Heading level={1} style={[styles.title, { color: theme.colors.primary }]}>Organization Settings</Heading>
        <Text style={[styles.sub, { color: theme.mutedText }]}>
          Only organizers can change organization settings or invite people. Ask your organizer.
        </Text>
      </View>
    );
  }
  return <OrgSettings />;
}

function OrgSettings() {
  const theme  = useTheme();
  const c      = useClasses();
  const { pagePadding } = useResponsive();

  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [uploadErr,  setUploadErr]  = useState<string | null>(null);

  // Profile fields
  const [slug,    setSlug]    = useState('');
  const [name,    setName]    = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [mission, setMission] = useState('');
  const [is501c3, setIs501c3] = useState(false);

  // Theme tokens
  const [colors, setColors] = useState<GFPTheme>({ ...ECO_GREEN_DEFAULT });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const org: OrgProfile = await orgApi.getMe();
      setName(org.name);
      setSlug(org.slug);
      setLogoUrl(org.logoUrl ?? '');
      setMission(org.missionStatement ?? '');
      setIs501c3(org.is501c3);
      setColors(parseTheme(org.themeJson));
    } catch {
      setError('Failed to load organization settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!name.trim()) { setError('Organization name is required.'); return; }
    if (!allColorsValid(colors)) { setError('Fix invalid hex color values before saving.'); return; }
    // Hard contrast failures need a fix or the organizer's explicit choice of
    // brand over accessibility — the check under Brand Colors offers both.
    if (isThemeSaveBlocked(colors)) { setError(BLOCKED_SAVE_MESSAGE); return; }
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await orgApi.updateMe({
        name:             name.trim(),
        // The API reads null as "leave unchanged" and '' as "clear", so a
        // blanked field must send '' to take effect.
        logoUrl:          logoUrl.trim(),
        missionStatement: mission.trim(),
        is501c3,
        themeJson:        JSON.stringify(colors),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  // Web file picker ─────────────────────────────────────────────────────────

  function openFilePicker() {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type  = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploadErr(null);
      setUploading(true);
      try {
        const result = await orgApi.uploadLogo(file);
        setLogoUrl(result.logoUrl);
      } catch (e: any) {
        setUploadErr(e.message ?? 'Upload failed.');
      } finally {
        setUploading(false);
      }
    };
    input.click();
  }

  if (loading) {
    return <View style={c.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;
  }

  return (
    <ScrollView
      style={c.screen}
      contentContainerStyle={{ padding: pagePadding, paddingBottom: 80 }}
      keyboardShouldPersistTaps="handled"
    >
      <Heading level={1} style={[styles.title, { color: theme.colors.primary }]}>Organization Settings</Heading>
      <Text style={[styles.sub,   { color: theme.mutedText }]}>
        Update your organization profile. Changes apply to all events.
      </Text>

      {error && <View style={c.errorBox}><Text style={c.errorText}>{error}</Text></View>}
      {saved  && <View style={styles.successBox}><Text style={styles.successText}>Settings saved.</Text></View>}

      {/* ── TEAM MEMBERS (problemList D20) ── */}
      <TeamMembersCard />
      <View style={{ height: 20 }} />

      {/* ── PROFILE CARD ── */}
      <View style={styles.card}>
        <Heading level={2} style={[styles.sectionTitle, { color: theme.colors.primary }]}>Profile</Heading>

        {/* Slug (read-only) */}
        <View style={styles.fieldWrap}>
          <Text style={c.fieldLabel}>URL Slug</Text>
          <View style={[styles.readonlyBox, { borderColor: theme.colors.accent + '55' }]}>
            <Text style={[styles.readonlyText, { color: theme.mutedText }]}>{slug}</Text>
          </View>
          <Text style={[styles.hint, { color: theme.mutedText }]}>
            Cannot be changed after registration.
          </Text>
        </View>

        {/* Name */}
        <View style={styles.fieldWrap}>
          <Text style={c.fieldLabel}>Organization Name *</Text>
          <TextInput
            style={c.input}
            value={name}
            onChangeText={v => { setName(v); setError(null); }}
            placeholder="Clear Lake High School Boosters"
            placeholderTextColor={neutral.placeholder}
            autoCapitalize="words"
            autoCorrect={false}
            editable={!saving}
          />
        </View>

        {/* Logo */}
        <View style={styles.fieldWrap}>
          <Text style={c.fieldLabel}>Logo</Text>

          {/* Preview */}
          {!!logoUrl && (
            <View style={styles.logoPreview}>
              <Image accessibilityLabel="Organization logo preview"
                source={{ uri: logoUrl.startsWith('/') ? `${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000'}${logoUrl}` : logoUrl }}
                style={styles.logoImg}
                resizeMode="contain"
              />
            </View>
          )}

          {uploadErr && <Text style={styles.uploadErr}>{uploadErr}</Text>}

          {/* Upload button (web only) */}
          {Platform.OS === 'web' && (
            <Pressable accessibilityRole="button" accessibilityLabel={logoUrl ? 'Replace Logo' : 'Upload Logo'}
              style={[styles.uploadBtn, { borderColor: theme.colors.primary }, uploading && { opacity: 0.6 }]}
              onPress={openFilePicker}
              disabled={uploading || saving}
            >
              {uploading
                ? <ActivityIndicator size="small" color={theme.colors.primary} />
                : <Text style={[styles.uploadBtnText, { color: theme.colors.primary }]}>
                    {logoUrl ? 'Replace Logo' : 'Upload Logo'}
                  </Text>}
            </Pressable>
          )}
          <Text style={[styles.hint, { color: theme.mutedText }]}>PNG recommended — transparent background, at least 512px wide. SVG and ICO are converted automatically. Max 2 MB.</Text>

          {/* URL field — fallback / alternative */}
          <Text style={[c.fieldLabel, { marginTop: spacing[3] }]}>
            Or paste a URL
          </Text>
          <TextInput
            style={c.input}
            value={logoUrl}
            onChangeText={setLogoUrl}
            placeholder="https://cdn.example.com/logo.png"
            placeholderTextColor={neutral.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!saving}
          />
        </View>

        {/* Mission */}
        <View style={styles.fieldWrap}>
          <Text style={c.fieldLabel}>Mission Statement</Text>
          <TextInput
            style={[styles.textArea, { borderColor: theme.colors.accent }]}
            value={mission}
            onChangeText={setMission}
            placeholder="Describe your organization's mission and what this event supports…"
            placeholderTextColor={neutral.placeholder}
            multiline
            numberOfLines={4}
            autoCapitalize="sentences"
            editable={!saving}
          />
          <Text style={[styles.hint, { color: theme.mutedText }]}>
            Shown on your public event landing page.
          </Text>
        </View>

        {/* 501(c)3 */}
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[c.fieldLabel, { marginTop: 0 }]}>
              501(c)(3) Non-Profit
            </Text>
            <Text style={[styles.hint, { color: theme.mutedText }]}>
              Enables IRS tax-deductibility language in donation receipts.
            </Text>
          </View>
          <Switch
            accessibilityLabel="501(c)(3) Non-Profit"
            value={is501c3}
            onValueChange={setIs501c3}
            trackColor={{ true: theme.colors.primary }}
            disabled={saving}
          />
        </View>
      </View>

      {/* ── THEME CARD ── */}
      <View style={[styles.card, { marginTop: spacing[5] }]}>
        <View style={styles.themeTitleRow}>
          <Heading level={2} style={[styles.sectionTitle, { color: theme.colors.primary }]}>Brand Colors</Heading>
          <Pressable accessibilityRole="button"
            onPress={() => setColors({ ...ECO_GREEN_DEFAULT })}
            style={[styles.resetBtn, { borderColor: theme.colors.accent }]}
          >
            <Text style={[styles.resetBtnText, { color: theme.mutedText }]}>Reset to Eco Green</Text>
          </Pressable>
        </View>

        <Text style={[styles.hint, { color: theme.mutedText, marginBottom: spacing[3] }]}>
          Enter 6-digit hex codes, or tap a swatch to browse. Your colors are checked
          for readability as you go.
        </Text>

        <BrandColorEditor colors={colors} onChange={setColors} disabled={saving} />
      </View>

      {/* ── SAVE ── */}
      <Pressable accessibilityRole="button" accessibilityLabel="Save All Changes"
        style={[styles.saveBtn, { backgroundColor: theme.colors.primary }, saving && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.saveBtnText}>Save All Changes</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({

  title: { fontSize: fontSize.title, fontWeight: '900', marginBottom: spacing[1] },
  sub:   { fontSize: fontSize.md, marginBottom: spacing[5] },

  successBox:  { backgroundColor: '#f0fdf4', borderRadius: radius.md, padding: spacing[3], marginBottom: spacing[3], borderLeftWidth: 3, borderLeftColor: status.success },
  successText: { color: '#1e8449', fontSize: fontSize.md, fontWeight: '600' },

  card: {
    backgroundColor: '#fff', borderRadius: radius.xl, padding: spacing[6],
    boxShadow: '0px 3px 12px rgba(0, 0, 0, 0.06)', elevation: 3,
  },
  sectionTitle: { fontSize: fontSize.xl, fontWeight: '800', marginBottom: spacing[1] },

  fieldWrap:    { marginBottom: spacing[1] },
  textArea:     { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing[4], paddingVertical: spacing[3], fontSize: fontSize.lg, backgroundColor: '#fafafa', minHeight: 100, textAlignVertical: 'top' },
  readonlyBox:  { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing[4], paddingVertical: spacing[3], backgroundColor: '#f5f5f5' },
  readonlyText: { fontSize: fontSize.lg, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  hint:         { fontSize: fontSize.xs, marginTop: spacing[1], color: neutral.mutedText },

  logoPreview:  { marginTop: spacing[2], marginBottom: spacing[2], height: 80, backgroundColor: '#f5f5f5', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImg:      { width: '100%', height: 80 },
  uploadErr:    { color: status.dangerText, fontSize: fontSize.xs, marginBottom: spacing[1] },
  uploadBtn:    { marginTop: spacing[2], borderWidth: 1.5, borderRadius: radius.md, paddingVertical: spacing[3], paddingHorizontal: spacing[4], alignItems: 'center', alignSelf: 'flex-start' },
  uploadBtnText:{ fontSize: fontSize.md, fontWeight: '700' },

  toggleRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: spacing[5] },

  themeTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[1] },
  resetBtn:      { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  resetBtnText:  { fontSize: fontSize.xs, fontWeight: '600' },

  saveBtn:    { marginTop: spacing[6], paddingVertical: spacing[4], borderRadius: radius.lg, alignItems: 'center' },
  saveBtnText: { fontSize: fontSize.xl, fontWeight: '800', color: '#fff' },
});
