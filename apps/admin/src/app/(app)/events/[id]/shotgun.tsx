import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, Pressable, TextInput, FlatList,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { eventsApi, teamsApi, type EventDetail, type Team } from '@/lib/api';
import { useResponsive } from '@/lib/responsive';
import { autoAssignHoles, validateShotgunAssignments } from '@/lib/shotgunUtils';

export default function ShotgunScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const theme   = useTheme();

  const { pagePadding } = useResponsive();

  const [event,    setEvent]    = useState<EventDetail | null>(null);
  const [teams,    setTeams]    = useState<Team[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);

  // Local assignment state: teamId → hole number string
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError(null); setSuccess(false);
    try {
      const [ev, ts] = await Promise.all([eventsApi.get(id), teamsApi.list(id)]);
      setEvent(ev);
      setTeams(ts);
      // Pre-populate from existing assignments
      const init: Record<string, string> = {};
      ts.forEach(t => { if (t.startingHole != null) init[t.id] = String(t.startingHole); });
      setAssignments(init);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Auto-assign: distribute teams evenly across holes 1..event.holes
  function handleAutoAssign() {
    if (!event) return;
    setAssignments(autoAssignHoles(teams, event.holes));
    setSuccess(false);
  }

  function setHole(teamId: string, val: string) {
    setAssignments(prev => ({ ...prev, [teamId]: val }));
    setSuccess(false);
  }

  const validationErrors = useMemo(() => {
    if (!event) return [];
    return validateShotgunAssignments(teams, assignments, event.holes);
  }, [assignments, teams, event]);

  async function handleSave() {
    if (validationErrors.length > 0 || !event) return;
    setSaving(true); setError(null); setSuccess(false);
    try {
      const payload = teams
        .filter(t => assignments[t.id])
        .map(t => ({ teamId: t.id, startingHole: parseInt(assignments[t.id], 10) }));
      await eventsApi.assignShotgun(id, payload);
      setSuccess(true);
    } catch (e: any) {
      setError(e.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const assignedCount = teams.filter(t => assignments[t.id]).length;

  // ── Not a shotgun event ───────────────────────────────────────────────────

  if (!loading && event && event.startType !== 'Shotgun') {
    return (
      <View style={styles.center}>
        <Text style={styles.notApplicableIcon}>🕐</Text>
        <Text style={[styles.notApplicableTitle, { color: theme.colors.primary }]}>
          Tee-Time Event
        </Text>
        <Text style={[styles.notApplicableText, { color: theme.colors.accent }]}>
          This event uses tee times, not a shotgun start.{'\n'}
          Tee times are set per team during registration.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: pagePadding, paddingTop: pagePadding }]}>
        <View>
          <Text style={[styles.title, { color: theme.colors.primary }]}>Shotgun Assignment</Text>
          {!loading && event && (
            <Text style={[styles.subtitle, { color: theme.colors.accent }]}>
              {teams.length} team{teams.length !== 1 ? 's' : ''} · {event.holes} holes ·{' '}
              {assignedCount} assigned
            </Text>
          )}
        </View>
        {!loading && (
          <View style={styles.headerActions}>
            <Pressable
              onPress={handleAutoAssign}
              style={[styles.autoBtn, { borderColor: theme.colors.action }]}
            >
              <Text style={[styles.autoBtnText, { color: theme.colors.action }]}>⚡ Auto-Assign</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving || validationErrors.length > 0 || assignedCount === 0}
              style={[
                styles.saveBtn,
                { backgroundColor: theme.colors.primary },
                (saving || validationErrors.length > 0 || assignedCount === 0) && { opacity: 0.4 },
              ]}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Save All</Text>}
            </Pressable>
          </View>
        )}
      </View>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <View style={styles.errorBox}>
          {validationErrors.map((e, i) => (
            <Text key={i} style={styles.errorText}>• {e}</Text>
          ))}
        </View>
      )}

      {/* General error */}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Success */}
      {success && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>✓ Assignments saved successfully</Text>
        </View>
      )}

      {/* Legend */}
      {!loading && teams.length > 0 && (
        <View style={[styles.legend, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.legendText, { color: theme.colors.accent }]}>
            Type a hole number (1–{event?.holes ?? 18}) for each team. Leave blank to skip.
            Duplicate holes are flagged above.
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : teams.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.colors.accent }]}>
            No teams registered yet. Add teams first.
          </Text>
        </View>
      ) : (
        <FlatList
          data={teams}
          keyExtractor={t => t.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={[styles.listHeader, { borderBottomColor: '#e0e0e0' }]}>
              <Text style={[styles.colTeam, styles.colLabel, { color: theme.colors.accent }]}>Team</Text>
              <Text style={[styles.colPlayers, styles.colLabel, { color: theme.colors.accent }]}>Players</Text>
              <Text style={[styles.colHole, styles.colLabel, { color: theme.colors.accent }]}>Hole</Text>
            </View>
          }
          renderItem={({ item: team }) => {
            const val    = assignments[team.id] ?? '';
            const num    = parseInt(val, 10);
            const isErr  = val !== '' && (isNaN(num) || num < 1 || num > (event?.holes ?? 18));
            const isDup  = !isErr && val !== '' && validationErrors.some(e => e.includes(`Hole ${val} assigned to both`) && e.includes(team.name));

            return (
              <View style={[styles.row, { borderBottomColor: '#f0f0f0' }]}>
                <View style={styles.colTeam}>
                  <Text style={[styles.teamName, { color: theme.colors.primary }]} numberOfLines={1}>
                    {team.name}
                  </Text>
                </View>
                <Text style={[styles.colPlayers, styles.playerCount, { color: theme.colors.accent }]}>
                  {team.players.length}
                </Text>
                <View style={styles.colHole}>
                  <TextInput
                    style={[
                      styles.holeInput,
                      { borderColor: isErr || isDup ? '#e74c3c' : val ? '#27ae60' : '#ddd' },
                      (isErr || isDup) && { backgroundColor: '#fdf2f2' },
                      val && !isErr && !isDup && { backgroundColor: '#f0faf4' },
                    ]}
                    value={val}
                    onChangeText={v => setHole(team.id, v.replace(/[^0-9]/g, ''))}
                    placeholder="—"
                    placeholderTextColor="#bbb"
                    keyboardType="numeric"
                    maxLength={2}
                    selectTextOnFocus
                    accessibilityLabel={`Starting hole for ${team.name}`}
                  />
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page:   { flex: 1, backgroundColor: '#f7f8fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, flexWrap: 'wrap', gap: 12 },
  title:         { fontSize: 22, fontWeight: '800' },
  subtitle:      { fontSize: 13, marginTop: 3 },
  headerActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  autoBtn:       { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  autoBtnText:   { fontSize: 13, fontWeight: '700' },
  saveBtn:       { borderRadius: 8, paddingHorizontal: 20, paddingVertical: 9, minWidth: 90, alignItems: 'center' },
  saveBtnText:   { fontSize: 13, fontWeight: '800', color: '#fff' },

  errorBox:   { marginHorizontal: 24, marginBottom: 8, backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: '#e74c3c', gap: 4 },
  errorText:  { color: '#c0392b', fontSize: 13 },
  successBox: { marginHorizontal: 24, marginBottom: 8, backgroundColor: '#f0faf4', borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: '#27ae60' },
  successText:{ color: '#1a6b3c', fontSize: 13, fontWeight: '600' },

  legend:     { marginHorizontal: 24, marginBottom: 8, borderRadius: 8, padding: 10 },
  legendText: { fontSize: 12, lineHeight: 18 },

  emptyText:  { fontSize: 15, textAlign: 'center' },

  list: { paddingHorizontal: 24, paddingBottom: 32 },

  listHeader:       { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, marginBottom: 4 },
  colLabel:         { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  colTeam:          { flex: 1 },
  colPlayers:       { width: 72, textAlign: 'center' },
  colHole:          { width: 80, alignItems: 'flex-end' },

  row:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  teamName:   { fontSize: 15, fontWeight: '600' },
  playerCount:{ textAlign: 'center', fontSize: 14 },

  holeInput: {
    width: 60, borderWidth: 1.5, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 16, fontWeight: '700', textAlign: 'center',
    backgroundColor: '#fff',
  },

  notApplicableIcon:  { fontSize: 40, marginBottom: 12 },
  notApplicableTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  notApplicableText:  { fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
