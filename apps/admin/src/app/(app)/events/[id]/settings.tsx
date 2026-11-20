import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  Switch, StyleSheet, ActivityIndicator, Platform, Image,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useEventDetail } from '@/lib/eventContext';
import { clearDismissedWarnings, notify } from '@/lib/dialog';
import { useTheme, useClasses, Heading } from '@gfp/ui';
import { ECO_GREEN_DEFAULT, isThemeSaveBlocked, type GFPTheme, spacing, radius, fontSize, status, neutral } from '@gfp/theme';
import { useResponsive } from '@/lib/responsive';
import { eventsApi, eventBrandingApi } from '@/lib/api';
import { UPLOAD_ABORTED } from '@/lib/upload';
import { UploadProgress } from '@/components/UploadProgress';
import { BrandColorEditor, BLOCKED_SAVE_MESSAGE, allColorsValid, parseTheme } from '@/components/BrandColorEditor';

export default function EventSettingsScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const theme   = useTheme();
  const c       = useClasses();
  const { pagePadding } = useResponsive();
  const { event, setEvent, refresh } = useEventDetail();

  const [saving,     setSaving]     = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [uploadPct,  setUploadPct]  = useState(0);
  const uploadAbortRef              = useRef<AbortController | null>(null);
  const [saved,      setSaved]      = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [uploadErr,  setUploadErr]  = useState<string | null>(null);

  // Branding fields — null means "inherit from org"
  const [logoUrl,      setLogoUrl]      = useState('');
  const [mission,      setMission]      = useState('');
  const [is501c3,      setIs501c3]      = useState(false);
  const [hasTheme,     setHasTheme]     = useState(false);
  const [colors,       setColors]       = useState<GFPTheme>({ ...ECO_GREEN_DEFAULT });
  const [offlineMode,       setOfflineMode]       = useState(false);
  const [freeAgentEnabled,  setFreeAgentEnabled]  = useState(false);
  const [allowWalkUps,      setAllowWalkUps]      = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Brand-from-website (optional convenience — pre-fills the editors below)
  const [websiteUrl,    setWebsiteUrl]    = useState('');
  const [extracting,    setExtracting]    = useState(false);
  const [extractErr,    setExtractErr]    = useState<string | null>(null);
  const [extractedFrom, setExtractedFrom] = useState<string | null>(null);

  // Seed the form from the layout's event once per event. Later refreshes
  // (tab focus, other screens) must not overwrite edits that aren't saved yet.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (seededFor.current === event.id) return;
    seededFor.current = event.id;
    setLogoUrl(event.logoUrl ?? '');
    setMission(event.missionStatement ?? '');
    setIs501c3(event.is501c3);
    setOfflineMode(!!(event.config as any)?.offlineMode);
    setFreeAgentEnabled(!!(event.config as any)?.freeAgentEnabled);
    setAllowWalkUps(!!(event.config as any)?.allowWalkUps);
    if (event.themeJson) {
      setHasTheme(true);
      setColors(parseTheme(event.themeJson));
    } else {
      setHasTheme(false);
      setColors({ ...ECO_GREEN_DEFAULT });
    }
  }, [event]);

  async function handleSave() {
    if (!id) return;
    if (hasTheme && !allColorsValid(colors)) { setError('Fix invalid hex color values before saving.'); return; }
    // Hard contrast failures need a fix or the organizer's explicit choice of
    // brand over accessibility — the check under Brand Colors offers both.
    if (hasTheme && isThemeSaveBlocked(colors)) { setError(BLOCKED_SAVE_MESSAGE); return; }
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      // Publishing the saved event re-themes the layout and every screen now.
      setEvent(await eventBrandingApi.update(id, {
        // The API reads null as "leave unchanged" and '' as "clear", so a
        // blank field (or "Clear (use org)") must send '' to take effect.
        logoUrl:          logoUrl.trim(),
        missionStatement: mission.trim(),
        is501c3,
        themeJson:        hasTheme ? JSON.stringify(colors) : '',
      }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handleExtract() {
    if (!id || extracting) return;
    const url = websiteUrl.trim();
    if (!url) { setExtractErr('Enter your website address first.'); return; }
    setExtracting(true);
    setExtractErr(null);
    try {
      const result = await eventBrandingApi.extractFromWebsite(id, url);
      // Pre-fill the existing editors — the organizer reviews/edits, then Saves.
      setHasTheme(true);
      setColors({ ...ECO_GREEN_DEFAULT, ...result.theme });
      if (result.logoUrl) setLogoUrl(result.logoUrl);
      setExtractedFrom(result.sourceUrl);
    } catch (e: any) {
      setExtractedFrom(null);
      setExtractErr(e.message ?? 'Could not read brand details from that website.');
    } finally {
      setExtracting(false);
    }
  }

  function openFilePicker() {
    if (Platform.OS !== 'web' || !id) return;
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploadErr(null);
      setUploadPct(0);
      setUploading(true);
      const ctrl = new AbortController();
      uploadAbortRef.current = ctrl;
      try {
        const result = await eventBrandingApi.uploadLogo(id, file, {
          onProgress: setUploadPct,
          signal:     ctrl.signal,
        });
        setLogoUrl(result.url);
        // The upload saves the logo onto the event server-side; re-pull it so
        // the layout and other screens see the new logo without a Save.
        refresh().catch(() => {});
      } catch (e: any) {
        // A user-initiated cancel isn't an error — just leave the logo unchanged.
        if (e?.code !== UPLOAD_ABORTED) setUploadErr(e.message ?? 'Upload failed.');
      } finally {
        setUploading(false);
        uploadAbortRef.current = null;
      }
    };
    input.click();
  }

  return (
    <ScrollView
      style={c.screen}
      contentContainerStyle={{ padding: pagePadding, paddingBottom: 80 }}
      keyboardShouldPersistTaps="handled"
    >
      <Heading level={1} style={[styles.title, { color: theme.colors.primary }]}>Event Branding</Heading>
      <Text style={[styles.sub, { color: theme.mutedText }]}>
        Customize the look of this event. Leave fields blank to inherit your organization defaults.
      </Text>

      {error && <View style={c.errorBox}><Text style={c.errorText}>{error}</Text></View>}
      {saved  && <View style={styles.successBox}><Text style={styles.successText}>Branding saved.</Text></View>}

      {/* ── BRAND FROM WEBSITE ── */}
      <View style={styles.card}>
        <Heading level={2} style={[styles.sectionTitle, { color: theme.colors.primary }]}>Brand from Website</Heading>
        <Text style={[styles.hint, { color: theme.mutedText, marginBottom: spacing[3] }]}>
          Optional — enter your organization's website and we'll suggest a color palette and logo.
          Review and edit everything below before saving.
        </Text>
        <View style={styles.extractRow}>
          <TextInput
            style={[c.input, { flex: 1 }]}
            value={websiteUrl}
            onChangeText={setWebsiteUrl}
            placeholder="yourcharity.org"
            placeholderTextColor={neutral.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!extracting}
            onSubmitEditing={handleExtract}
          />
          <Pressable
            style={[styles.extractBtn, { backgroundColor: theme.colors.primary }, extracting && { opacity: 0.6 }]}
            onPress={handleExtract}
            disabled={extracting}
            accessibilityRole="button"
          >
            {extracting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.extractBtnText}>Fetch Brand</Text>}
          </Pressable>
        </View>
        {extractErr && <Text style={[styles.uploadErr, { marginTop: spacing[2] }]}>{extractErr}</Text>}
        {extractedFrom && !extractErr && (
          <Text style={[styles.hint, { color: '#1e8449', marginTop: spacing[2] }]}>
            ✓ Suggested from {extractedFrom}. Review the logo and colors below, then Save.
          </Text>
        )}
      </View>

      {/* ── PROFILE CARD ── */}
      <View style={[styles.card, { marginTop: spacing[5] }]}>
        <Heading level={2} style={[styles.sectionTitle, { color: theme.colors.primary }]}>Event Identity</Heading>

        {/* Logo */}
        <View style={styles.fieldWrap}>
          <Text style={c.fieldLabel}>Logo</Text>

          {!!logoUrl && (
            <View style={styles.logoPreview}>
              <Image accessibilityLabel="Event logo preview"
                source={{ uri: logoUrl.startsWith('/') ? `${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000'}${logoUrl}` : logoUrl }}
                style={styles.logoImg}
                resizeMode="contain"
              />
            </View>
          )}

          {uploadErr && <Text style={styles.uploadErr}>{uploadErr}</Text>}

          {Platform.OS === 'web' && (
            uploading ? (
              <UploadProgress
                progress={uploadPct}
                onCancel={() => uploadAbortRef.current?.abort()}
                label="Uploading logo"
              />
            ) : (
              <Pressable accessibilityRole="button"
                style={[styles.uploadBtn, { borderColor: theme.colors.primary }]}
                onPress={openFilePicker}
                disabled={saving}
              >
                <Text style={[styles.uploadBtnText, { color: theme.colors.primary }]}>
                  {logoUrl ? 'Replace Logo' : 'Upload Logo'}
                </Text>
              </Pressable>
            )
          )}
          <Text style={[styles.hint, { color: theme.mutedText }]}>PNG recommended — transparent background, at least 512px wide. SVG and ICO are converted automatically. Max 2 MB.</Text>

          <Text style={[c.fieldLabel, { marginTop: spacing[3] }]}>Or paste a URL</Text>
          <TextInput
            style={c.input}
            value={logoUrl}
            onChangeText={setLogoUrl}
            placeholder="https://cdn.example.com/logo.png  (blank = org default)"
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
            placeholder="What is this event raising funds for? (blank = org default)"
            placeholderTextColor={neutral.placeholder}
            multiline
            numberOfLines={4}
            autoCapitalize="sentences"
            editable={!saving}
          />
          <Text style={[styles.hint, { color: theme.mutedText }]}>
            Shown on the public landing page and leaderboard.
          </Text>
        </View>

        {/* 501(c)(3) */}
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[c.fieldLabel, { marginTop: 0 }]}>
              501(c)(3) Non-Profit
            </Text>
            <Text style={[styles.hint, { color: theme.mutedText }]}>
              Enables IRS tax-deductibility language in donation receipts for this event.
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
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            {hasTheme && (
              <Pressable accessibilityRole="button"
                onPress={() => { setHasTheme(false); setColors({ ...ECO_GREEN_DEFAULT }); }}
                style={[styles.resetBtn, { borderColor: status.danger }]}
              >
                <Text style={[styles.resetBtnText, { color: status.dangerText }]}>Clear (use org)</Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button"
              onPress={() => { setHasTheme(true); setColors({ ...ECO_GREEN_DEFAULT }); }}
              style={[styles.resetBtn, { borderColor: theme.colors.accent }]}
            >
              <Text style={[styles.resetBtnText, { color: theme.mutedText }]}>Reset to Eco Green</Text>
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
            <Text style={[styles.hint, { color: theme.mutedText, marginBottom: spacing[3] }]}>
              These colors override the org theme for this event only.
            </Text>

            <BrandColorEditor colors={colors} onChange={setColors} disabled={saving} />
          </>
        )}
      </View>

      {/* ── SAVE ── */}
      <Pressable accessibilityRole="button" accessibilityLabel="Save Event Branding"
        style={[styles.saveBtn, { backgroundColor: theme.colors.primary }, saving && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.saveBtnText}>Save Event Branding</Text>}
      </Pressable>

      {/* ── EVENT OPTIONS ── */}
      <View style={[styles.card, { marginTop: spacing[5] }]}>
        <Heading level={2} style={[styles.sectionTitle, { color: theme.colors.primary }]}>Event Options</Heading>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[c.fieldLabel, { marginTop: 0 }]}>
              Offline Event Mode
            </Text>
            <Text style={[styles.hint, { color: theme.mutedText }]}>
              Increases mobile sync intervals to conserve battery at low-connectivity venues.
              Also disables the live leaderboard on mobile.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Offline Event Mode"
            value={offlineMode}
            onValueChange={setOfflineMode}
            trackColor={{ true: '#e67e22' }}
            disabled={savingConfig}
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[c.fieldLabel, { marginTop: 0 }]}>
              Allow Free Agent Registration
            </Text>
            <Text style={[styles.hint, { color: theme.mutedText }]}>
              Lets players register without a team on the mobile app. The organizer assigns
              free agents to teams before the event starts.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Allow Free Agent Registration"
            value={freeAgentEnabled}
            onValueChange={setFreeAgentEnabled}
            trackColor={{ true: theme.colors.primary }}
            disabled={savingConfig}
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[c.fieldLabel, { marginTop: 0 }]}>
              Allow Walk-Up Registration
            </Text>
            <Text style={[styles.hint, { color: theme.mutedText }]}>
              Lets new teams be added on event day, once the event is Active. Registration and
              Draft events always accept teams; guests (non-golfers) can be added any time.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Allow Walk-Up Registration"
            value={allowWalkUps}
            onValueChange={setAllowWalkUps}
            trackColor={{ true: theme.colors.primary }}
            disabled={savingConfig}
          />
        </View>
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel="Save Event Options"
        // Deep orange: the white label reads 5.5:1 (#e67e22 was 2.85).
        style={[styles.saveBtn, { backgroundColor: '#b34700', marginTop: spacing[4] }, savingConfig && { opacity: 0.6 }]}
        onPress={async () => {
          setSavingConfig(true);
          try {
            setEvent(await eventsApi.update(id, { config: { offlineMode, freeAgentEnabled, allowWalkUps } }));
          } catch (e: any) {
            setError(e.message ?? 'Failed to save event options.');
          } finally {
            setSavingConfig(false);
          }
        }}
        disabled={savingConfig}
      >
        {savingConfig
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.saveBtnText}>Save Event Options</Text>}
      </Pressable>

      {/* Undo every "Don't show me this warning again" ticked for this event. */}
      <Pressable
        onPress={() => {
          const n = clearDismissedWarnings(event.id);
          notify(
            'Dismissed warnings reset',
            n > 0
              ? `${n === 1 ? 'The warning you hid' : `The ${n} warnings you hid`} will show again for this event.`
              : 'No warnings are hidden for this event.',
          );
        }}
        style={styles.resetWarnings}
        accessibilityRole="button"
      >
        <Text style={[styles.resetWarningsText, { color: theme.colors.primary }]}>Show dismissed warnings again</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  resetWarnings:     { alignSelf: 'center', marginTop: spacing[4], padding: spacing[2] },
  resetWarningsText: { fontSize: fontSize.sm, fontWeight: '600', textDecorationLine: 'underline' },

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
  hint:         { fontSize: fontSize.xs, marginTop: spacing[1], color: neutral.mutedText },

  extractRow:    { flexDirection: 'row', alignItems: 'stretch', gap: spacing[2] },
  extractBtn:    { paddingHorizontal: spacing[5], borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', minWidth: 120 },
  extractBtnText:{ fontSize: fontSize.md, fontWeight: '800', color: '#fff' },

  logoPreview:  { marginTop: spacing[2], marginBottom: spacing[2], height: 80, backgroundColor: '#f5f5f5', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImg:      { width: '100%', height: 80 },
  uploadErr:    { color: status.dangerText, fontSize: fontSize.xs, marginBottom: spacing[1] },
  uploadBtn:    { marginTop: spacing[2], borderWidth: 1.5, borderRadius: radius.md, paddingVertical: spacing[3], paddingHorizontal: spacing[4], alignItems: 'center', alignSelf: 'flex-start' },
  uploadBtnText:{ fontSize: fontSize.md, fontWeight: '700' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: spacing[5] },

  themeTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[1], flexWrap: 'wrap', gap: spacing[2] },
  resetBtn:      { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  resetBtnText:  { fontSize: fontSize.xs, fontWeight: '600' },

  inheritBanner: { backgroundColor: '#f5f5f5', borderRadius: radius.md, padding: spacing[4], marginTop: spacing[2] },
  inheritText:   { fontSize: fontSize.sm, color: '#666', lineHeight: 20 },

  saveBtn:    { marginTop: spacing[6], paddingVertical: spacing[4], borderRadius: radius.lg, alignItems: 'center' },
  saveBtnText: { fontSize: fontSize.xl, fontWeight: '800', color: '#fff' },
});
