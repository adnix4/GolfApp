import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, FlatList, Modal, TextInput,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { challengesApi, eventsApi, type HoleChallenge } from '@/lib/api';

const COMMON_CHALLENGES = [
  'Closest to Pin',
  'Longest Drive',
  'Longest Putt',
  'KP (Hole in One)',
  'Closest to Line',
  'Beat the Pro',
];

export default function ChallengesScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const [challenges, setChallenges] = useState<HoleChallenge[]>([]);
  const [holeCount,  setHoleCount]  = useState(18);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [editing,    setEditing]    = useState<HoleChallenge | null>(null);  // null = add new
  const [showForm,   setShowForm]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [ch, ev] = await Promise.all([
        challengesApi.list(id),
        eventsApi.get(id),
      ]);
      setChallenges(ch);
      setHoleCount(ev.holes);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load challenges.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(holeNumber: number) {
    try {
      await challengesApi.remove(id, holeNumber);
      setChallenges(prev => prev.filter(c => c.holeNumber !== holeNumber));
    } catch (e: any) {
      setError(e.message ?? 'Failed to delete.');
    }
  }

  function openAdd() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(challenge: HoleChallenge) {
    setEditing(challenge);
    setShowForm(true);
  }

  function handleSaved(updated: HoleChallenge) {
    setChallenges(prev => {
      const idx = prev.findIndex(c => c.holeNumber === updated.holeNumber);
      return idx >= 0
        ? prev.map((c, i) => i === idx ? updated : c)
        : [...prev, updated].sort((a, b) => a.holeNumber - b.holeNumber);
    });
    setShowForm(false);
  }

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.primary }]}>
          Hole Challenges ({challenges.length})
        </Text>
        <Pressable
          style={[styles.addBtn, { backgroundColor: theme.colors.primary }]}
          onPress={openAdd}
          accessibilityRole="button"
        >
          <Text style={[styles.addBtnText, { color: '#fff' }]}>+ Add Challenge</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : challenges.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.colors.accent }]}>
            No hole challenges configured.
          </Text>
          <Text style={[styles.emptyHint, { color: theme.colors.accent }]}>
            Add closest-to-pin, longest drive, and other contests.
          </Text>
        </View>
      ) : (
        <FlatList
          data={challenges}
          keyExtractor={c => String(c.holeNumber)}
          contentContainerStyle={styles.list}
          renderItem={({ item: ch }) => (
            <View style={[styles.card, { borderColor: '#e8e8e8' }]}>
              <View style={[styles.holeTag, { backgroundColor: theme.colors.primary }]}>
                <Text style={styles.holeTagText}>Hole {ch.holeNumber}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.challengeName, { color: theme.colors.primary }]}>
                  {ch.description}
                </Text>
                {ch.sponsorName && (
                  <Text style={[styles.sponsorLine, { color: theme.colors.accent }]}>
                    Sponsored by {ch.sponsorName}
                  </Text>
                )}
                {ch.winnerName && (
                  <Text style={[styles.winnerLine, { color: '#27ae60' }]}>
                    🏆 Winner: {ch.winnerName}
                  </Text>
                )}
              </View>
              <View style={styles.cardActions}>
                <Pressable onPress={() => openEdit(ch)} style={styles.editBtn}>
                  <Text style={[styles.editText, { color: theme.colors.action }]}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(ch.holeNumber)} style={styles.deleteBtn}>
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <ChallengeFormModal
        visible={showForm}
        eventId={id}
        holeCount={holeCount}
        initial={editing}
        existingHoles={challenges.map(c => c.holeNumber)}
        onClose={() => setShowForm(false)}
        onSaved={handleSaved}
      />
    </View>
  );
}

// ── Challenge Form Modal ──────────────────────────────────────────────────────

interface FormProps {
  visible:       boolean;
  eventId:       string;
  holeCount:     number;
  initial:       HoleChallenge | null;
  existingHoles: number[];
  onClose:       () => void;
  onSaved:       (c: HoleChallenge) => void;
}

