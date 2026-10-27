import { useState } from 'react';
import {
  View, Text, Pressable, Modal, TextInput, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { useTheme, useClasses } from '@gfp/ui';
import {
  digitsOnly, fmtPhoneInput, validateRoster, toPlayerInput, type GolferFields,
} from '@gfp/shared-types';
import { teamsApi, type Team, type RegisterTeamPayload } from '@/lib/api';
import { formStyles } from './formStyles';
import { fontSize, radius, spacing } from '@gfp/theme';

// ── Register Team Modal ───────────────────────────────────────────────────────

interface RegisterTeamModalProps {
  visible:      boolean;
  eventId:      string;
  onClose:      () => void;
  onRegistered: (team: Team) => void;
}

// Same fields as mobile and web (packages/shared-types/src/registration.ts).
// Desk entry, so phone stays optional for every golfer here.
type PlayerDraft = GolferFields;

function blankPlayer(): PlayerDraft {
  return { firstName: '', lastName: '', email: '', phone: '', handicap: '' };
}

export function RegisterTeamModal({ visible, eventId, onClose, onRegistered }: RegisterTeamModalProps) {
  const theme = useTheme();
  const c = useClasses();
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

  // Rows the organizer added but left completely empty are skipped; anything
  // half-filled is reported rather than silently dropped.
  function roster(): PlayerDraft[] {
    return players.filter(p =>
      p.firstName.trim() || p.lastName.trim() || p.email.trim() ||
      (p.phone ?? '').trim() || (p.handicap ?? '').trim());
  }

  function validate(): boolean {
    if (!teamName.trim()) { setError('Team name is required.'); return false; }
    if (teamName.trim().length > 200) { setError('Team name must be 200 characters or fewer.'); return false; }
    const rows = roster();
    if (rows.length === 0) { setError('Add at least one player.'); return false; }
    const problem = validateRoster(rows, {
      first:      { label: `Player ${players.indexOf(rows[0]) + 1}` },
      otherLabel: i => `Player ${players.indexOf(rows[i]) + 1}`,
    });
    if (problem) { setError(problem); return false; }
    return true;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setError(null);
    setLoading(true);
    try {
      const payload: RegisterTeamPayload = {
        teamName: teamName.trim(),
        players:  roster().map(toPlayerInput),
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
      <View style={c.overlay}>
        <ScrollView contentContainerStyle={formStyles.modalScroll} keyboardShouldPersistTaps="handled">
          <View style={formStyles.modal}>
            <Text style={c.modalTitle}>Register Team</Text>
            {error && <View style={c.errorBox}><Text style={c.errorText}>{error}</Text></View>}

            <Text style={c.fieldLabel}>Team Name *</Text>
            <TextInput
              style={c.input}
              value={teamName}
              onChangeText={v => { setTeamName(v); if (error) setError(null); }}
              placeholder="The Eagles"
              placeholderTextColor="#999"
              editable={!loading}
              maxLength={200}
            />

            <Text style={c.fieldLabel}>Players</Text>
            {players.map((p, idx) => (
              <View key={idx} style={styles.playerForm}>
                <View style={styles.playerFormHeader}>
                  <Text style={[styles.playerFormTitle, { color: theme.colors.primary }]}>
                    Player {idx + 1}{idx === 0 ? ' (Captain)' : ''}
                  </Text>
                  {players.length > 1 && (
                    <Pressable onPress={() => removePlayer(idx)}>
                      <Text style={{ color: '#e74c3c', fontSize: fontSize.sm }}>Remove</Text>
                    </Pressable>
                  )}
                </View>
                <View style={formStyles.nameRow}>
                  <TextInput
                    style={[c.input, formStyles.halfInput]}
                    value={p.firstName} onChangeText={v => updatePlayer(idx, 'firstName', v)}
                    placeholder="First *" placeholderTextColor="#999" editable={!loading}
                  />
                  <TextInput
                    style={[c.input, formStyles.halfInput]}
                    value={p.lastName} onChangeText={v => updatePlayer(idx, 'lastName', v)}
                    placeholder="Last *" placeholderTextColor="#999" editable={!loading}
                  />
                </View>
                <TextInput
                  style={[c.input, { marginTop: spacing[2] }]}
                  value={p.email} onChangeText={v => updatePlayer(idx, 'email', v)}
                  placeholder="Email *" placeholderTextColor="#999"
                  keyboardType="email-address" autoCapitalize="none" editable={!loading}
                />
                <View style={[formStyles.nameRow, { marginTop: spacing[2] }]}>
                  <TextInput
                    style={[c.input, formStyles.halfInput]}
                    value={p.phone ?? ''} onChangeText={v => updatePlayer(idx, 'phone', fmtPhoneInput(digitsOnly(v)))}
                    placeholder="Phone (optional)" placeholderTextColor="#999"
                    keyboardType="phone-pad" editable={!loading}
                  />
                  <TextInput
                    style={[c.input, formStyles.halfInput]}
                    value={p.handicap ?? ''} onChangeText={v => updatePlayer(idx, 'handicap', v)}
                    placeholder="Handicap (optional)" placeholderTextColor="#999"
                    keyboardType="decimal-pad" editable={!loading}
                  />
                </View>
              </View>
            ))}

            <Pressable style={[styles.addPlayerFormBtn, { borderColor: theme.colors.action }]} onPress={addPlayer}>
              <Text style={[styles.addPlayerFormText, { color: theme.colors.action }]}>+ Add Player</Text>
            </Pressable>

            <View style={c.formActions}>
              <Pressable style={c.cancelBtn} onPress={() => { reset(); onClose(); }}>
                <Text style={c.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[c.submitBtn, loading && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={c.submitText}>Register</Text>}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  playerForm: { borderWidth: 1, borderColor: '#eee', borderRadius: radius.md, padding: spacing[3], marginBottom: spacing[3], gap: spacing[2] },
  playerFormHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[1] },
  playerFormTitle: { fontSize: fontSize.sm, fontWeight: '700' },
  addPlayerFormBtn: { borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing[3], alignItems: 'center', marginTop: spacing[1] },
  addPlayerFormText: { fontSize: fontSize.md, fontWeight: '600' },
});
