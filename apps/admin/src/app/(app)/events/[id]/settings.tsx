import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  Switch, StyleSheet, ActivityIndicator, Platform, Image,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { ECO_GREEN_DEFAULT, getContrastRatio, validateContrast, type GFPTheme } from '@gfp/theme';
import { useResponsive } from '@/lib/responsive';
import { eventsApi, eventBrandingApi, type EventDetail } from '@/lib/api';

const TOKEN_META: { key: keyof GFPTheme; label: string; desc: string }[] = [
  { key: 'primary',   label: 'Primary',   desc: 'Nav, headers, footer, primary buttons' },
  { key: 'action',    label: 'Action',    desc: 'CTAs, links, active tabs, leaderboard highlights' },
  { key: 'accent',    label: 'Accent',    desc: 'Hover states, secondary badges, sponsor strip' },
  { key: 'highlight', label: 'Highlight', desc: 'Selected states, callout banners, QR borders' },
  { key: 'surface',   label: 'Surface',   desc: 'Page backgrounds, cards, email body background' },
];

function parseTheme(json: string | null): GFPTheme {
  if (!json) return { ...ECO_GREEN_DEFAULT };
  try { return { ...ECO_GREEN_DEFAULT, ...JSON.parse(json) }; }
  catch { return { ...ECO_GREEN_DEFAULT }; }
}