function ChallengeFormModal({ visible, eventId, holeCount, initial, existingHoles, onClose, onSaved }: FormProps) {
  const theme = useTheme();

  const [holeNumber,   setHoleNumber]   = useState('');
  const [description,  setDescription]  = useState('');
  const [sponsorName,  setSponsorName]  = useState('');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setHoleNumber(initial ? String(initial.holeNumber) : '');
      setDescription(initial?.description ?? '');
      setSponsorName(initial?.sponsorName ?? '');
      setError(null);
    }
  }, [visible, initial]);

  async function handleSave() {
    const num = parseInt(holeNumber, 10);
    if (!holeNumber || isNaN(num) || num < 1 || num > holeCount) {
      setError(`Hole number must be between 1 and ${holeCount}.`);
      return;
    }
    if (!description.trim()) { setError('Description is required.'); return; }
    if (!initial && existingHoles.includes(num)) {
      setError(`Hole ${num} already has a challenge. Edit it instead.`);
      return;
    }
    setError(null); setLoading(true);
    try {
      const result = await challengesApi.upsert(eventId, num, {
        description: description.trim(),
        sponsorName: sponsorName.trim() || undefined,
      });
      onSaved(result);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>
            {initial ? `Edit — Hole ${initial.holeNumber}` : 'Add Challenge'}
          </Text>

          {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

          {/* Hole selector */}
          {!initial && (
            <>
              <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Hole Number</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.colors.accent }]}
                value={holeNumber}
                onChangeText={setHoleNumber}
                placeholder={`1–${holeCount}`}
                placeholderTextColor="#999"
                keyboardType="numeric"
                editable={!loading}
              />
            </>
          )}

          {/* Quick-pick challenge types */}
          <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Challenge Type</Text>
          <View style={styles.quickPicks}>
            {COMMON_CHALLENGES.map(c => (
              <Pressable
                key={c}
                onPress={() => setDescription(c)}
                style={[
                  styles.quickChip,
                  description === c && { backgroundColor: theme.colors.primary },
                ]}
              >
                <Text style={[
                  styles.quickChipText,
                  { color: description === c ? '#fff' : theme.colors.primary },
                ]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.accent, marginTop: 6 }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Custom description…"
            placeholderTextColor="#999"
            editable={!loading}
          />

          <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Sponsor (optional)</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.accent }]}
            value={sponsorName}
            onChangeText={setSponsorName}
            placeholder="ACME Corp"
            placeholderTextColor="#999"
            editable={!loading}
          />

          <View style={styles.modalActions}>
            <Pressable style={[styles.cancelBtn, { borderColor: theme.colors.accent }]} onPress={onClose}>
              <Text style={[styles.cancelText, { color: theme.colors.accent }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, { backgroundColor: theme.colors.primary }, loading && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page:   { flex: 1, backgroundColor: '#f7f8fa' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingBottom: 16 },
  title:  { fontSize: 22, fontWeight: '800' },
  addBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8 },
  addBtnText: { fontSize: 14, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 16, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  emptyHint: { fontSize: 13, textAlign: 'center', opacity: 0.8 },

  errorBox: { margin: 16, backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
  errorText: { color: '#c0392b', fontSize: 14 },

  list: { padding: 16, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderWidth: 1, borderRadius: 12, padding: 14 },
  holeTag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignItems: 'center', minWidth: 58 },
  holeTagText: { fontSize: 12, fontWeight: '800', color: '#fff', textAlign: 'center' },
  challengeName: { fontSize: 15, fontWeight: '700' },
  sponsorLine: { fontSize: 13, marginTop: 2 },
  winnerLine: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  cardActions: { gap: 8 },
  editBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: '#3498db' },
  editText: { fontSize: 12, fontWeight: '700' },
  deleteBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: '#e74c3c' },
  deleteText: { fontSize: 12, fontWeight: '700', color: '#e74c3c' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modal: { width: '90%', maxWidth: 460, backgroundColor: '#fff', borderRadius: 16, padding: 24, gap: 4 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#fafafa' },
  quickPicks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickChip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  quickChipText: { fontSize: 13, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 2, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
