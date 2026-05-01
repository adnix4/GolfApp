import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, FlatList, Modal, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { playersApi, teamsApi, type Player, type Team } from '@/lib/api';

export default function FreeAgentsScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const [agents,   setAgents]   = useState<Player[]>([]);
  const [teams,    setTeams]    = useState<Team[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [modal,    setModal]    = useState<'assign' | null>(null);

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

  const selectedList = agents.filter(a => selected.has(a.id));

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.primary }]}>
          Free Agents ({agents.length})
        </Text>
        <Pressable onPress={load} style={styles.refreshBtn}>
          <Text style={[styles.refreshText, { color: theme.colors.accent }]}>↻ Refresh</Text>
        </Pressable>
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
                  <Text style={[styles.agentMeta, { color: theme.colors.accent }]}>
                    {agent.email}
                    {agent.handicapIndex != null ? ` · HCP ${agent.handicapIndex}` : ''}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

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

const styles = StyleSheet.create({
  page:   { flex: 1, backgroundColor: '#f7f8fa' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingBottom: 16 },
  title:  { fontSize: 22, fontWeight: '800' },
  refreshBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  refreshText: { fontSize: 14, fontWeight: '600' },

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
