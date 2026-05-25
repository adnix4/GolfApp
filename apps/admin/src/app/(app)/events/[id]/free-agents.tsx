import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, FlatList, Modal, ScrollView, TextInput,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { playersApi, teamsApi, type Player, type Team, type AddPlayerPayload } from '@/lib/api';

function fmtAgeGroup(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v === 'Under30')    return 'Under 30';
  if (v === 'From30To50') return '30–50';
  if (v === 'Over50')     return 'Over 50';
  return v;
}

function digitsOnly(v: string): string { return v.replace(/\D/g, '').slice(0, 10); }
function fmtPhoneInput(digits: string): string {
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
function fmtPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

export default function FreeAgentsScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const [agents,   setAgents]   = useState<Player[]>([]);
  const [teams,    setTeams]    = useState<Team[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [modal,    setModal]    = useState<'assign' | 'add' | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [fa, ts] = await Promise.all([
        playersApi.listFreeAgents(id),
        teamsApi.list(id),
      ]);
      setAgents(fa);
      setTeams(ts);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load free agents.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function toggleSelect(playerId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(playerId) ? next.delete(playerId) : next.add(playerId);
      return next;
    });
  }

  async function handleAssign(teamId: string) {
    setModal(null);
    const ids = [...selected];
    setError(null);
    try {
      await Promise.all(ids.map(pid => playersApi.assignToTeam(id, pid, teamId)));
      setSelected(new Set());
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Assignment failed.');
    }
  }

  function handleAgentAdded(player: Player) {
    setAgents(prev => [...prev, player]);
    setModal(null);
  }

  const selectedList = agents.filter(a => selected.has(a.id));

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.primary }]}>
          Free Agents ({agents.length})
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            style={[styles.addBtn, { backgroundColor: theme.colors.primary }]}
            onPress={() => setModal('add')}
          >
            <Text style={[styles.addBtnText, { color: theme.colors.surface }]}>+ Add Free Agent</Text>
          </Pressable>
          <Pressable onPress={load} style={styles.refreshBtn}>
            <Text style={[styles.refreshText, { color: theme.colors.accent }]}>↻ Refresh</Text>
          </Pressable>
        </View>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Selection action bar */}
      {selected.size > 0 && (
        <View style={[styles.actionBar, { backgroundColor: theme.colors.highlight }]}>
          <Text style={[styles.actionBarText, { color: theme.colors.primary }]}>
            {selected.size} player{selected.size !== 1 ? 's' : ''} selected
          </Text>
          <Pressable
            style={[styles.assignBtn, { backgroundColor: theme.colors.action }]}
            onPress={() => setModal('assign')}
          >
            <Text style={styles.assignBtnText}>Assign to Team</Text>
          </Pressable>
          <Pressable onPress={() => setSelected(new Set())} style={styles.clearBtn}>
            <Text style={[styles.clearText, { color: theme.colors.accent }]}>Clear</Text>
          </Pressable>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : agents.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.colors.accent }]}>
            No free agents for this event.
          </Text>
        </View>
      ) : (
        <FlatList
          data={agents}
          keyExtractor={a => a.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: agent }) => {
            const isSelected = selected.has(agent.id);
            return (
              <Pressable
                onPress={() => toggleSelect(agent.id)}
                style={[
                  styles.card,
                  { borderColor: isSelected ? theme.colors.primary : '#e8e8e8' },
                  isSelected && { backgroundColor: theme.colors.highlight },
                ]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
              >
                <View style={[
                  styles.checkbox,
                  { borderColor: isSelected ? theme.colors.primary : '#ccc' },
                  isSelected && { backgroundColor: theme.colors.primary },
                ]}>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.agentName, { color: theme.colors.primary }]}>
                    {agent.firstName} {agent.lastName}
                  </Text>
                  {!!agent.email && (
                    <Text style={[styles.agentMeta, { color: theme.colors.accent }]}>{agent.email}</Text>
                  )}
                  {!!agent.phone && (
                    <Text style={[styles.agentMeta, { color: theme.colors.accent }]}>{fmtPhone(agent.phone)}</Text>
                  )}
                  {(agent.handicapIndex != null || agent.skillLevel || agent.ageGroup) && (
                    <Text style={[styles.agentMeta, { color: theme.colors.accent }]}>
                      {[
                        agent.handicapIndex != null ? `HCP ${agent.handicapIndex}` : null,
                        agent.skillLevel ?? null,
                        fmtAgeGroup(agent.ageGroup),
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                  {!!agent.pairingNote && (
                    <Text style={[styles.agentNote, { color: theme.colors.accent }]}>
                      Note: {agent.pairingNote}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* Add free agent modal */}
      <AddFreeAgentModal
        visible={modal === 'add'}
        eventId={id}
        onClose={() => setModal(null)}
        onAdded={handleAgentAdded}
      />

      {/* Assign to team modal */}
      <Modal
        visible={modal === 'assign'}
        transparent
        animationType="fade"
        onRequestClose={() => setModal(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>
              Assign to Team
            </Text>
            <Text style={[styles.modalSub, { color: theme.colors.accent }]}>
              Assigning {selectedList.map(p => p.firstName).join(', ')} to:
            </Text>
            <ScrollView style={styles.teamList}>
              {teams.map(team => (
                <Pressable
                  key={team.id}
                  style={[styles.teamOption, { borderColor: '#e8e8e8' }]}
                  onPress={() => handleAssign(team.id)}
                >
                  <Text style={[styles.teamOptionName, { color: theme.colors.primary }]}>
                    {team.name}
                  </Text>
                  <Text style={[styles.teamOptionMeta, { color: theme.colors.accent }]}>
                    {team.players.length}/{team.maxPlayers} players
                  </Text>
                </Pressable>
              ))}
              {teams.length === 0 && (
                <Text style={[styles.teamOptionMeta, { color: theme.colors.accent, textAlign: 'center', padding: 16 }]}>
                  No teams available. Register a team first.
                </Text>
              )}
            </ScrollView>
            <Pressable
              style={[styles.cancelModalBtn, { borderColor: theme.colors.accent }]}
              onPress={() => setModal(null)}
            >
              <Text style={[styles.cancelModalText, { color: theme.colors.accent }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Add Free Agent Modal ──────────────────────────────────────────────────────

interface AddFreeAgentModalProps {
  visible:  boolean;
  eventId:  string;
  onClose:  () => void;
  onAdded:  (player: Player) => void;
}

function AddFreeAgentModal({ visible, eventId, onClose, onAdded }: AddFreeAgentModalProps) {
  const theme = useTheme();
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [phone,     setPhone]     = useState('');
  const [handicap,  setHandicap]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  function reset() { setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setHandicap(''); setError(null); }

  function validate(): boolean {
    if (!firstName.trim()) { setError('First name is required.'); return false; }
    if (!lastName.trim())  { setError('Last name is required.'); return false; }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(`"${email.trim()}" is not a valid email address.`); return false;
    }
    if (phone.trim() && digitsOnly(phone).length !== 10) {
      setError('Phone number must be 10 digits.'); return false;
    }
    if (handicap.trim() && isNaN(Number(handicap))) {
      setError('Handicap must be a number.'); return false;
    }
    return true;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setError(null);
    setLoading(true);
    try {
      const payload: AddPlayerPayload = {
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        email:     email.trim() || undefined,
        phone:     phone.trim() || undefined,
        ...(handicap.trim() ? { handicapIndex: Number(handicap) } : {}),
      };
      const player = await playersApi.add(eventId, payload);
      reset();
      onAdded(player);
    } catch (e: any) {
      setError(e.message ?? 'Failed to add free agent.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { reset(); onClose(); }}>
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>Add Free Agent</Text>
          {error && (
            <View style={{ backgroundColor: '#fdf2f2', borderRadius: 8, padding: 10, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#e74c3c' }}>
              <Text style={{ color: '#c0392b', fontSize: 13 }}>{error}</Text>
            </View>
          )}
          <View style={styles.nameRow}>
            <TextInput
              style={[styles.input, styles.halfInput, { borderColor: '#ccc' }]}
              value={firstName} onChangeText={v => { setFirstName(v); if (error) setError(null); }}
              placeholder="First *" placeholderTextColor="#999" editable={!loading}
            />
            <TextInput
              style={[styles.input, styles.halfInput, { borderColor: '#ccc' }]}
              value={lastName} onChangeText={v => { setLastName(v); if (error) setError(null); }}
              placeholder="Last *" placeholderTextColor="#999" editable={!loading}
            />
          </View>
          <TextInput
            style={[styles.input, { borderColor: '#ccc', marginTop: 8 }]}
            value={email} onChangeText={v => { setEmail(v); if (error) setError(null); }}
            placeholder="email@example.com (optional)" placeholderTextColor="#999"
            keyboardType="email-address" autoCapitalize="none" editable={!loading}
          />
          <TextInput
            style={[styles.input, { borderColor: '#ccc', marginTop: 8 }]}
            value={phone}
            onChangeText={v => { setPhone(fmtPhoneInput(digitsOnly(v))); if (error) setError(null); }}
            placeholder="(555) 867-5309 (optional)" placeholderTextColor="#999"
            keyboardType="phone-pad" editable={!loading}
          />
          <TextInput
            style={[styles.input, { borderColor: '#ccc', marginTop: 8 }]}
            value={handicap} onChangeText={v => { setHandicap(v.replace(/[^0-9.]/g, '')); if (error) setError(null); }}
            placeholder="Handicap index (optional)" placeholderTextColor="#999"
            keyboardType="decimal-pad" editable={!loading}
          />
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
            <Pressable
              style={[styles.cancelModalBtn, { flex: 1, borderColor: '#aaa' }]}
              onPress={() => { reset(); onClose(); }}
            >
              <Text style={[styles.cancelModalText, { color: '#888' }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[{ flex: 2, borderRadius: 8, paddingVertical: 12, alignItems: 'center' as const }, { backgroundColor: theme.colors.primary }, loading && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Add</Text>}
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { fontSize: 13, fontWeight: '700' },
  refreshBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  refreshText: { fontSize: 14, fontWeight: '600' },
  nameRow: { flexDirection: 'row', gap: 8 },
  halfInput: { flex: 1 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#fafafa' },

  errorBox: { margin: 16, backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
  errorText: { color: '#c0392b', fontSize: 14 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 15 },

  actionBar: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 20, gap: 12 },
  actionBarText: { flex: 1, fontSize: 14, fontWeight: '600' },
  assignBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  assignBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  clearBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  clearText: { fontSize: 13, fontWeight: '600' },

  list: { padding: 16, gap: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderWidth: 1.5, borderRadius: 10, padding: 14 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '800' },
  agentName: { fontSize: 15, fontWeight: '700' },
  agentMeta: { fontSize: 13, marginTop: 2 },
  agentNote: { fontSize: 12, marginTop: 3, fontStyle: 'italic' },

  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  modalBox:  { width: '90%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 14, padding: 24, gap: 12 },
  modalTitle:{ fontSize: 18, fontWeight: '800' },
  modalSub:  { fontSize: 13 },
  teamList:  { maxHeight: 280 },
  teamOption:{ borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8 },
  teamOptionName: { fontSize: 15, fontWeight: '700' },
  teamOptionMeta: { fontSize: 12, marginTop: 2 },
  cancelModalBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  cancelModalText: { fontSize: 14, fontWeight: '600' },
});
