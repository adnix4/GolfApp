import { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useClasses, Heading } from '@gfp/ui';
import { teamsApi, type Team } from '@/lib/api';
import { formStyles } from './formStyles';
import { fontSize, spacing, neutral } from '@gfp/theme';

// ── Edit Team Modal ───────────────────────────────────────────────────────────

interface EditTeamModalProps {
  visible:  boolean;
  eventId:  string;
  team:     Team | null;
  onClose:  () => void;
  onSaved:  (team: Team) => void;
}

export function EditTeamModal({ visible, eventId, team, onClose, onSaved }: EditTeamModalProps) {
  const c = useClasses();
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
      <View style={c.overlay}>
        <View style={formStyles.modal}>
          <Heading level={2} style={c.modalTitle}>Edit Team</Heading>
          {error && <View style={c.errorBox}><Text style={c.errorText}>{error}</Text></View>}

          <Text style={c.fieldLabel}>Team Name *</Text>
          <TextInput
            accessibilityLabel="Team Name"
            style={c.input}
            value={name}
            onChangeText={v => { setName(v); if (error) setError(null); }}
            placeholder="Team name"
            placeholderTextColor={neutral.placeholder}
            editable={!loading}
            maxLength={200}
          />

          <Text style={c.fieldLabel}>Max Players (1–8)</Text>
          <TextInput
            accessibilityLabel="Max Players"
            style={c.input}
            value={maxPlayers}
            onChangeText={v => { setMaxPlayers(v.replace(/[^0-9]/g, '')); if (error) setError(null); }}
            placeholder="4"
            placeholderTextColor={neutral.placeholder}
            keyboardType="number-pad"
            editable={!loading}
          />
          {team && (
            <Text style={{ color: neutral.mutedText, fontSize: fontSize.xs, marginTop: spacing[1] }}>
              Currently {team.players.length} player{team.players.length !== 1 ? 's' : ''} on this team.
            </Text>
          )}

          <View style={c.formActions}>
            <Pressable accessibilityRole="button" style={c.cancelBtn} onPress={onClose}>
              <Text style={c.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Save"
              style={[c.submitBtn, loading && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={c.submitText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
