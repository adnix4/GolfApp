import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, FlatList, Modal, TextInput,
  StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { eventsApi, type EventSummary, type CreateEventPayload } from '@/lib/api';

const FORMAT_OPTIONS  = ['scramble', 'stroke', 'stableford', 'best_ball'] as const;
const START_OPTIONS   = ['shotgun', 'tee_times'] as const;
const HOLES_OPTIONS   = [9, 18] as const;

const STATUS_COLOR: Record<string, string> = {
  draft:        '#95a5a6',
  registration: '#3498db',
  active:       '#2ecc71',
  scoring:      '#f39c12',
  completed:    '#27ae60',
  cancelled:    '#e74c3c',
};

export default function EventsScreen() {
  const theme  = useTheme();
  const router = useRouter();

  const [events,  setEvents]  = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await eventsApi.list();
      setEvents(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load events.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleCreated(event: EventSummary) {
    setShowCreate(false);
    setEvents(prev => [event as EventSummary, ...prev]);
    router.push(`/(app)/events/${event.id}` as any);
  }

  return (
    <View style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.primary }]}>Events</Text>
        <Pressable
          style={[styles.createBtn, { backgroundColor: theme.colors.primary }]}
          onPress={() => setShowCreate(true)}
          accessibilityRole="button"
          accessibilityLabel="Create new event"
        >
          <Text style={[styles.createBtnText, { color: theme.colors.surface }]}>+ New Event</Text>
        </Pressable>
      </View>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}

      {!loading && error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={load}><Text style={{ color: theme.colors.action }}>Retry</Text></Pressable>
        </View>
      )}

      {!loading && !error && events.length === 0 && (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.colors.accent }]}>
            No events yet. Create your first event to get started.
          </Text>
        </View>
      )}

      {!loading && events.length > 0 && (
        <FlatList
          data={events}
          keyExtractor={e => e.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.card, { backgroundColor: '#fff', borderColor: '#e8e8e8' }]}
              onPress={() => router.push(`/(app)/events/${item.id}` as any)}
              accessibilityRole="button"
              accessibilityLabel={`Open event ${item.name}`}
            >
              <View style={styles.cardTop}>
                <Text style={[styles.cardName, { color: theme.colors.primary }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.status] ?? '#aaa' }]}>
                  <Text style={styles.badgeText}>{item.status}</Text>
                </View>
              </View>
              <View style={styles.cardMeta}>
                <Text style={[styles.metaItem, { color: theme.colors.accent }]}>
                  {item.format.replace('_', ' ')}
                </Text>
                <Text style={[styles.metaItem, { color: theme.colors.accent }]}>
                  Code: {item.eventCode}
                </Text>
                <Text style={[styles.metaItem, { color: theme.colors.accent }]}>
                  {item.teamCount} team{item.teamCount !== 1 ? 's' : ''}
                </Text>
                {item.startAt && (
                  <Text style={[styles.metaItem, { color: theme.colors.accent }]}>
                    {new Date(item.startAt).toLocaleDateString()}
                  </Text>
                )}
              </View>
            </Pressable>
          )}
        />
      )}

      <CreateEventModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />
    </View>
  );
}

// ── Create Event Modal ────────────────────────────────────────────────────────

interface CreateEventModalProps {
  visible:   boolean;
  onClose:   () => void;
  onCreated: (event: EventSummary) => void;
}

function CreateEventModal({ visible, onClose, onCreated }: CreateEventModalProps) {
  const theme = useTheme();

  const [name,      setName]      = useState('');
  const [format,    setFormat]    = useState<string>('scramble');
  const [startType, setStartType] = useState<string>('shotgun');
  const [holes,     setHoles]     = useState<9 | 18>(18);
  const [startAt,   setStartAt]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  function reset() {
    setName(''); setFormat('scramble'); setStartType('shotgun');
    setHoles(18); setStartAt(''); setError(null);
  }

  function handleClose() { reset(); onClose(); }

  async function handleSubmit() {
    if (!name.trim()) { setError('Event name is required.'); return; }
    setError(null);
    setLoading(true);
    try {
      const payload: CreateEventPayload = {
        name: name.trim(),
        format,
        startType,
        holes,
        ...(startAt ? { startAt } : {}),
      };
      const created = await eventsApi.create(payload);
      reset();
      onCreated(created as unknown as EventSummary);
    } catch (e: any) {
      setError(e.message ?? 'Failed to create event.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>New Event</Text>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Event Name</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.accent }]}
            value={name}
            onChangeText={setName}
            placeholder="Spring Charity Classic"
            placeholderTextColor="#999"
            editable={!loading}
          />

          <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Format</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
            {FORMAT_OPTIONS.map(f => (
              <Pressable
                key={f}
                style={[styles.pill, format === f && { backgroundColor: theme.colors.primary }]}
                onPress={() => setFormat(f)}
              >
                <Text style={[styles.pillText, format === f && { color: '#fff' }]}>
                  {f.replace('_', ' ')}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Start Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
            {START_OPTIONS.map(s => (
              <Pressable
                key={s}
                style={[styles.pill, startType === s && { backgroundColor: theme.colors.primary }]}
                onPress={() => setStartType(s)}
              >
                <Text style={[styles.pillText, startType === s && { color: '#fff' }]}>
                  {s.replace('_', ' ')}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Holes</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
            {HOLES_OPTIONS.map(h => (
              <Pressable
                key={h}
                style={[styles.pill, holes === h && { backgroundColor: theme.colors.primary }]}
                onPress={() => setHoles(h)}
              >
                <Text style={[styles.pillText, holes === h && { color: '#fff' }]}>{h}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Start Date (optional)</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.accent }]}
            value={startAt}
            onChangeText={setStartAt}
            placeholder="2025-06-15T09:00:00Z"
            placeholderTextColor="#999"
            editable={!loading}
          />

          <View style={styles.modalActions}>
            <Pressable style={[styles.cancelBtn, { borderColor: theme.colors.accent }]} onPress={handleClose}>
              <Text style={[styles.cancelText, { color: theme.colors.accent }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.submitBtn, { backgroundColor: theme.colors.primary }, loading && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitText}>Create Event</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    flex: 1,
    padding: 28,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
  },
  createBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  createBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    maxWidth: 300,
  },
  list: {
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardName: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
  },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaItem: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  errorBox: {
    backgroundColor: '#fdf2f2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#e74c3c',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    color: '#c0392b',
    fontSize: 14,
    flex: 1,
  },
  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fafafa',
  },
  pillRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
    marginRight: 8,
    backgroundColor: '#fafafa',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
    textTransform: 'capitalize',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 2,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