function isValidHex(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

function openColorPicker(current: string, onChange: (v: string) => void) {
  if (Platform.OS !== 'web') return;
  const input = (globalThis as any).document?.createElement('input');
  if (!input) return;
  input.type  = 'color';
  input.value = isValidHex(current) ? current : '#000000';
  input.style.position = 'fixed';
  input.style.opacity  = '0';
  input.style.pointerEvents = 'none';
  (globalThis as any).document.body.appendChild(input);
  input.oninput  = () => onChange(input.value);
  input.onchange = () => {
    onChange(input.value);
    (globalThis as any).document.body.removeChild(input);
  };
  input.click();
}

function ColorRow({
  meta, value, onChange, disabled,
}: {
  meta: (typeof TOKEN_META)[number];
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const valid = isValidHex(value);
  return (
    <View style={cr.row}>
      <Pressable
        style={[cr.swatch, { backgroundColor: valid ? value : '#cccccc' }]}
        onPress={() => !disabled && openColorPicker(value, onChange)}
        accessibilityLabel={`Pick color for ${meta.label}`}
      />
      <View style={cr.info}>
        <Text style={cr.tokenLabel}>{meta.label}</Text>
        <Text style={cr.tokenDesc}>{meta.desc}</Text>
      </View>
      <TextInput
        style={[cr.hexInput, !valid && cr.hexInputError]}
        value={value}
        onChangeText={onChange}
        placeholder="#rrggbb"
        placeholderTextColor="#aaa"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={7}
        editable={!disabled}
      />
    </View>
  );
}

const cr = StyleSheet.create({
  row:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  swatch:        { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', flexShrink: 0 },
  info:          { flex: 1 },
  tokenLabel:    { fontSize: 14, fontWeight: '700', color: '#333' },
  tokenDesc:     { fontSize: 12, color: '#888', marginTop: 1 },
  hexInput:      { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14, width: 90, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  hexInputError: { borderColor: '#e74c3c' },
});

export default function EventSettingsScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const theme   = useTheme();
  const { pagePadding } = useResponsive();

  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [uploadErr,  setUploadErr]  = useState<string | null>(null);

  // Branding fields — null means "inherit from org"
  const [logoUrl,  setLogoUrl]  = useState('');
  const [mission,  setMission]  = useState('');
  const [is501c3,  setIs501c3]  = useState(false);
  const [hasTheme, setHasTheme] = useState(false);
  const [colors,   setColors]   = useState<GFPTheme>({ ...ECO_GREEN_DEFAULT });

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const evt: EventDetail = await eventsApi.get(id);
      setLogoUrl(evt.logoUrl ?? '');
      setMission(evt.missionStatement ?? '');
      setIs501c3(evt.is501c3);
      if (evt.themeJson) {
        setHasTheme(true);
        setColors(parseTheme(evt.themeJson));
      } else {
        setHasTheme(false);
        setColors({ ...ECO_GREEN_DEFAULT });
      }
    } catch {
      setError('Failed to load event settings.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function setToken(key: keyof GFPTheme, value: string) {
    setColors(prev => ({ ...prev, [key]: value }));
  }

  const contrastRatio  = getContrastRatio(colors.primary, colors.surface);
  const contrastPasses = validateContrast(colors.primary, colors.surface);
  const allColorsValid = TOKEN_META.every(m => isValidHex(colors[m.key]));

  async function handleSave() {
    if (!id) return;
    if (hasTheme && !allColorsValid) { setError('Fix invalid hex color values before saving.'); return; }
    if (hasTheme && !contrastPasses) {
      setError(`Primary on Surface contrast is ${contrastRatio.toFixed(1)}:1 — must be ≥ 4.5:1 (WCAG AA). Adjust Primary or Surface.`);
      return;
    }
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await eventBrandingApi.update(id, {
        logoUrl:          logoUrl.trim() || null,
        missionStatement: mission.trim() || null,
        is501c3,
        themeJson:        hasTheme ? JSON.stringify(colors) : null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  function openFilePicker() {
    if (Platform.OS !== 'web' || !id) return;
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = 'image/png,image/jpeg,image/svg+xml,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploadErr(null);
      setUploading(true);
      try {
        const result = await eventBrandingApi.uploadLogo(id, file);
        setLogoUrl(result.url);
      } catch (e: any) {
        setUploadErr(e.message ?? 'Upload failed.');
      } finally {
        setUploading(false);
      }
    };
    input.click();
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;
  }

  return (
    <ScrollView
      style={[styles.page, { backgroundColor: theme.pageBackground }]}
      contentContainerStyle={{ padding: pagePadding, paddingBottom: 80 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: theme.colors.primary }]}>Event Branding</Text>
      <Text style={[styles.sub, { color: theme.colors.accent }]}>
        Customize the look of this event. Leave fields blank to inherit your organization defaults.
      </Text>

      {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}
      {saved  && <View style={styles.successBox}><Text style={styles.successText}>Branding saved.</Text></View>}

      {/* ── PROFILE CARD ── */}
      <View style={styles.card}>
        <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Event Identity</Text>

        {/* Logo */}
        <View style={styles.fieldWrap}>
          <Text style={[styles.label, { color: theme.colors.primary }]}>Logo</Text>

          {!!logoUrl && (
            <View style={styles.logoPreview}>
              <Image
                source={{ uri: logoUrl.startsWith('/') ? `${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000'}${logoUrl}` : logoUrl }}
                style={styles.logoImg}
                resizeMode="contain"
              />
            </View>
          )}

          {uploadErr && <Text style={styles.uploadErr}>{uploadErr}</Text>}

          {Platform.OS === 'web' && (
            <Pressable
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
          <Text style={[styles.hint, { color: theme.colors.accent }]}>PNG, JPEG, SVG or WebP · max 2 MB</Text>

          <Text style={[styles.label, { color: theme.colors.primary, marginTop: 10 }]}>Or paste a URL</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.accent }]}
            value={logoUrl}
            onChangeText={setLogoUrl}
            placeholder="https://cdn.example.com/logo.png  (blank = org default)"
            placeholderTextColor="#aaa"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!saving}
          />
        </View>

        {/* Mission */}
        <View style={styles.fieldWrap}>
          <Text style={[styles.label, { color: theme.colors.primary }]}>Mission Statement</Text>
          <TextInput
            style={[styles.textArea, { borderColor: theme.colors.accent }]}
            value={mission}
            onChangeText={setMission}
            placeholder="What is this event raising funds for? (blank = org default)"
            placeholderTextColor="#aaa"
            multiline
            numberOfLines={4}
            autoCapitalize="sentences"
            editable={!saving}
          />
          <Text style={[styles.hint, { color: theme.colors.accent }]}>
            Shown on the public landing page and leaderboard.
          </Text>
        </View>

        {/* 501(c)(3) */}
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.colors.primary, marginTop: 0 }]}>
              501(c)(3) Non-Profit
            </Text>
            <Text style={[styles.hint, { color: theme.colors.accent }]}>
              Enables IRS tax-deductibility language in donation receipts for this event.
            </Text>
          </View>
          <Switch
            value={is501c3}
            onValueChange={setIs501c3}
            trackColor={{ true: theme.colors.primary }}
            disabled={saving}
          />
        </View>
      </View>

      {/* ── THEME CARD ── */}
      <View style={[styles.card, { marginTop: 20 }]}>
        <View style={styles.themeTitleRow}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Brand Colors</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {hasTheme && (
              <Pressable
                onPress={() => { setHasTheme(false); setColors({ ...ECO_GREEN_DEFAULT }); }}
                style={[styles.resetBtn, { borderColor: '#e74c3c' }]}
              >
                <Text style={[styles.resetBtnText, { color: '#e74c3c' }]}>Clear (use org)</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => { setHasTheme(true); setColors({ ...ECO_GREEN_DEFAULT }); }}
              style={[styles.resetBtn, { borderColor: theme.colors.accent }]}
            >
              <Text style={[styles.resetBtnText, { color: theme.colors.accent }]}>Reset to Eco Green</Text>
            </Pressable>
          </View>
        </View>

        {!hasTheme ? (
          <View style={styles.inheritBanner}>
            <Text style={styles.inheritText}>
              No event-specific theme set — inheriting organization colors.
              Click "Reset to Eco Green" to start customizing this event.
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.hint, { color: theme.colors.accent, marginBottom: 12 }]}>
              These colors override the org theme for this event only.
            </Text>

            {TOKEN_META.map(meta => (
              <ColorRow
                key={meta.key}
                meta={meta}
                value={colors[meta.key]}
                onChange={v => setToken(meta.key, v)}
                disabled={saving}
              />
            ))}

            <View style={[
              styles.contrastBadge,
              { backgroundColor: contrastPasses ? '#f0fdf4' : '#fdf2f2',
                borderColor:      contrastPasses ? '#27ae60'  : '#e74c3c' },
            ]}>
              <Text style={[styles.contrastText, { color: contrastPasses ? '#1e8449' : '#c0392b' }]}>
                Primary on Surface: {contrastRatio.toFixed(1)}:1
                {'  '}
                {contrastPasses ? '✓ Passes WCAG AA' : '✗ Fails WCAG AA (need ≥ 4.5:1)'}
              </Text>
            </View>

            <View style={styles.previewRow}>
              {TOKEN_META.map(m => (
                <View key={m.key} style={[styles.previewChip, { backgroundColor: isValidHex(colors[m.key]) ? colors[m.key] : '#ccc' }]}>
                  <Text style={[styles.previewLabel, { color: m.key === 'surface' || m.key === 'highlight' ? '#333' : '#fff' }]}>
                    {m.label}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      {/* ── SAVE ── */}
      <Pressable
        style={[styles.saveBtn, { backgroundColor: theme.colors.primary }, saving && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.saveBtnText}>Save Event Branding</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  title: { fontSize: 24, fontWeight: '900', marginBottom: 4 },
  sub:   { fontSize: 14, marginBottom: 20 },

  errorBox:    { backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
  errorText:   { color: '#c0392b', fontSize: 14 },
  successBox:  { backgroundColor: '#f0fdf4', borderRadius: 8, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#27ae60' },
  successText: { color: '#1e8449', fontSize: 14, fontWeight: '600' },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },

  fieldWrap:    { marginBottom: 4 },
  label:        { fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  input:        { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, backgroundColor: '#fafafa' },
  textArea:     { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, backgroundColor: '#fafafa', minHeight: 100, textAlignVertical: 'top' },
  hint:         { fontSize: 12, marginTop: 4, color: '#888' },

  logoPreview:  { marginTop: 8, marginBottom: 8, height: 80, backgroundColor: '#f5f5f5', borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImg:      { width: '100%', height: 80 },
  uploadErr:    { color: '#c0392b', fontSize: 12, marginBottom: 4 },
  uploadBtn:    { marginTop: 6, borderWidth: 1.5, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', alignSelf: 'flex-start' },
  uploadBtnText:{ fontSize: 14, fontWeight: '700' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },

  themeTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 8 },
  resetBtn:      { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  resetBtnText:  { fontSize: 12, fontWeight: '600' },

  inheritBanner: { backgroundColor: '#f5f5f5', borderRadius: 8, padding: 14, marginTop: 8 },
  inheritText:   { fontSize: 13, color: '#666', lineHeight: 20 },

  contrastBadge: { marginTop: 16, borderRadius: 8, padding: 10, borderWidth: 1 },
  contrastText:  { fontSize: 13, fontWeight: '600' },

  previewRow:   { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  previewChip:  { flex: 1, minWidth: 60, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  previewLabel: { fontSize: 11, fontWeight: '700' },

  saveBtn:     { marginTop: 24, paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
