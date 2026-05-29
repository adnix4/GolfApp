import { memo, useCallback, useEffect, useState } from 'react';
import {
  View, Text, Pressable, FlatList, Modal, TextInput,
  StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme, StatusPill, FormModal } from '@gfp/ui';
import { digitsOnly, fmtPhone, fmtPhoneInput } from '@gfp/shared-types';
import {
  teamsApi, eventsApi, playersApi,
  type Team, type Player, type RegisterTeamPayload, type AddPlayerPayload,
} from '@/lib/api';
import { confirmAction } from '@/lib/confirmAction';

function fmtAgeGroup(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v === 'Under30')    return 'Under 30';
  if (v === 'From30To50') return '30–50';
  if (v === 'Over50')     return 'Over 50';
  return v;
}

const CHECK_IN_STATUS_COLOR: Record<string, string> = {
  pending:    '#f39c12',
  checked_in: '#2ecc71',
  complete:   '#27ae60',
};

// ── Team row (memoized) ───────────────────────────────────────────────────────
// Hoisted out of the FlatList renderItem so the closure doesn't recreate the
// row tree on every parent render. The handler refs are stable thanks to
// useCallback in the parent, so a row only re-renders when its own Team or
// eventStatus actually changes.

interface TeamRowProps {
  team:           Team;
  eventStatus:    string | null;
  onEditTeam:     (team: Team) => void;
  onRemoveTeam:   (team: Team) => void;
  onCheckIn:      (teamId: string) => void;
  onEditPlayer:   (player: Player, team: Team) => void;
  onRemovePlayer: (teamId: string, playerId: string) => void;
  onAddPlayer:    (team: Team) => void;
}

