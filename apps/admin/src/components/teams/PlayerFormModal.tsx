import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, Modal, TextInput, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { useTheme } from '@gfp/ui';
import { digitsOnly, fmtPhoneInput } from '@gfp/shared-types';
import { playersApi, type Team, type Player, type AddPlayerPayload } from '@/lib/api';
import { formStyles } from './formStyles';
import { fontSize, radius, spacing } from '@gfp/theme';

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

export function PlayerFormModal({ visible, eventId, teamId, teams, player, title, onClose, onSaved }: PlayerFormModalProps) {
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
      <View style={formStyles.overlay}>
        <ScrollView contentContainerStyle={formStyles.modalScroll} keyboardShouldPersistTaps="handled">
          <View style={formStyles.modal}>
            <Text style={[formStyles.modalTitle, { color: theme.colors.primary }]}>{title}</Text>
            {error && <View style={formStyles.errorBox}><Text style={formStyles.errorText}>{error}</Text></View>}

            {/* Name */}
            <Text style={[formStyles.fieldLabel, { color: theme.colors.primary }]}>Name *</Text>
            <Text style={[formStyles.fieldDesc, { color: theme.mutedText }]}>Player's first and last name as it should appear on the scorecard.</Text>
            <View style={formStyles.nameRow}>
              <TextInput
                style={[formStyles.input, formStyles.halfInput, { borderColor: theme.colors.accent }]}
                value={firstName} onChangeText={v => { setFirstName(v); if (error) setError(null); }}
                placeholder="First name" placeholderTextColor="#999" editable={!loading}
              />
              <TextInput
                style={[formStyles.input, formStyles.halfInput, { borderColor: theme.colors.accent }]}
                value={lastName} onChangeText={v => { setLastName(v); if (error) setError(null); }}
                placeholder="Last name" placeholderTextColor="#999" editable={!loading}
              />
            </View>

            {/* Email */}
            <Text style={[formStyles.fieldLabel, { color: theme.colors.primary }]}>Email</Text>
            <Text style={[formStyles.fieldDesc, { color: theme.mutedText }]}>Used by the player to join the event on the mobile app. Must be unique within this event.</Text>
            <TextInput
              style={[formStyles.input, { borderColor: theme.colors.accent }]}
              value={email} onChangeText={v => { setEmail(v); if (error) setError(null); }}
              placeholder="player@example.com"
              placeholderTextColor="#999"
              keyboardType="email-address" autoCapitalize="none" editable={!loading}
            />

            {/* Phone */}
            <Text style={[formStyles.fieldLabel, { color: theme.colors.primary }]}>Phone <Text style={formStyles.fieldOptional}>(optional)</Text></Text>
            <TextInput
              style={[formStyles.input, { borderColor: theme.colors.accent }]}
              value={phone}
              onChangeText={v => { setPhone(fmtPhoneInput(digitsOnly(v))); if (error) setError(null); }}
              placeholder="(555) 867-5309"
              placeholderTextColor="#999"
              keyboardType="phone-pad" editable={!loading}
            />

            {/* Handicap */}
            <Text style={[formStyles.fieldLabel, { color: theme.colors.primary }]}>Handicap Index</Text>
            <Text style={[formStyles.fieldDesc, { color: theme.mutedText }]}>USGA handicap index (0 – 54). Used for net scoring, pairing, and flights. Leave blank if unknown.</Text>
            <TextInput
              style={[formStyles.input, { borderColor: theme.colors.accent }]}
              value={handicap} onChangeText={v => { setHandicap(v.replace(/[^0-9.]/g, '')); if (error) setError(null); }}
              placeholder="e.g. 14.2"
              placeholderTextColor="#999"
              keyboardType="decimal-pad" editable={!loading}
            />

            {/* Team assignment — edit mode only */}
            {!!player && (
              <>
                <Text style={[formStyles.fieldLabel, { color: theme.colors.primary }]}>Team Assignment</Text>
                <Text style={[formStyles.fieldDesc, { color: theme.mutedText }]}>
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
                  <Text style={{ color: theme.mutedText, fontSize: fontSize.xs, marginLeft: spacing[2] }}>{pickerOpen ? '▲' : '▼'}</Text>
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
                        <Text style={[styles.pickerOptionDesc, { color: theme.mutedText }]}>Organizer will assign this player to a team</Text>
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
                            <Text style={[styles.pickerOptionDesc, { color: theme.mutedText }]}>
                              {t.players.length}/{t.maxPlayers} players · {isCurrent ? 'current team' : `${open} slot${open !== 1 ? 's' : ''} open`}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}

                    {availableTeams.length === 0 && (
                      <View style={styles.pickerOption}>
                        <Text style={{ color: '#888', fontSize: fontSize.sm, fontStyle: 'italic' }}>No teams with open slots</Text>
                      </View>
                    )}
                  </ScrollView>
                )}
              </>
            )}

            <View style={formStyles.modalActions}>
              <Pressable style={[formStyles.cancelBtn, { borderColor: theme.colors.accent }]} onPress={onClose}>
                <Text style={[formStyles.cancelText, { color: theme.mutedText }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[formStyles.submitBtn, { backgroundColor: theme.colors.primary }, loading && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={formStyles.submitText}>{player ? 'Save' : 'Add'}</Text>}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing[3], paddingVertical: spacing[3],
    backgroundColor: '#fafafa',
  },
  pickerBtnText: { flex: 1, fontSize: fontSize.md },
  pickerList: {
    borderWidth: 1, borderRadius: radius.md, marginTop: spacing[1],
    maxHeight: 260,
  },
  pickerOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[3],
    paddingHorizontal: spacing[3], paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee',
  },
  pickerRadio: {
    width: 18, height: 18, borderRadius: radius.lg, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  pickerRadioDot: { width: 9, height: 9, borderRadius: radius.sm },
  pickerOptionLabel: { fontSize: fontSize.md, fontWeight: '600' },
  pickerOptionDesc:  { fontSize: fontSize.xs, marginTop: 1 },
});
