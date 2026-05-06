import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput, Modal,
  ActivityIndicator, StyleSheet, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { leagueApi, LeagueSummary } from '@/lib/api';
import { useResponsive } from '@/lib/responsive';

const FORMATS    = ['Stableford', 'Stroke', 'Match'];
const HC_SYSTEMS = ['Club', 'USGA'];

export default function LeaguesScreen() {
  const theme      = useTheme();
  const router     = useRouter();
  const { isMobile } = useResponsive();

  const [leagues, setLeagues]       = useState<LeagueSummary[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [name, setName]         = useState('');
  const [format, setFormat]     = useState('Stableford');
  const [hcSystem, setHcSystem] = useState('Club');
  const [hcCap, setHcCap]       = useState('36');
  const [dues, setDues]         = useState('0');
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setLeagues(await leagueApi.list());
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await leagueApi.create({
        name: name.trim(),
        format,
        handicapSystem: hcSystem,
        handicapCap: parseFloat(hcCap) || 36,
        duesCents: Math.round((parseFloat(dues) || 0) * 100),
      });
      setShowCreate(false);
      setName(''); setFormat('Stableford'); setHcSystem('Club');
      setHcCap('36'); setDues('0');
      await load();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.accent }]}>
        <Text style={[styles.title, { color: theme.colors.primary }]}>Leagues</Text>
        <Pressable
          style={[styles.btn, { backgroundColor: theme.colors.primary }]}
          onPress={() => setShowCreate(true)}
        >
          <Text style={[styles.btnText, { color: theme.colors.surface }]}>+ New League</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={{ color: '#dc2626' }}>{error}</Text>
        </View>
      )}

      {leagues.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: theme.colors.accent }]}>
            No leagues yet. Create one to get started.
          </Text>
        </View>
      ) : (
        <FlatList
          data={leagues}
          keyExtractor={l => l.id}
          numColumns={!isMobile ? 3 : 1}
          contentContainerStyle={styles.list}
          key={!isMobile ? 'wide' : 'narrow'}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.card, {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.accent,
                flex: !isMobile ? 1 : undefined,
                margin: 6,
              }]}
              onPress={() => router.push(`/(app)/leagues/${item.id}` as never)}
            >
              <Text style={[styles.cardTitle, { color: theme.colors.primary }]}>{item.name}</Text>
              <View style={styles.cardRow}>
                <Text style={[styles.chip, { backgroundColor: theme.colors.accent + '33', color: theme.colors.primary }]}>
                  {item.format}
                </Text>
                <Text style={[styles.chip, { backgroundColor: theme.colors.primary + '11', color: theme.colors.primary }]}>
                  {item.handicapSystem}
                </Text>
              </View>
              <Text style={[styles.cardMeta, { color: theme.colors.accent }]}>
                {item.seasonCount} season{item.seasonCount !== 1 ? 's' : ''}
                {item.duesCents > 0 ? `  ·  $${(item.duesCents / 100).toFixed(0)} dues` : ''}
              </Text>
            </Pressable>
          )}
        />
      )}

      {/* Create Modal */}
      <Modal visible={showCreate} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>New League</Text>

            <Text style={[styles.label, { color: theme.colors.accent }]}>League Name</Text>
            <TextInput
              style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
              value={name} onChangeText={setName} placeholder="Tuesday Night League"
              placeholderTextColor={theme.colors.accent}
            />

            <Text style={[styles.label, { color: theme.colors.accent }]}>Format</Text>
            <View style={styles.segRow}>
              {FORMATS.map(f => (
                <Pressable
                  key={f}
                  style={[styles.seg, { borderColor: theme.colors.accent }, format === f && { backgroundColor: theme.colors.primary }]}
                  onPress={() => setFormat(f)}
                >
                  <Text style={{ color: format === f ? theme.colors.surface : theme.colors.primary, fontSize: 12 }}>
                    {f}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: theme.colors.accent }]}>Handicap System</Text>
            <View style={styles.segRow}>
              {HC_SYSTEMS.map(h => (
                <Pressable
                  key={h}
                  style={[styles.seg, { borderColor: theme.colors.accent }, hcSystem === h && { backgroundColor: theme.colors.primary }]}
                  onPress={() => setHcSystem(h)}
                >
                  <Text style={{ color: hcSystem === h ? theme.colors.surface : theme.colors.primary, fontSize: 12 }}>
                    {h}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[styles.label, { color: theme.colors.accent }]}>HC Cap</Text>
                <TextInput
                  style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                  value={hcCap} onChangeText={setHcCap} keyboardType="numeric"
                  placeholderTextColor={theme.colors.accent}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: theme.colors.accent }]}>Dues ($)</Text>
                <TextInput
                  style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                  value={dues} onChangeText={setDues} keyboardType="numeric" placeholder="0"
                  placeholderTextColor={theme.colors.accent}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowCreate(false)}>
                <Text style={{ color: theme.colors.accent }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, { backgroundColor: theme.colors.primary, opacity: saving ? 0.6 : 1 }]}
                onPress={handleCreate} disabled={saving}
              >
                <Text style={{ color: theme.colors.surface }}>{saving ? 'Creating…' : 'Create'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1 },
  title:        { fontSize: 22, fontWeight: '700' },
  btn:          { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  btnText:      { fontWeight: '600', fontSize: 14 },
  errorBanner:  { margin: 12, padding: 12, borderRadius: 8, backgroundColor: '#fef2f2' },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText:    { fontSize: 15, textAlign: 'center' },
  list:         { padding: 12 },
  card:         { borderRadius: 12, padding: 16, borderWidth: 1, marginBottom: 8 },
  cardTitle:    { fontSize: 17, fontWeight: '600', marginBottom: 8 },
  cardRow:      { flexDirection: 'row', gap: 6, marginBottom: 8 },
  chip:         { fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  cardMeta:     { fontSize: 12 },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  modal:        { width: '90%', maxWidth: 440, borderRadius: 16, padding: 24, gap: 4 },
  modalTitle:   { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  label:        { fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  input:        { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14 },
  segRow:       { flexDirection: 'row', gap: 6, marginTop: 4 },
  seg:          { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  row:          { flexDirection: 'row', marginTop: 4 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  cancelBtn:    { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
});
