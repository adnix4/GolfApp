import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Pressable, FlatList, Modal, TextInput,
  StyleSheet, ActivityIndicator, ScrollView, Image, Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { sponsorsApi, type Sponsor, type CreateSponsorPayload } from '@/lib/api';

const TIER_OPTIONS = ['title', 'gold', 'hole', 'silver', 'bronze'] as const;
const TIER_COLOR: Record<string, string> = {
  title:  '#8e44ad',
  gold:   '#f39c12',
  hole:   '#16a085',
  silver: '#7f8c8d',
  bronze: '#d35400',
};

export default function SponsorsScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [showAdd,  setShowAdd]  = useState(false);
  const [editing,  setEditing]  = useState<Sponsor | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSponsors(await sponsorsApi.list(id));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load sponsors.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function handleDelete(sponsor: Sponsor) {
    Alert.alert(
      'Remove Sponsor',
      `Remove "${sponsor.name}" from this event? This cannot be undone.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              await sponsorsApi.delete(id, sponsor.id);
              setSponsors(prev => prev.filter(s => s.id !== sponsor.id));
            } catch (e: any) {
              setError(e.message ?? 'Failed to remove sponsor. Please try again.');
            }
          },
        },
      ],
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
          <Text style={[styles.emptyText, { color: theme.colors.accent }]}>No sponsors added yet.</Text>
        </View>
      ) : (
        <FlatList
          data={sponsors}
          keyExtractor={s => s.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: s }) => (
            <View style={[styles.card, { borderColor: '#e8e8e8' }]}>
              <View style={styles.cardLeft}>
                {s.logoUrl ? (
                  <Image source={{ uri: s.logoUrl }} style={styles.logo} resizeMode="contain" />
                ) : (
                  <View style={[styles.logoPlaceholder, { backgroundColor: theme.colors.highlight }]}>
                    <Text style={{ fontSize: 10, color: theme.colors.accent }}>No Logo</Text>
                  </View>
                )}
              </View>
              <View style={styles.cardBody}>
                <Text style={[styles.sponsorName, { color: theme.colors.primary }]}>{s.name}</Text>
                {s.tagline && (
                  <Text style={[styles.tagline, { color: theme.colors.accent }]}>{s.tagline}</Text>
                )}
                {s.websiteUrl && (
                  <Text style={[styles.url, { color: theme.colors.action }]} numberOfLines={1}>{s.websiteUrl}</Text>
                )}
                {s.donationAmountCents != null && s.donationAmountCents > 0 && (
                  <Text style={[styles.donationAmt, { color: '#16a085' }]}>
                    ${(s.donationAmountCents / 100).toFixed(2)} donation
                  </Text>
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
                  <Text style={[styles.editBtnText, { color: theme.colors.accent }]}>Edit</Text>
                </Pressable>
                <Pressable
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(s)}
                >
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )}
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
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [pendingFile,     setPendingFile]      = useState<File | null>(null);
  const [localPreview,    setLocalPreview]    = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      setName(initialData?.name ?? '');
      setLogoUrl(initialData?.logoUrl ?? '');
      setTier(initialData?.tier ?? 'gold');
      setWebsiteUrl(initialData?.websiteUrl ?? '');
      setTagline(initialData?.tagline ?? '');
      setDonationAmt(
        initialData?.donationAmountCents ? String(initialData.donationAmountCents / 100) : ''
      );
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
    if (!pendingFile && logoUrl.trim() && !/^https?:\/\/.+/.test(logoUrl.trim())) {
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
        ? Math.round(parseFloat(donationAmt) * 100)
        : undefined;

      const payload: CreateSponsorPayload = {
        name: name.trim(),
        ...(logoUrl.trim() ? { logoUrl: logoUrl.trim() } : {}),
        tier,
        ...(websiteUrl.trim() ? { websiteUrl: websiteUrl.trim() } : {}),
        ...(tagline.trim() ? { tagline: tagline.trim() } : {}),
        ...(donationCents !== undefined ? { donationAmountCents: donationCents } : {}),
      };
      let result = isEdit
        ? await sponsorsApi.update(eventId, initialData!.id, payload)
        : await sponsorsApi.create(eventId, payload);

      if (pendingFile) {
        result = await sponsorsApi.uploadLogo(eventId, result.id, pendingFile);
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

          <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Sponsor Name</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.accent }]}
            value={name} onChangeText={setName}
            placeholder="Acme Corp" placeholderTextColor="#999" editable={!loading}
          />

          {/* Logo section */}
          <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Logo</Text>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.logoPreview} resizeMode="contain" />
          ) : null}
          <View style={styles.logoRow}>
            {/* Hidden file input — web only */}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
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
          <Text style={styles.orText}>— or paste a URL —</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.accent }]}
            value={logoUrl}
            onChangeText={v => { setLogoUrl(v); setPendingFile(null); setLocalPreview(null); }}
            placeholder="https://example.com/logo.png"
            placeholderTextColor="#999"
            editable={!loading}
          />

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
          <TextInput
            style={[styles.input, { borderColor: theme.colors.accent }]}
            value={donationAmt} onChangeText={setDonationAmt}
            placeholder="0.00 (optional)" placeholderTextColor="#999"
            keyboardType="decimal-pad" editable={!loading}
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

          <View style={styles.modalActions}>
            <Pressable style={[styles.cancelBtn, { borderColor: theme.colors.accent }]} onPress={onClose}>
              <Text style={[styles.cancelText, { color: theme.colors.accent }]}>Cancel</Text>
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
  page:   { flex: 1, padding: 28 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title:  { fontSize: 22, fontWeight: '800' },
  addBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8 },
  addBtnText: { fontSize: 14, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 15 },
  list: { gap: 12 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cardLeft: {},
  logo: { width: 64, height: 40, resizeMode: 'contain' },
  logoPlaceholder: { width: 64, height: 40, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  cardBody: { flex: 1 },
  sponsorName: { fontSize: 16, fontWeight: '700' },
  tagline: { fontSize: 13, marginTop: 2 },
  url: { fontSize: 12, marginTop: 2 },
  donationAmt: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  tierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  tierText: { fontSize: 11, fontWeight: '700', color: '#fff', textTransform: 'capitalize' },
  editBtn: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  editBtnText: { fontSize: 12, fontWeight: '600' },
  deleteBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  deleteBtnText: { fontSize: 12, fontWeight: '600', color: '#e74c3c' },
  errorBox: {
    backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, marginBottom: 12,
    borderLeftWidth: 3, borderLeftColor: '#e74c3c',
  },
  errorText: { color: '#c0392b', fontSize: 14 },
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modal:    { width: '100%', maxWidth: 480, backgroundColor: '#fff', borderRadius: 16, padding: 28 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#fafafa' },
  pillRow: { marginBottom: 4 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#ccc', marginRight: 8, backgroundColor: '#fafafa' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#444', textTransform: 'capitalize' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  submitBtn: { flex: 2, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  submitText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  logoPreview: { width: '100%', height: 80, borderRadius: 8, backgroundColor: '#f0f0f0', marginBottom: 8 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  uploadBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  uploadBtnText: { fontSize: 13, fontWeight: '700' },
  fileNameText: { flex: 1, fontSize: 12, color: '#555' },
  orText: { textAlign: 'center', color: '#aaa', fontSize: 12, marginVertical: 6 },
});
