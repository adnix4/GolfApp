import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, FlatList, Modal, TextInput,
  StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { teamsApi, type Team, type RegisterTeamPayload } from '@/lib/api';

const STATUS_COLOR: Record<string, string> = {
  pending:    '#f39c12',
  checked_in: '#2ecc71',
  complete:   '#27ae60',
};

export default function TeamsScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const [teams,   setTeams]   = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTeams(await teamsApi.list(id));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load teams.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleCheckIn(teamId: string) {
    try {
      const updated = await teamsApi.checkIn(id, teamId);
      setTeams(prev => prev.map(t => t.id === teamId ? updated : t));
    } catch (e: any) {
      setError(e.message ?? 'Check-in failed.');
    }
  }

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.primary }]}>
          Teams ({teams.length})
        </Text>
        <Pressable
          style={[styles.addBtn, { backgroundColor: theme.colors.primary }]}
          onPress={() => setShowAdd(true)}
          accessibilityRole="button"
        >
          <Text style={[styles.addBtnText, { color: theme.colors.surface }]}>+ Register Team</Text>
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
      ) : teams.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.colors.accent }]}>No teams registered yet.</Text>
        </View>
      ) : (
        <FlatList
          data={teams}
          keyExtractor={t => t.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: team }) => (
            <View style={[styles.card, { borderColor: '#e8e8e8' }]}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.teamName, { color: theme.colors.primary }]}>{team.name}</Text>
                  <Text style={[styles.meta, { color: theme.colors.accent }]}>
                    {team.players.length}/{team.maxPlayers} players
                    {team.startingHole ? ` · Hole ${team.startingHole}` : ''}
                    {team.teeTime ? ` · ${new Date(team.teeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </Text>
                </View>
                <View style={styles.cardRight}>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[team.checkInStatus] ?? '#aaa' }]}>
                    <Text style={styles.statusText}>{team.checkInStatus.replace('_', ' ')}</Text>
                  </View>
                  {team.checkInStatus === 'pending' && (
                    <Pressable
                      style={[styles.checkInBtn, { backgroundColor: theme.colors.action }]}
                      onPress={() => handleCheckIn(team.id)}
                    >
                      <Text style={styles.checkInText}>Check In</Text>
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Players */}
              {team.players.length > 0 && (
                <View style={styles.players}>
                  {team.players.map(p => (
                    <View key={p.id} style={styles.playerRow}>
                      <Text style={[styles.playerName, { color: theme.colors.primary }]}>
                        {p.firstName} {p.lastName}
                      </Text>
                      <Text style={[styles.playerMeta, { color: theme.colors.accent }]}>
                        {p.email}
                        {p.handicapIndex != null ? ` · HCP ${p.handicapIndex}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.cardFooter}>
                <Text style={[styles.feePill, {
                  color: team.entryFeePaid ? '#27ae60' : '#e74c3c',
                  borderColor: team.entryFeePaid ? '#27ae60' : '#e74c3c',
                }]}>
                  {team.entryFeePaid ? 'Fee Paid' : 'Fee Unpaid'}
                </Text>
              </View>
            </View>
          )}
        />
      )}

      <RegisterTeamModal
        visible={showAdd}
        eventId={id}
        onClose={() => setShowAdd(false)}
        onRegistered={team => { setTeams(prev => [...prev, team]); setShowAdd(false); }}
      />
    </View>
  );
}

// ── Register Team Modal ───────────────────────────────────────────────────────

interface RegisterTeamModalProps {
  visible:      boolean;
  eventId:      string;
  onClose:      () => void;
  onRegistered: (team: Team) => void;
}

interface PlayerDraft {
  firstName: string;
  lastName:  string;
  email:     string;
  handicap:  string;
}

function blankPlayer(): PlayerDraft {
  return { firstName: '', lastName: '', email: '', handicap: '' };
}

