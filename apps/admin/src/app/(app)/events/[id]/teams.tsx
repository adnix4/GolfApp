import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, FlatList, Modal, TextInput,
  StyleSheet, ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { teamsApi, eventsApi, type Team, type RegisterTeamPayload } from '@/lib/api';

const STATUS_COLOR: Record<string, string> = {
  pending:    '#f39c12',
  checked_in: '#2ecc71',
  complete:   '#27ae60',
};

export default function TeamsScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const [teams,       setTeams]       = useState<Team[]>([]);
  const [eventStatus, setEventStatus] = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [showAdd,     setShowAdd]     = useState(false);
  const [editing,     setEditing]     = useState<Team | null>(null);
  const [inviteResult, setInviteResult] = useState<{ teamName: string; url: string | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamList, event] = await Promise.all([
        teamsApi.list(id),
        eventsApi.get(id),
      ]);
      setTeams(teamList);
      setEventStatus(event.status);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load teams. Check your connection and try again.');
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
      setError(e.message ?? 'Check-in failed. Please try again.');
    }
  }

  function handleRegistered(team: Team, inviteUrl?: string | null) {
    setTeams(prev => [...prev, team]);
    setShowAdd(false);
    if (inviteUrl) {
      setInviteResult({ teamName: team.name, url: inviteUrl });
    }
  }

  function handleUpdated(team: Team) {
    setTeams(prev => prev.map(t => t.id === team.id ? team : t));
    setEditing(null);
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
          <Pressable onPress={() => setError(null)} style={{ marginTop: 6 }}>
            <Text style={{ color: '#c0392b', fontSize: 12 }}>Dismiss</Text>
          </Pressable>
        </View>
      )}

      {/* Invite link banner after registration */}
      {inviteResult && (
        <View style={styles.inviteBox}>
          <Text style={styles.inviteTitle}>Team "{inviteResult.teamName}" registered!</Text>
          {inviteResult.url ? (
            <>
              <Text style={styles.inviteLabel}>Invite link for teammates:</Text>
              <Text style={styles.inviteUrl} selectable>{inviteResult.url}</Text>
            </>
          ) : (
            <Text style={styles.inviteLabel}>Team is full — no invite link needed.</Text>
          )}
          <Pressable onPress={() => setInviteResult(null)} style={{ marginTop: 8 }}>
            <Text style={{ color: '#1a5276', fontSize: 12, fontWeight: '600' }}>Dismiss</Text>
          </Pressable>
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
                  <View style={styles.actionBtns}>
                    <Pressable
                      style={[styles.editBtn, { borderColor: theme.colors.accent }]}
                      onPress={() => setEditing(team)}
                    >
                      <Text style={[styles.editBtnText, { color: theme.colors.accent }]}>Edit</Text>
                    </Pressable>
                    {team.checkInStatus === 'pending' && eventStatus === 'Active' && (
                      <Pressable
                        style={[styles.checkInBtn, { backgroundColor: theme.colors.action }]}
                        onPress={() => handleCheckIn(team.id)}
                      >
                        <Text style={styles.checkInText}>Check In</Text>
                      </Pressable>
                    )}
                  </View>
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
        onRegistered={handleRegistered}
      />

      <EditTeamModal
        visible={editing != null}
        eventId={id}
        team={editing}
        onClose={() => setEditing(null)}
        onSaved={handleUpdated}
      />
    </View>
  );
}

// ── Register Team Modal ───────────────────────────────────────────────────────

