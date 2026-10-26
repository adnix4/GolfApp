import { useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, FlatList, Modal, TextInput,
  StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme, AdaptiveLogoFrame, MoneyInput } from '@gfp/ui';
import { dollarsToCents, formatCentsShort, centsToMoneyValue } from '@gfp/shared-types';
import { sponsorsApi, type Sponsor, type CreateSponsorPayload, type SponsorPlacements } from '@/lib/api';
import { useSponsorList } from '@/lib/queries';
import { UPLOAD_ABORTED } from '@/lib/upload';
import { UploadProgress } from '@/components/UploadProgress';
import { confirmAction } from '@/lib/confirmAction';
import { fontSize, radius, spacing } from '@gfp/theme';

const TIER_OPTIONS = ['title', 'gold', 'hole', 'silver', 'bronze'] as const;
const TIER_COLOR: Record<string, string> = {
  title:  '#8e44ad',
  gold:   '#f39c12',
  hole:   '#16a085',
  silver: '#7f8c8d',
  bronze: '#d35400',
};

// ── HOLE PICKER ───────────────────────────────────────────────────────────────

function HolePicker({
  selected,
  onChange,
  disabled,
}: {
  selected: number[];
  onChange: (holes: number[]) => void;
  disabled: boolean;
}) {
  const theme = useTheme();

  function toggle(h: number) {
    if (disabled) return;
    onChange(
      selected.includes(h)
        ? selected.filter(n => n !== h)
        : [...selected, h].sort((a, b) => a - b),
    );
  }

  return (
    <View style={holePickerStyles.grid}>
      {Array.from({ length: 18 }, (_, i) => i + 1).map(h => {
        const active = selected.includes(h);
        return (
          <Pressable
            key={h}
            onPress={() => toggle(h)}
            style={[
              holePickerStyles.cell,
              active
                ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
                : { backgroundColor: '#f5f5f5', borderColor: '#ddd' },
              disabled && { opacity: 0.5 },
            ]}
            accessibilityLabel={`Hole ${h}${active ? ', selected' : ''}`}
            accessibilityRole="checkbox"
          >
            <Text style={[holePickerStyles.cellText, active && { color: '#fff' }]}>{h}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const holePickerStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2] },
  cell: {
    width: 40, height: 40,
    borderRadius: radius.md, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  cellText: { fontSize: fontSize.md, fontWeight: '700', color: '#444' },
});

// ── SPONSORS SCREEN ───────────────────────────────────────────────────────────

export default function SponsorsScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const sponsorList = useSponsorList(id);
  const { items: sponsors, setItems: setSponsors, loading } = sponsorList;
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError
    ?? (sponsorList.error ? (sponsorList.error.message || 'Failed to load sponsors.') : null);
  const [showAdd,  setShowAdd]  = useState(false);
  const [editing,  setEditing]  = useState<Sponsor | null>(null);

  function handleDelete(sponsor: Sponsor) {
    confirmAction(
      'Remove Sponsor',
      `Remove "${sponsor.name}" from this event? This cannot be undone.`,
      async () => {
        try {
          await sponsorsApi.delete(id, sponsor.id);
          setSponsors(prev => prev.filter(s => s.id !== sponsor.id));
        } catch (e: any) {
          setError(e.message ?? 'Failed to remove sponsor. Please try again.');
        }
      },
      'Remove',
      // Sponsors named in a popup are always highlighted.
      { destructive: true, highlights: [{ text: sponsor.name, kind: 'sponsor' }] },
    );
  }

  function handleSaved(sponsor: Sponsor) {
    setSponsors(prev => {
      const idx = prev.findIndex(s => s.id === sponsor.id);
      if (idx >= 0) return prev.map((s, i) => i === idx ? sponsor : s);
      return [...prev, sponsor];
    });
    setShowAdd(false);
    setEditing(null);
  }

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.primary }]}>
          Sponsors ({sponsors.length})
        </Text>
        <Pressable
          style={[styles.addBtn, { backgroundColor: theme.colors.primary }]}
          onPress={() => setShowAdd(true)}
        >
          <Text style={[styles.addBtnText, { color: theme.colors.surface }]}>+ Add Sponsor</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
      ) : sponsors.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.mutedText }]}>No sponsors added yet.</Text>
        </View>
      ) : (
        <FlatList
          data={sponsors}
          keyExtractor={s => s.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: s }) => {
            const holeNums = s.placements?.holeNumbers ?? [];
            return (
              <View style={[styles.card, { borderColor: '#e8e8e8' }]}>
                <View style={styles.cardLeft}>
                  {s.logoUrl ? (
                    <AdaptiveLogoFrame
                      uri={s.logoUrl}
                      width={64} height={40}
                      primaryColor={theme.colors.primary}
                      borderColor={theme.colors.primary}
                      borderRadius={6}
                      padding={6}
                      accessibilityLabel={`${s.name} logo`}
                    />
                  ) : (
                    <View style={[styles.logoPlaceholder, { backgroundColor: theme.colors.highlight }]}>
                      <Text style={{ fontSize: fontSize.xxs, color: theme.mutedText }}>No Logo</Text>
                    </View>
                  )}
                </View>
                <View style={styles.cardBody}>
                  <Text style={[styles.sponsorName, { color: theme.colors.primary }]}>{s.name}</Text>
                  {s.tagline && (
                    <Text style={[styles.tagline, { color: theme.mutedText }]}>{s.tagline}</Text>
                  )}
                  {s.websiteUrl && (
                    <Text style={[styles.url, { color: theme.colors.action }]} numberOfLines={1}>{s.websiteUrl}</Text>
                  )}
                  {s.donationAmountCents != null && s.donationAmountCents > 0 && (
                    <Text style={[styles.donationAmt, { color: '#16a085' }]}>
                      {formatCentsShort(s.donationAmountCents)} donation
                    </Text>
                  )}
                  {holeNums.length > 0 && (
                    <View style={styles.holeChipsRow}>
                      {holeNums.map(h => (
                        <View key={h} style={[styles.holeChip, { backgroundColor: theme.colors.primary + '18', borderColor: theme.colors.primary + '44' }]}>
                          <Text style={[styles.holeChipText, { color: theme.colors.primary }]}>H{h}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View style={styles.cardRight}>
                  <View style={[styles.tierBadge, { backgroundColor: TIER_COLOR[s.tier] ?? '#999' }]}>
                    <Text style={styles.tierText}>{s.tier}</Text>
                  </View>
                  <Pressable
                    style={[styles.editBtn, { borderColor: theme.colors.accent }]}
                    onPress={() => setEditing(s)}
                  >
                    <Text style={[styles.editBtnText, { color: theme.mutedText }]}>Edit</Text>
                  </Pressable>
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(s)}
                  >
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}

      <SponsorFormModal
        visible={showAdd || editing != null}
        eventId={id}
        initialData={editing}
        onClose={() => { setShowAdd(false); setEditing(null); }}
        onSaved={handleSaved}
      />
    </View>
  );
}

// ── Sponsor Form Modal ────────────────────────────────────────────────────────

interface SponsorFormModalProps {
  visible:     boolean;
  eventId:     string;
  initialData: Sponsor | null;
  onClose:     () => void;
  onSaved:     (sponsor: Sponsor) => void;
}

function SponsorFormModal({ visible, eventId, initialData, onClose, onSaved }: SponsorFormModalProps) {
  const theme  = useTheme();
  const isEdit = initialData != null;

  const [name,            setName]            = useState('');
  const [logoUrl,         setLogoUrl]         = useState('');
  const [tier,            setTier]            = useState<string>('gold');
  const [websiteUrl,      setWebsiteUrl]      = useState('');
  const [tagline,         setTagline]         = useState('');
  const [donationAmt,     setDonationAmt]     = useState('');
  const [selectedHoles,   setSelectedHoles]   = useState<number[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [pendingFile,     setPendingFile]      = useState<File | null>(null);
  const [localPreview,    setLocalPreview]    = useState<string | null>(null);
  const [uploadingLogo,   setUploadingLogo]   = useState(false);
  const [uploadPct,       setUploadPct]       = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (visible) {
      setName(initialData?.name ?? '');
      setLogoUrl(initialData?.logoUrl ?? '');
      setTier((initialData?.tier ?? 'gold').toLowerCase());
      setWebsiteUrl(initialData?.websiteUrl ?? '');
      setTagline(initialData?.tagline ?? '');
      setDonationAmt(centsToMoneyValue(initialData?.donationAmountCents));
      setSelectedHoles(initialData?.placements?.holeNumbers ?? []);
      setError(null);
      setPendingFile(null);
      setLocalPreview(null);
    }
  }, [initialData, visible]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setLogoUrl('');
    setLocalPreview(URL.createObjectURL(file));
    e.target.value = '';
  }

  async function handleSubmit() {
    if (!name.trim()) { setError('Sponsor name is required.'); return; }
    // An uploaded logo comes back root-relative (/uploads/...), and editing
    // such a sponsor re-submits that value — so only a pasted URL has to be
    // absolute.
    if (!pendingFile && logoUrl.trim() &&
        !/^https?:\/\/.+/.test(logoUrl.trim()) && !logoUrl.trim().startsWith('/')) {
      setError('Logo URL must start with http:// or https://');
      return;
    }
    if (websiteUrl.trim() && !/^https?:\/\/.+/.test(websiteUrl.trim())) {
      setError('Website URL must start with http:// or https://');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const donationCents = donationAmt.trim()
        ? dollarsToCents(donationAmt)
        : undefined;

      const placements: SponsorPlacements = { holeNumbers: selectedHoles };

      const payload: CreateSponsorPayload = {
        name: name.trim(),
        ...(logoUrl.trim() ? { logoUrl: logoUrl.trim() } : {}),
        tier,
        ...(websiteUrl.trim() ? { websiteUrl: websiteUrl.trim() } : {}),
        ...(tagline.trim() ? { tagline: tagline.trim() } : {}),
        ...(donationCents !== undefined ? { donationAmountCents: donationCents } : {}),
        placements,
      };
      let result = isEdit
        ? await sponsorsApi.update(eventId, initialData!.id, payload)
        : await sponsorsApi.create(eventId, payload);

      if (pendingFile) {
        setUploadingLogo(true);
        setUploadPct(0);
        const ctrl = new AbortController();
        uploadAbortRef.current = ctrl;
        try {
          result = await sponsorsApi.uploadLogo(eventId, result.id, pendingFile, {
            onProgress: setUploadPct,
            signal:     ctrl.signal,
          });
        } catch (e: any) {
          // Cancelling the logo upload keeps the sponsor (saved above) without
          // the new image; any other failure propagates to the error banner.
          if (e?.code !== UPLOAD_ABORTED) throw e;
        } finally {
          setUploadingLogo(false);
          uploadAbortRef.current = null;
        }
      }
      onSaved(result);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save sponsor.');
    } finally {
      setLoading(false);
    }
  }

  const previewUri = localPreview ?? (logoUrl || initialData?.logoUrl) ?? null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>
            {isEdit ? 'Edit Sponsor' : 'Add Sponsor'}
          </Text>
          {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

          {/* Scrollable form body */}
          <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>

            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Sponsor Name</Text>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.accent }]}
              value={name} onChangeText={setName}
              placeholder="Acme Corp" placeholderTextColor="#999" editable={!loading}
            />

            {/* Logo section */}
            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Logo</Text>
            {previewUri ? (
              <View style={styles.logoPreviewWrap}>
                <AdaptiveLogoFrame
                  uri={previewUri}
                  width={220} height={70}
                  primaryColor={theme.colors.primary}
                  borderColor={theme.colors.primary}
                  borderRadius={8}
                  padding={10}
                  accessibilityLabel="Logo preview"
                />
              </View>
            ) : null}
            <View style={styles.logoRow}>
              {/* Hidden file input — web only */}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                ref={fileInputRef as any}
                onChange={handleFileChange as any}
              />
              <Pressable
                style={[styles.uploadBtn, { borderColor: theme.colors.primary }]}
                onPress={() => (fileInputRef.current as any)?.click()}
                disabled={loading}
              >
                <Text style={[styles.uploadBtnText, { color: theme.colors.primary }]}>
                  {pendingFile ? 'Change Image' : 'Upload Image'}
                </Text>
              </Pressable>
              {pendingFile && (
                <Text style={styles.fileNameText} numberOfLines={1}>{pendingFile.name}</Text>
              )}
            </View>
            {uploadingLogo && (
              <UploadProgress
                progress={uploadPct}
                onCancel={() => uploadAbortRef.current?.abort()}
                label="Uploading logo"
              />
            )}
            <Text style={styles.formatHint}>PNG recommended — transparent background, at least 512px wide. SVG and ICO are converted automatically.</Text>
            <Text style={styles.orText}>— or paste a URL —</Text>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.accent }]}
              value={logoUrl}
              onChangeText={v => { setLogoUrl(v); setPendingFile(null); setLocalPreview(null); }}
              placeholder="https://example.com/logo.png"
              placeholderTextColor="#999"
              editable={!loading}
            />
            {/* Informational, never blocking: the server converts on save. Only
                catches URLs that end in the extension — the logo that prompted
                all this was an SVG served with no extension at all. */}
            {/\.(svg|ico)(\?|#|$)/i.test(logoUrl.trim()) && (
              <Text style={styles.formatWarn}>
                This looks like an SVG/ICO. It will be converted to PNG when you save.
              </Text>
            )}

            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Website URL</Text>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.accent }]}
              value={websiteUrl} onChangeText={setWebsiteUrl}
              placeholder="https://acme.com (optional)" placeholderTextColor="#999" editable={!loading}
            />

            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Tagline</Text>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.accent }]}
              value={tagline} onChangeText={setTagline}
              placeholder="Powering your round (optional)" placeholderTextColor="#999" editable={!loading}
            />

            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Donation Amount</Text>
            <MoneyInput
              style={[styles.input, { borderColor: theme.colors.accent }]}
              value={donationAmt} onChangeText={setDonationAmt}
              placeholder="$0.00 (optional)" placeholderTextColor="#999"
              editable={!loading}
            />

            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Tier</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
              {TIER_OPTIONS.map(t => (
                <Pressable
                  key={t}
                  style={[styles.pill, tier === t && { backgroundColor: TIER_COLOR[t] ?? '#999', borderColor: TIER_COLOR[t] ?? '#999' }]}
                  onPress={() => setTier(t)}
                >
                  <Text style={[styles.pillText, tier === t && { color: '#fff' }]}>{t}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* ── HOLE SPONSORSHIP ── */}
            <View style={styles.holeSection}>
              <Text style={[styles.fieldLabel, { color: theme.colors.primary, marginTop: 0 }]}>
                Hole Sponsorship
              </Text>
              <Text style={[styles.holeHint, { color: theme.mutedText }]}>
                Select which holes display this sponsor's name and logo on the mobile scorecard.
              </Text>
              <HolePicker
                selected={selectedHoles}
                onChange={setSelectedHoles}
                disabled={loading}
              />
              {selectedHoles.length > 0 && (
                <Text style={[styles.holeSelectionSummary, { color: theme.colors.primary }]}>
                  Selected: {selectedHoles.join(', ')}
                </Text>
              )}
            </View>

          </ScrollView>

          {/* Action buttons — outside scroll so they stay visible */}
          <View style={styles.modalActions}>
            <Pressable style={[styles.cancelBtn, { borderColor: theme.colors.accent }]} onPress={onClose}>
              <Text style={[styles.cancelText, { color: theme.mutedText }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.submitBtn, { backgroundColor: theme.colors.primary }, loading && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitText}>{isEdit ? 'Save' : 'Add Sponsor'}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page:   { flex: 1, padding: spacing[8] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[5] },
  title:  { fontSize: fontSize.title, fontWeight: '800' },
  addBtn: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.md },
  addBtnText: { fontSize: fontSize.md, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: fontSize.lg },
  list: { gap: spacing[3] },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing[4],
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
  },
  cardLeft: {},
  logo: { width: 64, height: 40, resizeMode: 'contain' },
  logoPlaceholder: { width: 64, height: 40, borderRadius: radius.sm, justifyContent: 'center', alignItems: 'center' },
  cardBody: { flex: 1 },
  sponsorName: { fontSize: fontSize.xl, fontWeight: '700' },
  tagline: { fontSize: fontSize.sm, marginTop: spacing[0.5] },
  url: { fontSize: fontSize.xs, marginTop: spacing[0.5] },
  donationAmt: { fontSize: fontSize.xs, marginTop: spacing[0.5], fontWeight: '600' },
  holeChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], marginTop: spacing[2] },
  holeChip: {
    paddingHorizontal: spacing[2], paddingVertical: spacing[1],
    borderRadius: radius.sm, borderWidth: 1,
  },
  holeChipText: { fontSize: fontSize.xxs, fontWeight: '700' },
  cardRight: { alignItems: 'flex-end', gap: spacing[2] },
  tierBadge: { paddingHorizontal: spacing[3], paddingVertical: spacing[1], borderRadius: radius.lg },
  tierText: { fontSize: fontSize.xxs, fontWeight: '700', color: '#fff', textTransform: 'capitalize' },
  editBtn: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
  editBtnText: { fontSize: fontSize.xs, fontWeight: '600' },
  deleteBtn: { paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
  deleteBtnText: { fontSize: fontSize.xs, fontWeight: '600', color: '#e74c3c' },
  errorBox: {
    backgroundColor: '#fdf2f2', borderRadius: radius.md, padding: spacing[3], marginBottom: spacing[3],
    borderLeftWidth: 3, borderLeftColor: '#e74c3c',
  },
  errorText: { color: '#c0392b', fontSize: fontSize.md },
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modal:    { width: '100%', maxWidth: 480, backgroundColor: '#fff', borderRadius: radius.xl, padding: spacing[8], maxHeight: '90%' },
  modalTitle: { fontSize: fontSize.xxl, fontWeight: '800', marginBottom: spacing[3] },
  modalScroll: { maxHeight: 500 },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing[2], marginTop: spacing[3] },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing[3], paddingVertical: spacing[3], fontSize: fontSize.lg, backgroundColor: '#fafafa' },
  pillRow: { marginBottom: spacing[1] },
  pill: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.xxl, borderWidth: 1, borderColor: '#ccc', marginRight: spacing[2], backgroundColor: '#fafafa' },
  pillText: { fontSize: fontSize.sm, fontWeight: '600', color: '#444', textTransform: 'capitalize' },
  holeSection: {
    marginTop: spacing[4], paddingTop: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e0e0e0',
  },
  holeHint: { fontSize: fontSize.xs, marginBottom: spacing[1] },
  holeSelectionSummary: { fontSize: fontSize.xs, fontWeight: '600', marginTop: spacing[2] },
  modalActions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[4] },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing[3], alignItems: 'center' },
  cancelText: { fontSize: fontSize.lg, fontWeight: '600' },
  submitBtn: { flex: 2, borderRadius: radius.md, paddingVertical: spacing[3], alignItems: 'center' },
  submitText: { fontSize: fontSize.lg, fontWeight: '700', color: '#fff' },
  logoPreviewWrap: { alignItems: 'center', marginBottom: spacing[2] },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[2] },
  uploadBtn: { borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  uploadBtnText: { fontSize: fontSize.sm, fontWeight: '700' },
  fileNameText: { flex: 1, fontSize: fontSize.xs, color: '#555' },
  orText: { textAlign: 'center', color: '#aaa', fontSize: fontSize.xs, marginVertical: spacing[2] },
  formatHint: { color: '#777', fontSize: fontSize.xs, lineHeight: 16, marginTop: spacing[2] },
  formatWarn: { color: '#a67100', fontSize: fontSize.xs, lineHeight: 16, marginTop: spacing[1] },
});
