import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput, Modal,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { leagueApi, SeasonSummary } from '@/lib/api';

export default function LeagueDetailScreen() {
  const theme  = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [seasons, setSeasons]       = useState<SeasonSummary[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [sName, setSName]     = useState('');
  const [rounds, setRounds]   = useState('18');
  const [start, setStart]     = useState('');
  const [end, setEnd]         = useState('');
  const [counted, setCounted] = useState('0');
  const [method, setMethod]   = useState('TotalNet');
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      setSeasons(await leagueApi.getSeasons(id));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!sName.trim() || !start || !end || !id) return;
    setSaving(true);
    try {
      await leagueApi.createSeason(id, {
        name: sName.trim(),
        totalRounds: parseInt(rounds) || 18,
        startDate: start,
        endDate: end,
        roundsCounted: parseInt(counted) || 0,
        standingMethod: method,
      });
      setShowCreate(false);
      resetForm();
      await load();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setSName(''); setRounds('18'); setStart(''); setEnd('');
    setCounted('0'); setMethod('TotalNet');
  }

  const statusColor = (s: string) => {
    if (s === 'Active')    return '#16a34a';
    if (s === 'Completed') return '#6366f1';
    return theme.colors.accent;
  };

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface }]}>
      <View style={[styles.header, { borderBottomColor: theme.colors.accent }]}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: theme.colors.action, fontSize: 15 }}>← Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.primary }]}>Seasons</Text>
        <Pressable
          style={[styles.btn, { backgroundColor: theme.colors.primary }]}
          onPress={() => setShowCreate(true)}
        >
          <Text style={[styles.btnText, { color: theme.colors.surface }]}>+ Season</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={{ color: '#dc2626' }}>{error}</Text>
        </View>
      )}

      {seasons.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: theme.colors.accent }]}>
            No seasons yet. Create the first one.
          </Text>
        </View>
      ) : (
        <FlatList
          data={seasons}
          keyExtractor={s => s.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.accent }]}
              onPress={() => router.push(`/(app)/leagues/${id}/seasons/${item.id}` as never)}
            >
              <View style={styles.cardTop}>
                <Text style={[styles.cardTitle, { color: theme.colors.primary }]}>{item.name}</Text>
                <Text style={[styles.statusDot, { color: statusColor(item.status) }]}>
                  ● {item.status}
                </Text>
              </View>
              <Text style={[styles.cardMeta, { color: theme.colors.accent }]}>
                {item.startDate} – {item.endDate}
              </Text>
              <View style={styles.cardStats}>
                <Text style={[styles.stat, { color: theme.colors.primary }]}>
                  {item.memberCount} member{item.memberCount !== 1 ? 's' : ''}
                </Text>
                <Text style={[styles.stat, { color: theme.colors.primary }]}>
                  {item.roundCount}/{item.totalRounds} rounds
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}

      <Modal visible={showCreate} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>New Season</Text>

            <Text style={[styles.label, { color: theme.colors.accent }]}>Season Name</Text>
            <TextInput
              style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
              value={sName} onChangeText={setSName} placeholder="2026 Spring Season"
              placeholderTextColor={theme.colors.accent}
            />

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[styles.label, { color: theme.colors.accent }]}>Start Date</Text>
                <TextInput
                  style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                  value={start} onChangeText={setStart} placeholder="2026-04-01"
                  placeholderTextColor={theme.colors.accent}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: theme.colors.accent }]}>End Date</Text>
                <TextInput
                  style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                  value={end} onChangeText={setEnd} placeholder="2026-09-30"
                  placeholderTextColor={theme.colors.accent}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[styles.label, { color: theme.colors.accent }]}>Total Rounds</Text>
                <TextInput
                  style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                  value={rounds} onChangeText={setRounds} keyboardType="numeric"
                  placeholderTextColor={theme.colors.accent}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: theme.colors.accent }]}>Rounds Counted (0=all)</Text>
                <TextInput
                  style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                  value={counted} onChangeText={setCounted} keyboardType="numeric"
                  placeholderTextColor={theme.colors.accent}
                />
              </View>
            </View>

            <Text style={[styles.label, { color: theme.colors.accent }]}>Standing Method</Text>
            <View style={styles.segRow}>
              {['TotalNet', 'AverageNet'].map(m => (
                <Pressable
                  key={m}
                  style={[styles.seg, { borderColor: theme.colors.accent }, method === m && { backgroundColor: theme.colors.primary }]}
                  onPress={() => setMethod(m)}
                >
                  <Text style={{ color: method === m ? theme.colors.surface : theme.colors.primary, fontSize: 12 }}>
                    {m}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => { setShowCreate(false); resetForm(); }}>
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
  title:        { fontSize: 20, fontWeight: '700' },
  btn:          { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  btnText:      { fontWeight: '600', fontSize: 14 },
  errorBanner:  { margin: 12, padding: 12, borderRadius: 8, backgroundColor: '#fef2f2' },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText:    { fontSize: 15, textAlign: 'center' },
  list:         { padding: 16, gap: 12 },
  card:         { borderRadius: 12, padding: 16, borderWidth: 1 },
  cardTop:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle:    { fontSize: 17, fontWeight: '600' },
  statusDot:    { fontSize: 12, fontWeight: '600' },
  cardMeta:     { fontSize: 12, marginBottom: 8 },
  cardStats:    { flexDirection: 'row', gap: 16 },
  stat:         { fontSize: 13, fontWeight: '500' },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  modal:        { width: '90%', maxWidth: 460, borderRadius: 16, padding: 24 },
  modalTitle:   { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  label:        { fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  input:        { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14 },
  row:          { flexDirection: 'row', marginTop: 4 },
  segRow:       { flexDirection: 'row', gap: 6, marginTop: 4 },
  seg:          { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  cancelBtn:    { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
});