interface RegisterTeamModalProps {
  visible:      boolean;
  eventId:      string;
  onClose:      () => void;
  onRegistered: (team: Team, inviteUrl?: string | null) => void;
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
    if (players.length <= 1) return;
    setPlayers(prev => prev.filter((_, i) => i !== idx));
  }

  function validate(): boolean {
    if (!teamName.trim()) { setError('Team name is required.'); return false; }
    if (teamName.trim().length > 200) { setError('Team name must be 200 characters or fewer.'); return false; }
    const validPlayers = players.filter(p => p.firstName.trim() && p.lastName.trim());
    if (validPlayers.length === 0) { setError('At least one player with a first and last name is required.'); return false; }
    for (const p of players) {
      if (p.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) {
        setError(`"${p.email}" is not a valid email address.`); return false;
      }
      if (p.handicap.trim() && isNaN(Number(p.handicap))) {
        setError('Handicap must be a number.'); return false;
      }
    }
    return true;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setError(null);
    setLoading(true);
    try {
      const validPlayers = players.filter(p => p.firstName.trim() && p.lastName.trim());
      const payload: RegisterTeamPayload = {
        teamName: teamName.trim(),
        players: validPlayers.map(p => ({
          firstName: p.firstName.trim(),
          lastName:  p.lastName.trim(),
          email:     p.email.trim(),
          ...(p.handicap.trim() ? { handicap: Number(p.handicap) } : {}),
        })),
      };
      const result = await teamsApi.registerTeam(eventId, payload);
      reset();
      onRegistered(result.team, result.inviteUrl);
    } catch (e: any) {
      setError(e.message ?? 'Registration failed. Check the details and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { reset(); onClose(); }}>
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.modal}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>Register Team</Text>
            {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Team Name *</Text>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.accent }]}
              value={teamName}
              onChangeText={v => { setTeamName(v); if (error) setError(null); }}
              placeholder="The Eagles"
              placeholderTextColor="#999"
              editable={!loading}
              maxLength={200}
            />

            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Players</Text>
            {players.map((p, idx) => (
              <View key={idx} style={styles.playerForm}>
                <View style={styles.playerFormHeader}>
                  <Text style={[styles.playerFormTitle, { color: theme.colors.primary }]}>
                    Player {idx + 1}{idx === 0 ? ' (Captain)' : ''}
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
                    placeholder="First *" placeholderTextColor="#999" editable={!loading}
                  />
                  <TextInput
                    style={[styles.input, styles.halfInput, { borderColor: theme.colors.accent }]}
                    value={p.lastName} onChangeText={v => updatePlayer(idx, 'lastName', v)}
                    placeholder="Last *" placeholderTextColor="#999" editable={!loading}
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
                  placeholder="Handicap index (optional)" placeholderTextColor="#999"
                  keyboardType="decimal-pad" editable={!loading}
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

// ── Edit Team Modal ───────────────────────────────────────────────────────────

interface EditTeamModalProps {
  visible:  boolean;
  eventId:  string;
  team:     Team | null;
  onClose:  () => void;
  onSaved:  (team: Team) => void;
}

function EditTeamModal({ visible, eventId, team, onClose, onSaved }: EditTeamModalProps) {
  const theme = useTheme();
  const [name,       setName]       = useState('');
  const [maxPlayers, setMaxPlayers] = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !team) return;
    setName(team.name);
    setMaxPlayers(String(team.maxPlayers));
    setError(null);
  }, [visible, team]);

  async function handleSave() {
    if (!name.trim()) { setError('Team name is required.'); return; }
    if (name.trim().length > 200) { setError('Team name must be 200 characters or fewer.'); return; }
    const max = parseInt(maxPlayers);
    if (isNaN(max) || max < 1 || max > 8) { setError('Max players must be between 1 and 8.'); return; }
    if (team && max < team.players.length) {
      setError(`Cannot set max players to ${max} — this team already has ${team.players.length} players.`);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const updated = await teamsApi.update(eventId, team!.id, {
        name: name.trim(),
        maxPlayers: max,
      });
      onSaved(updated);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save team. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>Edit Team</Text>
          {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

          <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Team Name *</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.accent }]}
            value={name}
            onChangeText={v => { setName(v); if (error) setError(null); }}
            placeholder="Team name"
            placeholderTextColor="#999"
            editable={!loading}
            maxLength={200}
          />

          <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Max Players (1–8)</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.accent }]}
            value={maxPlayers}
            onChangeText={v => { setMaxPlayers(v.replace(/[^0-9]/g, '')); if (error) setError(null); }}
            placeholder="4"
            placeholderTextColor="#999"
            keyboardType="number-pad"
            editable={!loading}
          />
          {team && (
            <Text style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
              Currently {team.players.length} player{team.players.length !== 1 ? 's' : ''} on this team.
            </Text>
          )}

          <View style={styles.modalActions}>
            <Pressable style={[styles.cancelBtn, { borderColor: theme.colors.accent }]} onPress={onClose}>
              <Text style={[styles.cancelText, { color: theme.colors.accent }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.submitBtn, { backgroundColor: theme.colors.primary }, loading && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitText}>Save</Text>}
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
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
  actionBtns: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700', color: '#fff', textTransform: 'capitalize' },
  editBtn: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  editBtnText: { fontSize: 12, fontWeight: '600' },
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
  inviteBox: {
    backgroundColor: '#ebf5fb', borderRadius: 10, padding: 14, marginBottom: 14,
    borderLeftWidth: 3, borderLeftColor: '#2980b9',
  },
  inviteTitle: { fontSize: 14, fontWeight: '700', color: '#1a5276', marginBottom: 6 },
  inviteLabel: { fontSize: 13, color: '#1a5276', marginBottom: 4 },
  inviteUrl:   { fontSize: 12, color: '#2980b9', fontFamily: 'monospace' },
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
