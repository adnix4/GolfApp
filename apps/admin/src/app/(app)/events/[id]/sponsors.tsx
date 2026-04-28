import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, FlatList, Modal, TextInput,
  StyleSheet, ActivityIndicator, ScrollView, Image,
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

  async function handleDelete(sponsorId: string) {
    try {
      await sponsorsApi.delete(id, sponsorId);
      setSponsors(prev => prev.filter(s => s.id !== sponsorId));
    } catch (e: any) {
      setError(e.message ?? 'Failed to delete sponsor.');
    }
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
                  onPress={() => handleDelete(s.id)}
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
  const theme = useTheme();
  const isEdit = initialData != null;

  const [name,       setName]       = useState(initialData?.name ?? '');
  const [logoUrl,    setLogoUrl]    = useState(initialData?.logoUrl ?? '');
  const [tier,       setTier]       = useState<string>(initialData?.tier ?? 'gold');
  const [websiteUrl, setWebsiteUrl] = useState(initialData?.websiteUrl ?? '');
  const [tagline,    setTagline]    = useState(initialData?.tagline ?? '');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    setName(initialData?.name ?? '');
    setLogoUrl(initialData?.logoUrl ?? '');
    setTier(initialData?.tier ?? 'gold');
    setWebsiteUrl(initialData?.websiteUrl ?? '');
    setTagline(initialData?.tagline ?? '');
    setError(null);
  }, [initialData, visible]);

  async function handleSubmit() {
    if (!name.trim() || !logoUrl.trim()) { setError('Name and logo URL are required.'); return; }
    setError(null);
    setLoading(true);
    try {
      const payload: CreateSponsorPayload = {
        name: name.trim(),
        logoUrl: logoUrl.trim(),
        tier,
        ...(websiteUrl.trim() ? { websiteUrl: websiteUrl.trim() } : {}),
        ...(tagline.trim() ? { tagline: tagline.trim() } : {}),
      };
      const result = isEdit
        ? await sponsorsApi.update(eventId, initialData!.id, payload)
        : await sponsorsApi.create(eventId, payload);
      onSaved(result);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save sponsor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>
            {isEdit ? 'Edit Sponsor' : 'Add Sponsor'}
          </Text>
          {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

          {[
            { label: 'Sponsor Name', value: name,       setter: setName,       placeholder: 'Acme Corp' },
            { label: 'Logo URL',     value: logoUrl,    setter: setLogoUrl,    placeholder: 'https://...' },
            { label: 'Website URL',  value: websiteUrl, setter: setWebsiteUrl, placeholder: 'https://acme.com (optional)' },
            { label: 'Tagline',      value: tagline,    setter: setTagline,    placeholder: 'Powering your round (optional)' },
          ].map(f => (
            <View key={f.label}>
              <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>{f.label}</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.colors.accent }]}
                value={f.value}
                onChangeText={f.setter}
                placeholder={f.placeholder}
                placeholderTextColor="#999"
                editable={!loading}
              />
            </View>
          ))}

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
});
