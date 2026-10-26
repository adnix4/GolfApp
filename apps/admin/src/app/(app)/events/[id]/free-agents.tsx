import { useState, useCallback } from 'react';
import {
  View, Text, Pressable, FlatList, Modal, ScrollView, TextInput,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { digitsOnly, fmtAgeGroup, fmtPhone, fmtPhoneInput, validateGolfer, toPlayerInput } from '@gfp/shared-types';
import { playersApi, type Player, type AddPlayerPayload } from '@/lib/api';
import { useFreeAgentList, useTeamList } from '@/lib/queries';
import { fontSize, radius, spacing } from '@gfp/theme';

export default function FreeAgentsScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const agentList = useFreeAgentList(id);
  const teamList  = useTeamList(id);
  const { items: agents, setItems: setAgents } = agentList;
  const teams   = teamList.items;
  const loading = agentList.loading || teamList.loading;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionError, setError] = useState<string | null>(null);
  const loadError = agentList.error ?? teamList.error;
  const error = actionError
    ?? (loadError ? (loadError.message || 'Failed to load free agents.') : null);
  const [modal,    setModal]    = useState<'assign' | 'add' | null>(null);

  const { refetch: refetchAgents } = agentList;
  const { refetch: refetchTeams }  = teamList;
  const load = useCallback(async () => {
    setError(null);
    await Promise.all([refetchAgents(), refetchTeams()]);
  }, [refetchAgents, refetchTeams]);

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
      // The assigned golfers leave this list and join a roster.
      setAgents(prev => prev.filter(a => !ids.includes(a.id)));
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
            <Text style={[styles.refreshText, { color: theme.mutedText }]}>↻ Refresh</Text>
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
            <Text style={[styles.assignBtnText, { color: theme.ctaLabel }]}>Assign to Team</Text>
          </Pressable>
          <Pressable onPress={() => setSelected(new Set())} style={styles.clearBtn}>
            <Text style={[styles.clearText, { color: theme.mutedText }]}>Clear</Text>
          </Pressable>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : agents.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.mutedText }]}>
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
                    <Text style={[styles.agentMeta, { color: theme.mutedText }]}>{agent.email}</Text>
                  )}
                  {!!agent.phone && (
                    <Text style={[styles.agentMeta, { color: theme.mutedText }]}>{fmtPhone(agent.phone)}</Text>
                  )}
                  {(agent.handicapIndex != null || agent.skillLevel || agent.ageGroup) && (
                    <Text style={[styles.agentMeta, { color: theme.mutedText }]}>
                      {[
                        agent.handicapIndex != null ? `HCP ${agent.handicapIndex}` : null,
                        agent.skillLevel ?? null,
                        fmtAgeGroup(agent.ageGroup),
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                  {!!agent.pairingNote && (
                    <Text style={[styles.agentNote, { color: theme.mutedText }]}>
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
            <Text style={[styles.modalSub, { color: theme.mutedText }]}>
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
                  <Text style={[styles.teamOptionMeta, { color: theme.mutedText }]}>
                    {team.players.length}/{team.maxPlayers} players
                  </Text>
                </Pressable>
              ))}
              {teams.length === 0 && (
                <Text style={[styles.teamOptionMeta, { color: theme.mutedText, textAlign: 'center', padding: spacing[4] }]}>
                  No teams available. Register a team first.
                </Text>
              )}
            </ScrollView>
            <Pressable
              style={[styles.cancelModalBtn, { borderColor: theme.colors.accent }]}
              onPress={() => setModal(null)}
            >
              <Text style={[styles.cancelModalText, { color: theme.mutedText }]}>Cancel</Text>
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

  const golfer = { firstName, lastName, email, phone, handicap };

  // Same rules as every other golfer form: email required, phone optional at the desk.
  function validate(): boolean {
    const problem = validateGolfer(golfer);
    if (problem) { setError(problem); return false; }
    return true;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setError(null);
    setLoading(true);
    try {
      const payload: AddPlayerPayload = toPlayerInput(golfer);
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
            <View style={{ backgroundColor: '#fdf2f2', borderRadius: radius.md, padding: spacing[3], marginBottom: spacing[3], borderLeftWidth: 3, borderLeftColor: '#e74c3c' }}>
              <Text style={{ color: '#c0392b', fontSize: fontSize.sm }}>{error}</Text>
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
            style={[styles.input, { borderColor: '#ccc', marginTop: spacing[2] }]}
            value={email} onChangeText={v => { setEmail(v); if (error) setError(null); }}
            placeholder="email@example.com *" placeholderTextColor="#999"
            keyboardType="email-address" autoCapitalize="none" editable={!loading}
          />
          <TextInput
            style={[styles.input, { borderColor: '#ccc', marginTop: spacing[2] }]}
            value={phone}
            onChangeText={v => { setPhone(fmtPhoneInput(digitsOnly(v))); if (error) setError(null); }}
            placeholder="(555) 867-5309 (optional)" placeholderTextColor="#999"
            keyboardType="phone-pad" editable={!loading}
          />
          <TextInput
            style={[styles.input, { borderColor: '#ccc', marginTop: spacing[2] }]}
            value={handicap} onChangeText={v => { setHandicap(v.replace(/[^0-9.]/g, '')); if (error) setError(null); }}
            placeholder="Handicap index (optional)" placeholderTextColor="#999"
            keyboardType="decimal-pad" editable={!loading}
          />
          <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[5] }}>
            <Pressable
              style={[styles.cancelModalBtn, { flex: 1, borderColor: '#aaa' }]}
              onPress={() => { reset(); onClose(); }}
            >
              <Text style={[styles.cancelModalText, { color: '#888' }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[{ flex: 2, borderRadius: radius.md, paddingVertical: spacing[3], alignItems: 'center' as const }, { backgroundColor: theme.colors.primary }, loading && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ fontSize: fontSize.lg, fontWeight: '700', color: '#fff' }}>Add</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page:   { flex: 1, backgroundColor: '#f7f8fa' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing[6], paddingBottom: spacing[4] },
  title:  { fontSize: fontSize.title, fontWeight: '800' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  addBtn: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.md },
  addBtnText: { fontSize: fontSize.sm, fontWeight: '700' },
  refreshBtn: { paddingVertical: spacing[2], paddingHorizontal: spacing[3] },
  refreshText: { fontSize: fontSize.md, fontWeight: '600' },
  nameRow: { flexDirection: 'row', gap: spacing[2] },
  // minWidth 0: a web <input> won't shrink below its default ~20ch otherwise,
  // so two side by side overflow the 420px modal.
  halfInput: { flex: 1, minWidth: 0 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing[3], paddingVertical: spacing[3], fontSize: fontSize.lg, backgroundColor: '#fafafa' },

  errorBox: { margin: spacing[4], backgroundColor: '#fdf2f2', borderRadius: radius.md, padding: spacing[3], borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
  errorText: { color: '#c0392b', fontSize: fontSize.md },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: fontSize.lg },

  actionBar: { flexDirection: 'row', alignItems: 'center', padding: spacing[3], paddingHorizontal: spacing[5], gap: spacing[3] },
  actionBarText: { flex: 1, fontSize: fontSize.md, fontWeight: '600' },
  assignBtn: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.md },
  assignBtnText: { fontSize: fontSize.sm, fontWeight: '700' },
  clearBtn: { paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  clearText: { fontSize: fontSize.sm, fontWeight: '600' },

  list: { padding: spacing[4], gap: spacing[2] },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], backgroundColor: '#fff', borderWidth: 1.5, borderRadius: radius.lg, padding: spacing[4] },
  checkbox: { width: 22, height: 22, borderRadius: radius.sm, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: '#fff', fontSize: fontSize.xs, fontWeight: '800' },
  agentName: { fontSize: fontSize.lg, fontWeight: '700' },
  agentMeta: { fontSize: fontSize.sm, marginTop: spacing[0.5] },
  agentNote: { fontSize: fontSize.xs, marginTop: spacing[1], fontStyle: 'italic' },

  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  modalBox:  { width: '90%', maxWidth: 420, backgroundColor: '#fff', borderRadius: radius.xl, padding: spacing[6], gap: spacing[3] },
  modalTitle:{ fontSize: fontSize.xl, fontWeight: '800' },
  modalSub:  { fontSize: fontSize.sm },
  teamList:  { maxHeight: 280 },
  teamOption:{ borderWidth: 1, borderRadius: radius.md, padding: spacing[3], marginBottom: spacing[2] },
  teamOptionName: { fontSize: fontSize.lg, fontWeight: '700' },
  teamOptionMeta: { fontSize: fontSize.xs, marginTop: spacing[0.5] },
  cancelModalBtn: { borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing[3], alignItems: 'center', marginTop: spacing[1] },
  cancelModalText: { fontSize: fontSize.md, fontWeight: '600' },
});