const TeamRow = memo(function TeamRow({
  team, eventStatus,
  onEditTeam, onRemoveTeam, onCheckIn,
  onEditPlayer, onRemovePlayer, onAddPlayer,
}: TeamRowProps) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { borderColor: '#e8e8e8' }]}>
      {/* Team header */}
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
          <StatusPill
            color={CHECK_IN_STATUS_COLOR[team.checkInStatus] ?? '#aaa'}
            label={team.checkInStatus.replace('_', ' ')}
            textTransform="capitalize"
            size="sm"
          />
          <View style={styles.actionBtns}>
            <Pressable
              style={[styles.editBtn, { borderColor: theme.colors.accent }]}
              onPress={() => onEditTeam(team)}
            >
              <Text style={[styles.editBtnText, { color: theme.colors.accent }]}>Edit</Text>
            </Pressable>
            {team.players.length === 0 && (
              <Pressable
                style={[styles.editBtn, { borderColor: '#e74c3c' }]}
                onPress={() => onRemoveTeam(team)}
              >
                <Text style={[styles.editBtnText, { color: '#e74c3c' }]}>Remove</Text>
              </Pressable>
            )}
            {team.checkInStatus === 'pending' && eventStatus === 'Active' && (
              <Pressable
                style={[styles.checkInBtn, { backgroundColor: theme.colors.action }]}
                onPress={() => onCheckIn(team.id)}
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
              <View style={{ flex: 1 }}>
                <Text style={[styles.playerName, { color: theme.colors.primary }]}>
                  {p.firstName} {p.lastName}
                </Text>
                {!!p.email && (
                  <Text style={[styles.playerMeta, { color: theme.colors.accent }]}>{p.email}</Text>
                )}
                {!!p.phone && (
                  <Text style={[styles.playerMeta, { color: theme.colors.accent }]}>{fmtPhone(p.phone)}</Text>
                )}
                {(p.handicapIndex != null || p.skillLevel || p.ageGroup) && (
                  <Text style={[styles.playerMeta, { color: theme.colors.accent }]}>
                    {[
                      p.handicapIndex != null ? `HCP ${p.handicapIndex}` : null,
                      p.skillLevel ?? null,
                      fmtAgeGroup(p.ageGroup),
                    ].filter(Boolean).join(' · ')}
                  </Text>
                )}
                {!!p.pairingNote && (
                  <Text style={[styles.playerNote, { color: theme.colors.accent }]}>
                    Note: {p.pairingNote}
                  </Text>
                )}
              </View>
              <View style={styles.playerActions}>
                <Pressable
                  style={[styles.smallBtn, { borderColor: theme.colors.accent }]}
                  onPress={() => onEditPlayer(p, team)}
                >
                  <Text style={[styles.smallBtnText, { color: theme.colors.accent }]}>Edit</Text>
                </Pressable>
                <Pressable
                  style={[styles.smallBtn, { borderColor: '#e74c3c' }]}
                  onPress={() => confirmAction(
                    'Remove Player',
                    `Remove ${p.firstName} ${p.lastName} from this team?`,
                    () => onRemovePlayer(team.id, p.id),
                  )}
                >
                  <Text style={[styles.smallBtnText, { color: '#e74c3c' }]}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Add player row */}
      <View style={styles.cardFooter}>
        <Text style={[styles.feePill, {
          color: team.entryFeePaid ? '#27ae60' : '#e74c3c',
          borderColor: team.entryFeePaid ? '#27ae60' : '#e74c3c',
        }]}>
          {team.entryFeePaid ? 'Fee Paid' : 'Fee Unpaid'}
        </Text>
        {team.players.length < team.maxPlayers && (
          <Pressable
            style={[styles.addPlayerBtn, { borderColor: theme.colors.action }]}
            onPress={() => onAddPlayer(team)}
          >
            <Text style={[styles.addPlayerBtnText, { color: theme.colors.action }]}>+ Add Player</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
});

export default function TeamsScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const [teams,             setTeams]             = useState<Team[]>([]);
  const [eventName,         setEventName]         = useState<string>('');
  const [eventStatus,       setEventStatus]       = useState<string | null>(null);
  const [loading,           setLoading]           = useState(true);
  const [error,             setError]             = useState<string | null>(null);
  const [showAdd,           setShowAdd]           = useState(false);
  const [editing,           setEditing]           = useState<Team | null>(null);
  const [removeTeamTarget,  setRemoveTeamTarget]  = useState<Team | null>(null);
  const [inviteResult, setInviteResult] = useState<{ teamName: string; url: string | null } | null>(null);

  // Player add/edit state
  const [addPlayerTeam, setAddPlayerTeam] = useState<Team | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<{ player: Player; team: Team } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamList, event] = await Promise.all([
        teamsApi.list(id),
        eventsApi.get(id),
      ]);
      setTeams(teamList);
      setEventName(event.name);
      setEventStatus(event.status);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load teams.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleCheckIn = useCallback(async (teamId: string) => {
    try {
      const updated = await teamsApi.checkIn(id, teamId);
      setTeams(prev => prev.map(t => t.id === teamId ? updated : t));
    } catch (e: any) {
      setError(e.message ?? 'Check-in failed.');
    }
  }, [id]);

  function handleRegistered(team: Team, inviteUrl?: string | null) {
    setTeams(prev => [...prev, team]);
    setShowAdd(false);
    if (inviteUrl) setInviteResult({ teamName: team.name, url: inviteUrl });
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
  }, [id]);

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
      onEditPlayer={onEditPlayer}
      onRemovePlayer={handleRemovePlayer}
      onAddPlayer={onAddPlayer}
    />
  ), [eventStatus, onEditTeam, onRemoveTeam, handleCheckIn, onEditPlayer, handleRemovePlayer, onAddPlayer]);

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

// ── Confirm Remove Team Modal ─────────────────────────────────────────────────

interface ConfirmRemoveTeamModalProps {
  visible:   boolean;
  eventName: string;
  team:      Team | null;
  onClose:   () => void;
  onConfirm: () => Promise<void>;
}

