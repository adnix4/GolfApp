import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, FlatList, Modal, TextInput,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { teamsApi, type Team } from '@/lib/api';
import { useResponsive } from '@/lib/responsive';

type Filter = 'all' | 'pending' | 'checked_in';

export default function RegistrationScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const { isMobile, pagePadding } = useResponsive();

  const [teams,   setTeams]   = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [filter,  setFilter]  = useState<Filter>('all');
  const [busy,       setBusy]       = useState<Record<string, boolean>>({});
  const [walkUpOpen, setWalkUpOpen] = useState(false);

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
      {/* Walk-up modal */}
      <WalkUpModal
        visible={walkUpOpen}
        eventId={id}
        onClose={() => setWalkUpOpen(false)}
        onRegistered={team => { setTeams(prev => [...prev, team]); setWalkUpOpen(false); }}
      />

      {/* Header */}
      <View style={[styles.header, { paddingHorizontal: pagePadding }]}>
        <Text style={[styles.title, { color: theme.colors.primary }]}>
          Registration
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => setWalkUpOpen(true)}
            style={[styles.walkUpBtn, { backgroundColor: theme.colors.action }]}
          >
            <Text style={styles.walkUpBtnText}>+ Walk-Up</Text>
          </Pressable>
          <Pressable onPress={load} style={styles.refreshBtn} accessibilityLabel="Refresh">
            <Text style={[styles.refreshText, { color: theme.colors.accent }]}>↻ Refresh</Text>
          </Pressable>
        </View>
      </View>

      {/* Stats strip */}
      {!loading && (
        <View style={[
          styles.statsRow,
          { backgroundColor: theme.colors.surface, paddingHorizontal: pagePadding },
          isMobile && styles.statsRowMobile,
        ]}>
          <StatChip label="Total"      value={teams.length}              color={theme.colors.primary} style={isMobile ? styles.statHalf : undefined} />
          <StatChip label="Checked In" value={checkedIn}                 color="#27ae60"              style={isMobile ? styles.statHalf : undefined} />
          <StatChip label="Fees Paid"  value={feesPaid}                  color="#2980b9"              style={isMobile ? styles.statHalf : undefined} />
          <StatChip label="Pending"    value={teams.length - checkedIn}  color="#f39c12"              style={isMobile ? styles.statHalf : undefined} />
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

// ── WALK-UP MODAL ─────────────────────────────────────────────────────────────

interface WalkUpModalProps {
  visible:     boolean;
  eventId:     string;
  onClose:     () => void;
  onRegistered:(team: Team) => void;
}

function WalkUpModal({ visible, eventId, onClose, onRegistered }: WalkUpModalProps) {
  const theme = useTheme();
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [teamName,  setTeamName]  = useState('');
  const [handicap,  setHandicap]  = useState('');
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState<string | null>(null);

  function reset() {
    setFirstName(''); setLastName(''); setEmail('');
    setTeamName(''); setHandicap(''); setErr(null);
  }

  function handleClose() { reset(); onClose(); }

  async function handleSubmit() {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setErr('First name, last name, and email are required.'); return;
    }
    setSaving(true); setErr(null);
    try {
      const name = teamName.trim() || `${lastName.trim()} Walk-up`;
      const hcp  = handicap.trim() ? parseFloat(handicap) : undefined;
      const { team } = await teamsApi.registerTeam(eventId, {
        teamName: name,
        players:  [{ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), handicap: hcp }],
      });
      reset();
      onRegistered(team);
    } catch (e: any) {
      setErr(e.message ?? 'Registration failed.');
    } finally { setSaving(false); }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: '#fff' }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>Walk-Up Registration</Text>
            <Pressable onPress={handleClose} style={styles.modalClose}>
              <Text style={{ fontSize: 20, color: theme.colors.accent }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            <LabeledInput label="First Name *" value={firstName} onChangeText={setFirstName} placeholder="Jane" />
            <LabeledInput label="Last Name *"  value={lastName}  onChangeText={setLastName}  placeholder="Smith" />
            <LabeledInput label="Email *"      value={email}     onChangeText={setEmail}     placeholder="jane@example.com" keyboardType="email-address" autoCapitalize="none" />
            <LabeledInput label="Team Name"    value={teamName}  onChangeText={setTeamName}  placeholder={lastName.trim() ? `${lastName.trim()} Walk-up` : 'Auto-filled from last name'} />
            <LabeledInput label="Handicap"     value={handicap}  onChangeText={setHandicap}  placeholder="e.g. 12" keyboardType="numeric" />
          </ScrollView>

          {err && <Text style={styles.modalErr}>{err}</Text>}

          <View style={styles.modalActions}>
            <Pressable onPress={handleClose} style={styles.modalCancel}>
              <Text style={[styles.modalCancelText, { color: theme.colors.accent }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={saving}
              style={[styles.modalSubmit, { backgroundColor: theme.colors.action }]}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.modalSubmitText}>Register</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function LabeledInput({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.inputRow}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput style={styles.textInput} placeholderTextColor="#aaa" {...props} />
    </View>
  );
}

function StatChip({ label, value, color, style }: { label: string; value: number; color: string; style?: object }) {
  return (
    <View style={[styles.statChip, style]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page:   { flex: 1, backgroundColor: '#f7f8fa' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 24, paddingBottom: 12 },
  title:  { fontSize: 22, fontWeight: '800' },
  refreshBtn:    { paddingVertical: 6, paddingHorizontal: 12 },
  refreshText:   { fontSize: 14, fontWeight: '600' },
  walkUpBtn:     { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8 },
  walkUpBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Modal
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard:       { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12 },
  modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:      { fontSize: 18, fontWeight: '800' },
  modalClose:      { padding: 4 },
  inputRow:        { marginBottom: 14 },
  inputLabel:      { fontSize: 12, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 },
  textInput:       { borderWidth: 1.5, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: '#222', backgroundColor: '#fafafa' },
  modalErr:        { color: '#c0392b', fontSize: 13, marginTop: 10, marginBottom: 4 },
  modalActions:    { flexDirection: 'row', gap: 12, marginTop: 18 },
  modalCancel:     { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1.5, borderColor: '#ddd', alignItems: 'center' },
  modalCancelText: { fontSize: 14, fontWeight: '700' },
  modalSubmit:     { flex: 2, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  modalSubmitText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  statsRow:       { flexDirection: 'row', paddingVertical: 14, gap: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e0e0e0' },
  statsRowMobile: { flexWrap: 'wrap', gap: 0 },
  statChip:       { alignItems: 'center', flex: 1 },
  statHalf:       { flex: 0, width: '50%', paddingVertical: 10, paddingHorizontal: 8 },
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