function RegisterTeamModal({ visible, eventId, onClose, onRegistered }: RegisterTeamModalProps) {
  const theme = useTheme();
  const [teamName, setTeamName] = useState('');
  const [players,  setPlayers]  = useState<PlayerDraft[]>([blankPlayer()]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  function reset() { setTeamName(''); setPlayers([blankPlayer()]); setError(null); }

  function updatePlayer(idx: number, field: keyof PlayerDraft, value: string) {
    setPlayers(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }

  function addPlayer() { setPlayers(prev => [...prev, blankPlayer()]); }
  function removePlayer(idx: number) {
    setPlayers(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  }

  async function handleSubmit() {
    if (!teamName.trim()) { setError('Team name is required.'); return; }
    const validPlayers = players.filter(p => p.firstName.trim() && p.lastName.trim());
    if (validPlayers.length === 0) { setError('At least one player with a name is required.'); return; }
    setError(null);
    setLoading(true);
    try {
      const payload: RegisterTeamPayload = {
        teamName: teamName.trim(),
        players: validPlayers.map(p => ({
          firstName: p.firstName.trim(),
          lastName:  p.lastName.trim(),
          email:     p.email.trim(),
          ...(p.handicap ? { handicap: Number(p.handicap) } : {}),
        })),
      };
      const result = await teamsApi.registerTeam(eventId, payload);
      reset();
      onRegistered(result.team);
    } catch (e: any) {
      setError(e.message ?? 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { reset(); onClose(); }}>
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.modalScroll}>
          <View style={styles.modal}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>Register Team</Text>
            {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Team Name</Text>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.accent }]}
              value={teamName}
              onChangeText={setTeamName}
              placeholder="The Eagles"
              placeholderTextColor="#999"
              editable={!loading}
            />

            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Players</Text>
            {players.map((p, idx) => (
              <View key={idx} style={styles.playerForm}>
                <View style={styles.playerFormHeader}>
                  <Text style={[styles.playerFormTitle, { color: theme.colors.primary }]}>
                    Player {idx + 1}
                  </Text>
                  {players.length > 1 && (
                    <Pressable onPress={() => removePlayer(idx)}>
                      <Text style={{ color: '#e74c3c', fontSize: 13 }}>Remove</Text>
                    </Pressable>
                  )}
                </View>
                <View style={styles.nameRow}>
                  <TextInput
                    style={[styles.input, styles.halfInput, { borderColor: theme.colors.accent }]}
                    value={p.firstName} onChangeText={v => updatePlayer(idx, 'firstName', v)}
                    placeholder="First" placeholderTextColor="#999" editable={!loading}
                  />
                  <TextInput
                    style={[styles.input, styles.halfInput, { borderColor: theme.colors.accent }]}
                    value={p.lastName} onChangeText={v => updatePlayer(idx, 'lastName', v)}
                    placeholder="Last" placeholderTextColor="#999" editable={!loading}
                  />
                </View>
                <TextInput
                  style={[styles.input, { borderColor: theme.colors.accent, marginTop: 6 }]}
                  value={p.email} onChangeText={v => updatePlayer(idx, 'email', v)}
                  placeholder="email@example.com" placeholderTextColor="#999"
                  keyboardType="email-address" autoCapitalize="none" editable={!loading}
                />
                <TextInput
                  style={[styles.input, { borderColor: theme.colors.accent, marginTop: 6 }]}
                  value={p.handicap} onChangeText={v => updatePlayer(idx, 'handicap', v)}
                  placeholder="Handicap (optional)" placeholderTextColor="#999"
                  keyboardType="numeric" editable={!loading}
                />
              </View>
            ))}

            <Pressable style={[styles.addPlayerBtn, { borderColor: theme.colors.action }]} onPress={addPlayer}>
              <Text style={[styles.addPlayerText, { color: theme.colors.action }]}>+ Add Player</Text>
            </Pressable>

            <View style={styles.modalActions}>
              <Pressable style={[styles.cancelBtn, { borderColor: theme.colors.accent }]} onPress={() => { reset(); onClose(); }}>
                <Text style={[styles.cancelText, { color: theme.colors.accent }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.submitBtn, { backgroundColor: theme.colors.primary }, loading && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitText}>Register</Text>}
              </Pressable>
            </View>
          </View>
        </ScrollView>
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
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  teamName: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700', color: '#fff', textTransform: 'capitalize' },
  checkInBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  checkInText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  players: { gap: 6, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eee' },
  playerRow: {},
  playerName: { fontSize: 14, fontWeight: '600' },
  playerMeta: { fontSize: 12 },
  cardFooter: { flexDirection: 'row' },
  feePill: { fontSize: 12, fontWeight: '600', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  errorBox: {
    backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, marginBottom: 12,
    borderLeftWidth: 3, borderLeftColor: '#e74c3c',
  },
  errorText: { color: '#c0392b', fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: { width: '100%', maxWidth: 500, backgroundColor: '#fff', borderRadius: 16, padding: 28 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#fafafa' },
  playerForm: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 12, marginBottom: 10, gap: 6 },
  playerFormHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  playerFormTitle: { fontSize: 13, fontWeight: '700' },
  nameRow: { flexDirection: 'row', gap: 8 },
  halfInput: { flex: 1 },
  addPlayerBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  addPlayerText: { fontSize: 14, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  submitBtn: { flex: 2, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  submitText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