function ConfirmRemoveTeamModal({ visible, eventName, team, onClose, onConfirm }: ConfirmRemoveTeamModalProps) {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormModal
      visible={visible}
      title={eventName}
      onClose={onClose}
      onSubmit={handleConfirm}
      submitLabel="Remove"
      loading={loading}
      destructive
      maxWidth={420}
    >
      <Text style={[styles.confirmModalMessage, { color: theme.colors.primary }]}>
        Warning removing team "{team?.name}" can not be undone.
      </Text>
    </FormModal>
  );
}

// ── Player Form Modal (add or edit) ──────────────────────────────────────────

interface PlayerFormModalProps {
  visible:  boolean;
  eventId:  string;
  teamId:   string | null;
  teams:    Team[];
  player?:  Player;
  title:    string;
  onClose:  () => void;
  onSaved:  (player: Player) => void;
}

function PlayerFormModal({ visible, eventId, teamId, teams, player, title, onClose, onSaved }: PlayerFormModalProps) {
  const theme = useTheme();
  const [firstName,       setFirstName]       = useState('');
  const [lastName,        setLastName]        = useState('');
  const [email,           setEmail]           = useState('');
  const [phone,           setPhone]           = useState('');
  const [handicap,        setHandicap]        = useState('');
  const [selectedTeamId,  setSelectedTeamId]  = useState<string | null>(null);
  const [pickerOpen,      setPickerOpen]      = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setFirstName(player?.firstName ?? '');
    setLastName(player?.lastName ?? '');
    setEmail(player?.email ?? '');
    setPhone(player?.phone ? fmtPhoneInput(digitsOnly(player.phone)) : '');
    setHandicap(player?.handicapIndex != null ? String(player.handicapIndex) : '');
    setSelectedTeamId(teamId);
    setPickerOpen(false);
    setError(null);
  }, [visible, player, teamId]);

  // Teams available in the picker: not full, or already the selected team
  const availableTeams = teams.filter(t =>
    t.players.length < t.maxPlayers || t.id === selectedTeamId,
  );

  function teamLabel(tid: string | null): string {
    if (!tid) return 'Free agent — organizer will assign';
    const t = teams.find(t => t.id === tid);
    if (!t) return 'Unknown team';
    return `${t.name}  (${t.players.length}/${t.maxPlayers} players)`;
  }

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

  async function handleSave() {
    if (!validate()) return;
    setError(null);
    setLoading(true);
    try {
      let result: Player;
      if (player) {
        const teamChanged = selectedTeamId !== (player.teamId ?? null);
        result = await playersApi.update(eventId, player.id, {
          firstName: firstName.trim(),
          lastName:  lastName.trim(),
          email:     email.trim() || undefined,
          phone:     phone.trim() || undefined,
          ...(handicap.trim() ? { handicapIndex: Number(handicap) } : {}),
          ...(teamChanged
            ? selectedTeamId === null
              ? { clearTeam: true }
              : { teamId: selectedTeamId }
            : {}),
        });
      } else {
        const payload: AddPlayerPayload = {
          firstName: firstName.trim(),
          lastName:  lastName.trim(),
          email:     email.trim() || undefined,
          phone:     phone.trim() || undefined,
          ...(handicap.trim() ? { handicapIndex: Number(handicap) } : {}),
          teamId: teamId ?? undefined,
        };
        result = await playersApi.add(eventId, payload);
      }
      onSaved(result);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save player.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { onClose(); }}>
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.modal}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>{title}</Text>
            {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

            {/* Name */}
            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Name *</Text>
            <Text style={[styles.fieldDesc, { color: theme.colors.accent }]}>Player's first and last name as it should appear on the scorecard.</Text>
            <View style={styles.nameRow}>
              <TextInput
                style={[styles.input, styles.halfInput, { borderColor: theme.colors.accent }]}
                value={firstName} onChangeText={v => { setFirstName(v); if (error) setError(null); }}
                placeholder="First name" placeholderTextColor="#999" editable={!loading}
              />
              <TextInput
                style={[styles.input, styles.halfInput, { borderColor: theme.colors.accent }]}
                value={lastName} onChangeText={v => { setLastName(v); if (error) setError(null); }}
                placeholder="Last name" placeholderTextColor="#999" editable={!loading}
              />
            </View>

            {/* Email */}
            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Email</Text>
            <Text style={[styles.fieldDesc, { color: theme.colors.accent }]}>Used by the player to join the event on the mobile app. Must be unique within this event.</Text>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.accent }]}
              value={email} onChangeText={v => { setEmail(v); if (error) setError(null); }}
              placeholder="player@example.com"
              placeholderTextColor="#999"
              keyboardType="email-address" autoCapitalize="none" editable={!loading}
            />

            {/* Phone */}
            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Phone <Text style={styles.fieldOptional}>(optional)</Text></Text>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.accent }]}
              value={phone}
              onChangeText={v => { setPhone(fmtPhoneInput(digitsOnly(v))); if (error) setError(null); }}
              placeholder="(555) 867-5309"
              placeholderTextColor="#999"
              keyboardType="phone-pad" editable={!loading}
            />

            {/* Handicap */}
            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Handicap Index</Text>
            <Text style={[styles.fieldDesc, { color: theme.colors.accent }]}>USGA handicap index (0 – 54). Used for net scoring, pairing, and flights. Leave blank if unknown.</Text>
            <TextInput
              style={[styles.input, { borderColor: theme.colors.accent }]}
              value={handicap} onChangeText={v => { setHandicap(v.replace(/[^0-9.]/g, '')); if (error) setError(null); }}
              placeholder="e.g. 14.2"
              placeholderTextColor="#999"
              keyboardType="decimal-pad" editable={!loading}
            />

            {/* Team assignment — edit mode only */}
            {!!player && (
              <>
                <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Team Assignment</Text>
                <Text style={[styles.fieldDesc, { color: theme.colors.accent }]}>
                  Move this player to a different team or designate them as a free agent for the organizer to assign.
                  Only teams with open slots are shown.
                </Text>

                {/* Selector button */}
                <Pressable
                  style={[styles.pickerBtn, { borderColor: theme.colors.accent }, pickerOpen && { borderColor: theme.colors.primary }]}
                  onPress={() => setPickerOpen(o => !o)}
                  disabled={loading}
                >
                  <Text style={[styles.pickerBtnText, { color: selectedTeamId ? theme.colors.primary : '#999' }]} numberOfLines={1}>
                    {teamLabel(selectedTeamId)}
                  </Text>
                  <Text style={{ color: theme.colors.accent, fontSize: 12, marginLeft: 6 }}>{pickerOpen ? '▲' : '▼'}</Text>
                </Pressable>

                {/* Options list */}
                {pickerOpen && (
                  <ScrollView
                    style={[styles.pickerList, { borderColor: theme.colors.accent }]}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                  >
                    {/* Free agent option */}
                    <Pressable
                      style={[styles.pickerOption, selectedTeamId === null && { backgroundColor: theme.colors.primary + '18' }]}
                      onPress={() => { setSelectedTeamId(null); setPickerOpen(false); }}
                    >
                      <View style={[styles.pickerRadio, { borderColor: theme.colors.primary }]}>
                        {selectedTeamId === null && <View style={[styles.pickerRadioDot, { backgroundColor: theme.colors.primary }]} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pickerOptionLabel, { color: theme.colors.primary }]}>Free agent</Text>
                        <Text style={[styles.pickerOptionDesc, { color: theme.colors.accent }]}>Organizer will assign this player to a team</Text>
                      </View>
                    </Pressable>

                    {/* Team options */}
                    {availableTeams.map(t => {
                      const isSelected = selectedTeamId === t.id;
                      const isCurrent  = t.id === player.teamId;
                      const open = t.maxPlayers - t.players.length;
                      return (
                        <Pressable
                          key={t.id}
                          style={[styles.pickerOption, isSelected && { backgroundColor: theme.colors.primary + '18' }]}
                          onPress={() => { setSelectedTeamId(t.id); setPickerOpen(false); }}
                        >
                          <View style={[styles.pickerRadio, { borderColor: theme.colors.primary }]}>
                            {isSelected && <View style={[styles.pickerRadioDot, { backgroundColor: theme.colors.primary }]} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.pickerOptionLabel, { color: theme.colors.primary }]}>
                              {t.name}{isCurrent ? '  (current)' : ''}
                            </Text>
                            <Text style={[styles.pickerOptionDesc, { color: theme.colors.accent }]}>
                              {t.players.length}/{t.maxPlayers} players · {isCurrent ? 'current team' : `${open} slot${open !== 1 ? 's' : ''} open`}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}

                    {availableTeams.length === 0 && (
                      <View style={styles.pickerOption}>
                        <Text style={{ color: '#888', fontSize: 13, fontStyle: 'italic' }}>No teams with open slots</Text>
                      </View>
                    )}
                  </ScrollView>
                )}
              </>
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
                  : <Text style={styles.submitText}>{player ? 'Save' : 'Add'}</Text>}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
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
      setError(e.message ?? 'Registration failed.');
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

            <Pressable style={[styles.addPlayerFormBtn, { borderColor: theme.colors.action }]} onPress={addPlayer}>
              <Text style={[styles.addPlayerFormText, { color: theme.colors.action }]}>+ Add Player</Text>
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
      setError(e.message ?? 'Failed to save team.');
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
  editBtn: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  editBtnText: { fontSize: 12, fontWeight: '600' },
  checkInBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  checkInText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  players: { gap: 8, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eee' },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playerName: { fontSize: 14, fontWeight: '600' },
  playerMeta: { fontSize: 12 },
  playerNote: { fontSize: 11, marginTop: 2, fontStyle: 'italic' },
  playerActions: { flexDirection: 'row', gap: 6 },
  smallBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, borderWidth: 1 },
  smallBtnText: { fontSize: 11, fontWeight: '600' },

  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  feePill: { fontSize: 12, fontWeight: '600', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  addPlayerBtn: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  addPlayerBtnText: { fontSize: 12, fontWeight: '600' },

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
  nameRow: { flexDirection: 'row', gap: 8 },
  halfInput: { flex: 1 },
  playerForm: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 12, marginBottom: 10, gap: 6 },
  playerFormHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  playerFormTitle: { fontSize: 13, fontWeight: '700' },
  addPlayerFormBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  addPlayerFormText: { fontSize: 14, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  submitBtn: { flex: 2, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  submitText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  fieldDesc:     { fontSize: 12, marginTop: -4, marginBottom: 6, lineHeight: 17 },
  fieldOptional: { fontSize: 12, fontWeight: '400' },

  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fafafa',
  },
  pickerBtnText: { flex: 1, fontSize: 14 },
  pickerList: {
    borderWidth: 1, borderRadius: 8, marginTop: 4,
    maxHeight: 260,
  },
  pickerOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee',
  },
  pickerRadio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  pickerRadioDot: { width: 9, height: 9, borderRadius: 5 },
  pickerOptionLabel: { fontSize: 14, fontWeight: '600' },
  pickerOptionDesc:  { fontSize: 12, marginTop: 1 },

  confirmModal: { padding: 0, overflow: 'hidden' },
  confirmModalHeader: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
  },
  confirmModalEventName: { fontSize: 14, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  confirmModalBody: { padding: 24 },
  confirmModalMessage: { fontSize: 16, fontWeight: '600', lineHeight: 24, marginBottom: 4 },
});
