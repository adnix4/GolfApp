import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView, Modal, TextInput,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { eventsApi, type EventDetail } from '@/lib/api';

const STATUS_COLOR: Record<string, string> = {
  draft:        '#95a5a6',
  registration: '#3498db',
  active:       '#2ecc71',
  scoring:      '#f39c12',
  completed:    '#27ae60',
  cancelled:    '#e74c3c',
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft:        ['registration', 'cancelled'],
  registration: ['active', 'cancelled'],
  active:       ['scoring', 'cancelled'],
  scoring:      ['completed', 'active'],
  completed:    [],
  cancelled:    [],
};

export default function EventOverviewScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const [event,   setEvent]   = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [showCourse, setShowCourse] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await eventsApi.get(id);
      setEvent(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load event.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(newStatus: string) {
    if (!event) return;
    setUpdating(true);
    try {
      const updated = await eventsApi.update(event.id, { status: newStatus });
      setEvent(updated);
    } catch (e: any) {
      setError(e.message ?? 'Failed to update status.');
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Event not found.'}</Text>
        <Pressable onPress={load}><Text style={{ color: theme.colors.action, marginTop: 8 }}>Retry</Text></Pressable>
      </View>
    );
  }

  const transitions = STATUS_TRANSITIONS[event.status] ?? [];

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      {/* Event header */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eventName, { color: theme.colors.primary }]}>{event.name}</Text>
          <Text style={[styles.eventCode, { color: theme.colors.accent }]}>Code: {event.eventCode}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[event.status] }]}>
          <Text style={styles.statusText}>{event.status}</Text>
        </View>
      </View>

      {/* Quick stats */}
      <View style={styles.statsRow}>
        {[
          { label: 'Teams',     value: event.counts.teamsRegistered },
          { label: 'Players',   value: event.counts.playersRegistered },
          { label: 'Checked In', value: event.counts.teamsCheckedIn },
          { label: 'Holes Scored', value: event.counts.holesScored },
        ].map(stat => (
          <View key={stat.label} style={[styles.statCard, { borderColor: '#e8e8e8' }]}>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: theme.colors.accent }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Event details */}
      <View style={[styles.section, { backgroundColor: '#fff', borderColor: '#e8e8e8' }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Details</Text>
        <DetailRow label="Format"     value={event.format.replace('_', ' ')} />
        <DetailRow label="Start Type" value={event.startType.replace('_', ' ')} />
        <DetailRow label="Holes"      value={String(event.holes)} />
        {event.startAt && (
          <DetailRow label="Start Date" value={new Date(event.startAt).toLocaleString()} />
        )}
      </View>

      {/* Course */}
      <View style={[styles.section, { backgroundColor: '#fff', borderColor: '#e8e8e8' }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Course</Text>
          {!event.course && (
            <Pressable
              style={[styles.smallBtn, { backgroundColor: theme.colors.action }]}
              onPress={() => setShowCourse(true)}
            >
              <Text style={styles.smallBtnText}>Attach Course</Text>
            </Pressable>
          )}
        </View>
        {event.course ? (
          <>
            <DetailRow label="Name"    value={event.course.name} />
            <DetailRow label="City"    value={`${event.course.city}, ${event.course.state}`} />
            <DetailRow label="Holes"   value={String(event.course.holes.length)} />
          </>
        ) : (
          <Text style={[styles.placeholder, { color: theme.colors.accent }]}>No course attached yet.</Text>
        )}
      </View>

      {/* Status transitions */}
      {transitions.length > 0 && (
        <View style={[styles.section, { backgroundColor: '#fff', borderColor: '#e8e8e8' }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Advance Status</Text>
          <View style={styles.transitionRow}>
            {transitions.map(next => (
              <Pressable
                key={next}
                style={[
                  styles.transitionBtn,
                  { backgroundColor: next === 'cancelled' ? '#e74c3c' : theme.colors.primary },
                  updating && { opacity: 0.6 },
                ]}
                onPress={() => handleStatusChange(next)}
                disabled={updating}
              >
                {updating
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.transitionBtnText}>
                      {next === 'cancelled' ? 'Cancel Event' : `→ ${next}`}
                    </Text>
                }
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <AttachCourseModal
        visible={showCourse}
        eventId={event.id}
        onClose={() => setShowCourse(false)}
        onAttached={updated => { setEvent(updated); setShowCourse(false); }}
      />
    </ScrollView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: theme.colors.accent }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: theme.colors.primary }]}>
        {value.charAt(0).toUpperCase() + value.slice(1)}
      </Text>
    </View>
  );
}

interface AttachCourseModalProps {
  visible:    boolean;
  eventId:    string;
  onClose:    () => void;
  onAttached: (event: EventDetail) => void;
}

function AttachCourseModal({ visible, eventId, onClose, onAttached }: AttachCourseModalProps) {
  const theme = useTheme();
  const [name,    setName]    = useState('');
  const [address, setAddress] = useState('');
  const [city,    setCity]    = useState('');
  const [state,   setState]   = useState('');
  const [zip,     setZip]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  function reset() {
    setName(''); setAddress(''); setCity(''); setState(''); setZip(''); setError(null);
  }

  async function handleSubmit() {
    if (!name.trim() || !city.trim() || !state.trim()) {
      setError('Name, city, and state are required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const updated = await eventsApi.attachCourse(eventId, {
        name: name.trim(), address: address.trim(),
        city: city.trim(), state: state.trim(), zip: zip.trim(),
      });
      reset();
      onAttached(updated);
    } catch (e: any) {
      setError(e.message ?? 'Failed to attach course.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { reset(); onClose(); }}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>Attach Course</Text>
          {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}
          {[
            { label: 'Course Name', value: name,    setter: setName,    placeholder: 'Pebble Beach Golf Links' },
            { label: 'Address',     value: address, setter: setAddress, placeholder: '17 Mile Dr' },
            { label: 'City',        value: city,    setter: setCity,    placeholder: 'Pebble Beach' },
            { label: 'State',       value: state,   setter: setState,   placeholder: 'CA' },
            { label: 'Zip',         value: zip,     setter: setZip,     placeholder: '93953' },
          ].map(f => (
            <View key={f.label}>
              <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>{f.label}</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.colors.accent }]}
                value={f.value}
                onChangeText={f.setter}
                placeholder={f.placeholder}
                placeholderTextColor="#999"
                editable={!loading}
              />
            </View>
          ))}
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
                : <Text style={styles.submitText}>Attach</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page:        { flex: 1 },
  pageContent: { padding: 28, gap: 16 },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 4,
  },
  eventName: { fontSize: 22, fontWeight: '800' },
  eventCode: { fontSize: 13, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  statValue: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  section: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  detailLabel: { fontSize: 13, fontWeight: '500' },
  detailValue: { fontSize: 13, fontWeight: '600' },
  placeholder: { fontSize: 14, fontStyle: 'italic' },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  smallBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  transitionRow: { flexDirection: 'row', gap: 10 },
  transitionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  transitionBtnText: { fontSize: 14, fontWeight: '700', color: '#fff', textTransform: 'capitalize' },
  errorText: { color: '#c0392b', fontSize: 14 },
  errorBox: {
    backgroundColor: '#fdf2f2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#e74c3c',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
  },
  modalTitle:   { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  fieldLabel:   { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fafafa',
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn:    { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  cancelText:   { fontSize: 15, fontWeight: '600' },
  submitBtn:    { flex: 2, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  submitText:   { fontSize: 15, fontWeight: '700', color: '#fff' },
});
