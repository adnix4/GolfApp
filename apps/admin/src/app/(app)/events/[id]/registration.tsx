import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, FlatList,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { teamsApi, type Team } from '@/lib/api';

type Filter = 'all' | 'pending' | 'checked_in';

export default function RegistrationScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const [teams,   setTeams]   = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [filter,  setFilter]  = useState<Filter>('all');
  const [busy,    setBusy]    = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setTeams(await teamsApi.list(id)); }
    catch (e: any) { setError(e.message ?? 'Failed to load teams.'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleCheckIn(teamId: string) {
    setBusy(b => ({ ...b, [teamId + '_ci']: true }));
    try {
      const updated = await teamsApi.checkIn(id, teamId);
      setTeams(prev => prev.map(t => t.id === teamId ? updated : t));
    } catch (e: any) { setError(e.message ?? 'Check-in failed.'); }
    finally { setBusy(b => ({ ...b, [teamId + '_ci']: false })); }
  }

  async function handleMarkPaid(teamId: string) {
    setBusy(b => ({ ...b, [teamId + '_fee']: true }));
    try {
      const updated = await teamsApi.markFeePaid(id, teamId);
      setTeams(prev => prev.map(t => t.id === teamId ? updated : t));
    } catch (e: any) { setError(e.message ?? 'Failed to mark fee paid.'); }
    finally { setBusy(b => ({ ...b, [teamId + '_fee']: false })); }
  }

  const filtered = teams.filter(t =>
    filter === 'all'        ? true :
    filter === 'pending'    ? t.checkInStatus === 'pending' :
    /* checked_in */          t.checkInStatus !== 'pending',
  );

  const checkedIn = teams.filter(t => t.checkInStatus !== 'pending').length;
  const feesPaid  = teams.filter(t => t.entryFeePaid).length;

  return (
    <View style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.primary }]}>
          Registration
        </Text>
        <Pressable onPress={load} style={styles.refreshBtn} accessibilityLabel="Refresh">
          <Text style={[styles.refreshText, { color: theme.colors.accent }]}>↻ Refresh</Text>
        </Pressable>
      </View>

      {/* Stats strip */}
      {!loading && (
        <View style={[styles.statsRow, { backgroundColor: theme.colors.surface }]}>
          <StatChip label="Total"      value={teams.length}   color={theme.colors.primary} />
          <StatChip label="Checked In" value={checkedIn}      color="#27ae60" />
          <StatChip label="Fees Paid"  value={feesPaid}       color="#2980b9" />
          <StatChip label="Pending"    value={teams.length - checkedIn} color="#f39c12" />
        </View>
      )}

      {/* Filter tabs */}
      <View style={[styles.filterRow, { borderBottomColor: '#e0e0e0' }]}>
        {(['all', 'pending', 'checked_in'] as Filter[]).map(f => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterBtn, filter === f && { borderBottomColor: theme.colors.primary }]}
          >
            <Text style={[
              styles.filterText,
              { color: filter === f ? theme.colors.primary : theme.colors.accent },
              filter === f && { fontWeight: '700' },
            ]}>
              {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : 'Checked In'}
            </Text>
          </Pressable>
        ))}
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.colors.accent }]}>No teams match this filter.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={t => t.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: team }) => {
            const isCheckedIn = team.checkInStatus !== 'pending';
            return (
              <View style={[styles.card, { borderColor: '#e8e8e8' }]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.teamName, { color: theme.colors.primary }]}>{team.name}</Text>
                    <Text style={[styles.meta, { color: theme.colors.accent }]}>
                      {team.players.length} player{team.players.length !== 1 ? 's' : ''}
                      {team.startingHole ? ` · Hole ${team.startingHole}` : ''}
                      {team.teeTime ? ` · ${new Date(team.teeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </Text>
                  </View>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: isCheckedIn ? '#2ecc71' : '#f39c12' },
                  ]}>
                    <Text style={styles.statusText}>
                      {isCheckedIn ? 'Checked In' : 'Pending'}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  {/* Fee status */}
                  {team.entryFeePaid ? (
                    <View style={[styles.pill, { borderColor: '#27ae60' }]}>
                      <Text style={[styles.pillText, { color: '#27ae60' }]}>✓ Fee Paid</Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => handleMarkPaid(team.id)}
                      disabled={busy[team.id + '_fee']}
                      style={[styles.actionBtn, { borderColor: '#2980b9' }]}
                    >
                      {busy[team.id + '_fee']
                        ? <ActivityIndicator size="small" color="#2980b9" />
                        : <Text style={[styles.actionBtnText, { color: '#2980b9' }]}>Mark Fee Paid</Text>}
                    </Pressable>
                  )}

                  {/* Check-in */}
                  {!isCheckedIn && (
                    <Pressable
                      onPress={() => handleCheckIn(team.id)}
                      disabled={busy[team.id + '_ci']}
                      style={[styles.actionBtn, { borderColor: theme.colors.action, backgroundColor: theme.colors.action }]}
                    >
                      {busy[team.id + '_ci']
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={[styles.actionBtnText, { color: '#fff' }]}>Check In</Text>}
                    </Pressable>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statChip}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page:   { flex: 1, backgroundColor: '#f7f8fa' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingBottom: 12 },
  title:  { fontSize: 22, fontWeight: '800' },
  refreshBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  refreshText: { fontSize: 14, fontWeight: '600' },

  statsRow: { flexDirection: 'row', paddingHorizontal: 24, paddingVertical: 14, gap: 24, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e0e0e0' },
  statChip: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 11, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.4 },

  filterRow: { flexDirection: 'row', paddingHorizontal: 24, borderBottomWidth: 1 },
  filterBtn: { paddingVertical: 12, paddingHorizontal: 4, marginRight: 24, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  filterText: { fontSize: 14 },

  errorBox: { margin: 16, backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
  errorText: { color: '#c0392b', fontSize: 14 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 15 },

  list: { padding: 16, gap: 10 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  teamName: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  cardActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  pill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: 13, fontWeight: '600' },
  actionBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, minWidth: 110, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
});
