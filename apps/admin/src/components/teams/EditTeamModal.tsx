import { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useTheme } from '@gfp/ui';
import { teamsApi, type Team } from '@/lib/api';
import { formStyles } from './formStyles';

// ── Edit Team Modal ───────────────────────────────────────────────────────────

interface EditTeamModalProps {
  visible:  boolean;
  eventId:  string;
  team:     Team | null;
  onClose:  () => void;
  onSaved:  (team: Team) => void;
}

export function EditTeamModal({ visible, eventId, team, onClose, onSaved }: EditTeamModalProps) {
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
      <View style={formStyles.overlay}>
        <View style={formStyles.modal}>
          <Text style={[formStyles.modalTitle, { color: theme.colors.primary }]}>Edit Team</Text>
          {error && <View style={formStyles.errorBox}><Text style={formStyles.errorText}>{error}</Text></View>}

          <Text style={[formStyles.fieldLabel, { color: theme.colors.primary }]}>Team Name *</Text>
          <TextInput
            style={[formStyles.input, { borderColor: theme.colors.accent }]}
            value={name}
            onChangeText={v => { setName(v); if (error) setError(null); }}
            placeholder="Team name"
            placeholderTextColor="#999"
            editable={!loading}
            maxLength={200}
          />

          <Text style={[formStyles.fieldLabel, { color: theme.colors.primary }]}>Max Players (1–8)</Text>
          <TextInput
            style={[formStyles.input, { borderColor: theme.colors.accent }]}
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
                : <Text style={formStyles.submitText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
