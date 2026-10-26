import { useCallback, useState } from 'react';
import {
  View, Text, Pressable, FlatList, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useEventDetail } from '@/lib/eventContext';
import { useTeamList } from '@/lib/queries';
import { useTheme } from '@gfp/ui';
import { teamsApi, playersApi, type Team, type Player } from '@/lib/api';
import { isCheckedIn as statusIsCheckedIn } from '@/lib/checkIn';
import { TeamRow } from '@/components/teams/TeamRow';
import { ConfirmRemoveTeamModal } from '@/components/teams/ConfirmRemoveTeamModal';
import { PlayerFormModal } from '@/components/teams/PlayerFormModal';
import { RegisterTeamModal } from '@/components/teams/RegisterTeamModal';
import { EditTeamModal } from '@/components/teams/EditTeamModal';
import { formStyles } from '@/components/teams/formStyles';

export default function TeamsScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const teamList = useTeamList(id);
  const { items: teams, setItems: setTeams, loading } = teamList;
  const { event } = useEventDetail();
  const eventName   = event.name;
  const eventStatus = event.status;
  const [actionError,       setError]             = useState<string | null>(null);
  const error = actionError
    ?? (teamList.error ? (teamList.error.message || 'Failed to load teams.') : null);
  const [showAdd,           setShowAdd]           = useState(false);
  const [editing,           setEditing]           = useState<Team | null>(null);
  const [removeTeamTarget,  setRemoveTeamTarget]  = useState<Team | null>(null);

  // Player add/edit state
  const [addPlayerTeam, setAddPlayerTeam] = useState<Team | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<{ player: Player; team: Team } | null>(null);

  const handleCheckIn = useCallback(async (teamId: string) => {
    try {
      const updated = await teamsApi.checkIn(id, teamId);
      setTeams(prev => prev.map(t => t.id === teamId ? updated : t));
    } catch (e: any) {
      setError(e.message ?? 'Check-in failed.');
    }
  }, [id, setTeams]);

  // Per-golfer check-in. The server promotes the team to Complete once the last
  // golfer is in, so mirror that locally rather than refetching the whole list.
  const handleCheckInPlayer = useCallback(async (player: Player) => {
    try {
      const updated = await playersApi.checkIn(id, player.id);
      setTeams(prev => prev.map(t => {
        if (t.id !== player.teamId) return t;
        const players = t.players.map(p => p.id === updated.id ? updated : p);
        return {
          ...t,
          players,
          checkInStatus: players.every(p => statusIsCheckedIn(p.checkInStatus))
            ? 'Complete'
            : t.checkInStatus,
        };
      }));
    } catch (e: any) {
      setError(e.message ?? 'Check-in failed.');
    }
  }, [id, setTeams]);

  // No invite link here: the organizer is entering the team, so there is no
  // captain to send one. Golfers get theirs when they register on mobile/web.
  function handleRegistered(team: Team) {
    setTeams(prev => [...prev, team]);
    setShowAdd(false);
  }

  function handleTeamUpdated(team: Team) {
    setTeams(prev => prev.map(t => t.id === team.id ? team : t));
    setEditing(null);
  }

  function handlePlayerAdded(player: Player, teamId: string) {
    setTeams(prev => prev.map(t =>
      t.id === teamId ? { ...t, players: [...t.players, player] } : t,
    ));
    setAddPlayerTeam(null);
  }

  function handlePlayerUpdated(player: Player) {
    setTeams(prev => {
      // Remove the player from whichever team currently holds them
      const without = prev.map(t => ({ ...t, players: t.players.filter(p => p.id !== player.id) }));
      // Place them on the new team (or leave as free agent if teamId is null)
      if (player.teamId) {
        return without.map(t => t.id === player.teamId ? { ...t, players: [...t.players, player] } : t);
      }
      return without;
    });
    setEditingPlayer(null);
  }

  async function handleRemoveTeam(teamId: string) {
    try {
      await teamsApi.remove(id, teamId);
      setTeams(prev => prev.filter(t => t.id !== teamId));
      setRemoveTeamTarget(null);
    } catch (e: any) {
      setRemoveTeamTarget(null);
      setError(e.message ?? 'Failed to remove team.');
    }
  }

  const handleRemovePlayer = useCallback(async (teamId: string, playerId: string) => {
    try {
      await playersApi.remove(id, playerId);
      setTeams(prev => prev.map(t =>
        t.id === teamId ? { ...t, players: t.players.filter(p => p.id !== playerId) } : t,
      ));
    } catch (e: any) {
      setError(e.message ?? 'Failed to remove player.');
    }
  }, [id, setTeams]);

  // Stable handlers for the FlatList row. Wrapping in useCallback lets the
  // memoized TeamRow skip its render when only an unrelated piece of parent
  // state (e.g. modal visibility) changes.
  const onEditTeam     = useCallback((team: Team) => setEditing(team), []);
  const onRemoveTeam   = useCallback((team: Team) => setRemoveTeamTarget(team), []);
  const onEditPlayer   = useCallback(
    (player: Player, team: Team) => setEditingPlayer({ player, team }),
    [],
  );
  const onAddPlayer    = useCallback((team: Team) => setAddPlayerTeam(team), []);

  const renderRow = useCallback(({ item }: { item: Team }) => (
    <TeamRow
      team={item}
      eventStatus={eventStatus}
      onEditTeam={onEditTeam}
      onRemoveTeam={onRemoveTeam}
      onCheckIn={handleCheckIn}
      onCheckInPlayer={handleCheckInPlayer}
      onEditPlayer={onEditPlayer}
      onRemovePlayer={handleRemovePlayer}
      onAddPlayer={onAddPlayer}
    />
  ), [eventStatus, onEditTeam, onRemoveTeam, handleCheckIn, handleCheckInPlayer, onEditPlayer, handleRemovePlayer, onAddPlayer]);

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
        <View style={formStyles.errorBox}>
          <Text style={formStyles.errorText}>{error}</Text>
          <Pressable onPress={() => setError(null)} style={{ marginTop: 6 }}>
            <Text style={{ color: '#c0392b', fontSize: 12 }}>Dismiss</Text>
          </Pressable>
        </View>
      )}


      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : teams.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.mutedText }]}>No teams registered yet.</Text>
        </View>
      ) : (
        <FlatList
          data={teams}
          keyExtractor={t => t.id}
          contentContainerStyle={styles.list}
          renderItem={renderRow}
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
        onSaved={handleTeamUpdated}
      />

      <PlayerFormModal
        visible={addPlayerTeam != null}
        eventId={id}
        teamId={addPlayerTeam?.id ?? null}
        teams={teams}
        title={`Add Player — ${addPlayerTeam?.name ?? ''}`}
        onClose={() => setAddPlayerTeam(null)}
        onSaved={player => handlePlayerAdded(player, addPlayerTeam!.id)}
      />

      <PlayerFormModal
        visible={editingPlayer != null}
        eventId={id}
        teamId={editingPlayer?.team.id ?? null}
        teams={teams}
        player={editingPlayer?.player}
        title="Edit Player"
        onClose={() => setEditingPlayer(null)}
        onSaved={handlePlayerUpdated}
      />

      <ConfirmRemoveTeamModal
        visible={removeTeamTarget != null}
        eventName={eventName}
        team={removeTeamTarget}
        onClose={() => setRemoveTeamTarget(null)}
        onConfirm={() => handleRemoveTeam(removeTeamTarget!.id)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page:   { flex: 1, padding: 28 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title:  { fontSize: 22, fontWeight: '800' },
  addBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8 },
  addBtnText: { fontSize: 14, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 15 },
  list: { gap: 12 },
});
