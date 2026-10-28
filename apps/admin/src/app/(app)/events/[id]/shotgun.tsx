import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, Pressable, TextInput, FlatList,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useEventDetail } from '@/lib/eventContext';
import { useTheme, useClasses } from '@gfp/ui';
import { eventsApi } from '@/lib/api';
import { useTeamList } from '@/lib/queries';
import { useResponsive } from '@/lib/responsive';
import { autoAssignHoles, validateShotgunAssignments } from '@/lib/shotgunUtils';
import { fontSize, radius, spacing, status } from '@gfp/theme';

export default function ShotgunScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const theme   = useTheme();
  const c       = useClasses();

  const { pagePadding } = useResponsive();

  const { event } = useEventDetail();
  const teamList = useTeamList(id);
  const { items: teams, setItems: setTeams, loading } = teamList;
  const [saving,   setSaving]   = useState(false);
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError
    ?? (teamList.error ? (teamList.error.message || 'Failed to load.') : null);
  const [success,  setSuccess]  = useState(false);

  // Local assignment state: teamId → hole number string
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  // Pre-populate from existing assignments once the roster first arrives. A
  // background refresh later must not overwrite holes the organizer is typing.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || loading) return;
    seeded.current = true;
    const init: Record<string, string> = {};
    teams.forEach(t => { if (t.startingHole != null) init[t.id] = String(t.startingHole); });
    setAssignments(init);
  }, [teams, loading]);

  // Auto-assign: a random hole for each team still blank; holes already set stay
  function handleAutoAssign() {
    if (!event) return;
    setAssignments(prev => autoAssignHoles(teams, event.holes, prev));
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
      // Other tabs (Teams, Print Kit's tee sheet) read startingHole from the cache.
      const saved = new Map(payload.map(p => [p.teamId, p.startingHole]));
      setTeams(prev => prev.map(t => saved.has(t.id) ? { ...t, startingHole: saved.get(t.id)! } : t));
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
        <Text style={[styles.notApplicableText, { color: theme.mutedText }]}>
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
          <Text style={c.title}>Shotgun Assignment</Text>
          {!loading && event && (
            <Text style={[styles.subtitle, { color: theme.mutedText }]}>
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
        <View style={[c.errorBox, styles.errorBox]}>
          {validationErrors.map((e, i) => (
            <Text key={i} style={[c.errorText, styles.errorText]}>• {e}</Text>
          ))}
        </View>
      )}

      {/* General error */}
      {error && (
        <View style={[c.errorBox, styles.errorBox]}>
          <Text style={[c.errorText, styles.errorText]}>{error}</Text>
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
          <Text style={[styles.legendText, { color: theme.mutedText }]}>
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
          <Text style={[c.emptyText, styles.emptyText]}>
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
              <Text style={[styles.colTeam, styles.colLabel, { color: theme.mutedText }]}>Team</Text>
              <Text style={[styles.colPlayers, styles.colLabel, { color: theme.mutedText }]}>Players</Text>
              <Text style={[styles.colHole, styles.colLabel, { color: theme.mutedText }]}>Hole</Text>
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
                <Text style={[styles.colPlayers, styles.playerCount, { color: theme.mutedText }]}>
                  {team.players.length}
                </Text>
                <View style={styles.colHole}>
                  <TextInput
                    style={[
                      styles.holeInput,
                      { borderColor: isErr || isDup ? '#e74c3c' : val ? '#27ae60' : '#ddd' },
                      (isErr || isDup) && { backgroundColor: status.dangerBg },
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing[8] },

  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: spacing[4], flexWrap: 'wrap', gap: spacing[3] },
  subtitle:      { fontSize: fontSize.sm, marginTop: spacing[1] },
  headerActions: { flexDirection: 'row', gap: spacing[3], alignItems: 'center' },
  autoBtn:       { borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  autoBtnText:   { fontSize: fontSize.sm, fontWeight: '700' },
  saveBtn:       { borderRadius: radius.md, paddingHorizontal: spacing[5], paddingVertical: spacing[2], minWidth: 90, alignItems: 'center' },
  saveBtnText:   { fontSize: fontSize.sm, fontWeight: '800', color: '#fff' },

  errorBox:   { marginHorizontal: spacing[6], gap: spacing[1] },   // inset to the page header
  errorText:  { fontSize: fontSize.sm },          // over c.errorText
  successBox: { marginHorizontal: spacing[6], marginBottom: spacing[2], backgroundColor: '#f0faf4', borderRadius: radius.md, padding: spacing[3], borderLeftWidth: 3, borderLeftColor: status.success },
  successText:{ color: '#1a6b3c', fontSize: fontSize.sm, fontWeight: '600' },

  legend:     { marginHorizontal: spacing[6], marginBottom: spacing[2], borderRadius: radius.md, padding: spacing[3] },
  legendText: { fontSize: fontSize.xs, lineHeight: 18 },

  emptyText:  { textAlign: 'center' },            // over c.emptyText

  list: { paddingHorizontal: spacing[6], paddingBottom: spacing[8] },

  listHeader:       { flexDirection: 'row', paddingVertical: spacing[3], borderBottomWidth: 1, marginBottom: spacing[1] },
  colLabel:         { fontSize: fontSize.xxs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  colTeam:          { flex: 1 },
  colPlayers:       { width: 72, textAlign: 'center' },
  colHole:          { width: 80, alignItems: 'flex-end' },

  row:        { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth },
  teamName:   { fontSize: fontSize.lg, fontWeight: '600' },
  playerCount:{ textAlign: 'center', fontSize: fontSize.md },

  holeInput: {
    width: 60, borderWidth: 1.5, borderRadius: radius.md,
    paddingHorizontal: spacing[3], paddingVertical: spacing[2],
    fontSize: fontSize.xl, fontWeight: '700', textAlign: 'center',
    backgroundColor: '#fff',
  },

  notApplicableIcon:  { fontSize: 40, marginBottom: spacing[3] },
  notApplicableTitle: { fontSize: fontSize.xxl, fontWeight: '800', marginBottom: spacing[2] },
  notApplicableText:  { fontSize: fontSize.md, textAlign: 'center', lineHeight: 22 },
});
