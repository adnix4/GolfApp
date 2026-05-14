import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, FlatList, Modal, TextInput,
  StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { eventsApi, type EventSummary, type CreateEventPayload } from '@/lib/api';

const FORMAT_OPTIONS  = ['Scramble', 'Stroke', 'Stableford', 'BestBall'] as const;
const START_OPTIONS   = ['Shotgun', 'TeeTimes'] as const;
const HOLES_OPTIONS   = [9, 18] as const;

const FORMAT_LABELS: Record<string, string> = {
  Scramble:   'Scramble',
  Stroke:     'Stroke Play',
  Stableford: 'Stableford',
  BestBall:   'Best Ball',
};
const FORMAT_HINTS: Record<string, string> = {
  Scramble:   'Team plays the best shot each stroke',
  Stroke:     'Total strokes counted per player',
  Stableford: 'Points awarded based on score vs par',
  BestBall:   'Best individual score counts per hole',
};
const START_LABELS: Record<string, string> = {
  Shotgun:   'Shotgun Start',
  TeeTimes:  'Tee Times',
};
const START_HINTS: Record<string, string> = {
  Shotgun:   'All teams begin simultaneously from different holes',
  TeeTimes:  'Teams are assigned scheduled tee times',
};

const STATUS_COLOR: Record<string, string> = {
  Draft:        '#95a5a6',
  Registration: '#3498db',
  Active:       '#2ecc71',
  Scoring:      '#f39c12',
  Completed:    '#27ae60',
  Cancelled:    '#e74c3c',
};

export default function EventsScreen() {
  const theme  = useTheme();
  const router = useRouter();

  const [events,     setEvents]     = useState<EventSummary[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [openingReg, setOpeningReg] = useState<string | null>(null); // eventId being advanced

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

  async function handleOpenRegistration(item: EventSummary) {
    if (!item.startAt) {
      // No start date — send them to the Overview tab to set one first
      router.push(`/(app)/events/${item.id}` as any);
      return;
    }
    setOpeningReg(item.id);
    try {
      const updated = await eventsApi.update(item.id, { status: 'Registration' });
      setEvents(prev => prev.map(e => e.id === item.id ? { ...e, status: updated.status } : e));
    } catch (e: any) {
      setError(e.message ?? 'Failed to open registration.');
    } finally {
      setOpeningReg(null);
    }
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
                  {FORMAT_LABELS[item.format] ?? item.format}
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
              {item.status === 'Draft' && (
                <View style={styles.cardActions}>
                  <Pressable
                    style={[
                      styles.openRegBtn,
                      { backgroundColor: item.startAt ? theme.colors.primary : '#bdbdbd' },
                      openingReg === item.id && { opacity: 0.6 },
                    ]}
                    onPress={e => { e.stopPropagation?.(); handleOpenRegistration(item); }}
                    disabled={openingReg === item.id}
                    accessibilityRole="button"
                    accessibilityLabel="Open registration for this event"
                  >
                    {openingReg === item.id
                      ? <ActivityIndicator color="#fff" size="small" />
                      : (
                        <Text style={styles.openRegBtnText}>
                          {item.startAt ? 'Open Registration' : 'Set Start Date to Open Registration'}
                        </Text>
                      )}
                  </Pressable>
                </View>
              )}
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

interface FieldErrors {
  name?:      string;
  startDate?: string;
  startTime?: string;
}

// Auto-format as MM/DD/YYYY while user types digits
function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

// Auto-format as HH:MM while user types digits
function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

// Validate date string and return error message or undefined
function validateDateField(date: string): string | undefined {
  if (!date) return undefined;
  if (date.length < 10) return 'Enter a complete date (MM/DD/YYYY)';
  const [mStr, dStr, yStr] = date.split('/');
  const m = Number(mStr), d = Number(dStr), y = Number(yStr);
  if (!m || !d || !y) return 'Enter date as MM/DD/YYYY';
  if (m < 1 || m > 12) return 'Month must be between 01 and 12';
  if (d < 1 || d > 31) return 'Day must be between 01 and 31';
  if (y < 2025) return 'Year must be 2025 or later';
  return undefined;
}

// Validate time string and return error message or undefined
function validateTimeField(time: string): string | undefined {
  if (!time) return undefined;
  if (time.length < 5) return 'Enter a complete time (HH:MM)';
  const [hStr, mStr] = time.split(':');
  const h = Number(hStr), m = Number(mStr);
  if (isNaN(h) || isNaN(m)) return 'Enter time as HH:MM';
  if (h < 1 || h > 12) return 'Hour must be between 1 and 12';
  if (m < 0 || m > 59) return 'Minutes must be between 00 and 59';
  return undefined;
}

// Build a UTC ISO-8601 string from the form's date/time fields.
// Uses local calendar date + wall-clock time, which matches what admins expect.
function buildStartAt(date: string, time: string, ampm: 'AM' | 'PM'): string | undefined {
  if (!date || date.length < 10) return undefined;
  const [mStr, dStr, yStr] = date.split('/');
  const m = Number(mStr), d = Number(dStr), y = Number(yStr);
  if (!m || !d || !y) return undefined;

  let h = 0, min = 0;
  if (time && time.length >= 5) {
    const [hStr, mStr2] = time.split(':');
    h = Number(hStr) || 0;
    min = Number(mStr2) || 0;
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
  }

  // Local-time Date → toISOString() converts to UTC automatically
  return new Date(y, m - 1, d, h, min, 0).toISOString();
}

// Map API errors to messages a non-technical user can act on
function friendlyApiError(e: unknown): string {
  if (e && typeof e === 'object') {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status === 401) return 'Your session has expired. Please log in again.';
    if (err.status === 409) return 'An event with that name already exists for your organization.';
    if (err.status === 400) return 'Some entries are invalid. Check the form and try again.';
    if (err.status && err.status >= 500) return 'The server encountered an error. Please try again in a moment.';
    if (err.message) return err.message;
  }
  if (e instanceof TypeError && String(e.message).toLowerCase().includes('fetch')) {
    return 'Unable to reach the server. Check your internet connection.';
  }
  return 'Something went wrong. Please try again.';
}

function CreateEventModal({ visible, onClose, onCreated }: CreateEventModalProps) {
  const theme = useTheme();

  const [name,        setName]        = useState('');
  const [format,      setFormat]      = useState<string>('Scramble');
  const [startType,   setStartType]   = useState<string>('Shotgun');
  const [holes,       setHoles]       = useState<9 | 18>(18);
  const [startDate,   setStartDate]   = useState('');   // MM/DD/YYYY
  const [startTime,   setStartTime]   = useState('');   // HH:MM
  const [startAmPm,   setStartAmPm]   = useState<'AM' | 'PM'>('AM');
  const [loading,     setLoading]     = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched,     setTouched]     = useState<Record<string, boolean>>({});

  function reset() {
    setName(''); setFormat('Scramble'); setStartType('Shotgun'); setHoles(18);
    setStartDate(''); setStartTime(''); setStartAmPm('AM');
    setSubmitError(null); setFieldErrors({}); setTouched({});
  }

  function handleClose() { reset(); onClose(); }

  function touch(field: string) {
    setTouched(prev => ({ ...prev, [field]: true }));
  }

  // Validate all fields and return true if the form is submittable
  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    if (!name.trim()) {
      errs.name = 'Event name is required.';
    } else if (name.trim().length < 3) {
      errs.name = 'Name must be at least 3 characters.';
    } else if (name.trim().length > 200) {
      errs.name = 'Name cannot exceed 200 characters.';
    }
    const dateErr = validateDateField(startDate);
    if (dateErr) errs.startDate = dateErr;
    const timeErr = validateTimeField(startTime);
    if (timeErr) errs.startTime = timeErr;
    return errs;
  }

  async function handleSubmit() {
    // Mark all fields as touched so errors show
    setTouched({ name: true, startDate: true, startTime: true });
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitError(null);
    setLoading(true);
    try {
      const startAt = buildStartAt(startDate, startTime, startAmPm);
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
    } catch (e) {
      setSubmitError(friendlyApiError(e));
    } finally {
      setLoading(false);
    }
  }

  const nameCharCount = name.length;
  const showNameError  = touched.name      && !!fieldErrors.name;
  const showDateError  = touched.startDate && !!fieldErrors.startDate;
  const showTimeError  = touched.startTime && !!fieldErrors.startTime;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <ScrollView
          contentContainerStyle={styles.overlayScroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.modal}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>New Event</Text>
            <Text style={styles.requiredNote}>
              <Text style={styles.requiredStar}>*</Text> Required fields
            </Text>

            {submitError && (
              <View style={styles.submitErrorBox}>
                <Text style={styles.submitErrorIcon}>⚠</Text>
                <Text style={styles.submitErrorText}>{submitError}</Text>
              </View>
            )}

            {/* ── Event Name ── */}
            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>
                Event Name <Text style={styles.requiredStar}>*</Text>
              </Text>
              <Text style={[styles.charCount, nameCharCount > 180 && styles.charCountWarn]}>
                {nameCharCount}/200
              </Text>
            </View>
            <TextInput
              style={[
                styles.input,
                { borderColor: showNameError ? '#e74c3c' : theme.colors.accent },
              ]}
              value={name}
              onChangeText={v => {
                setName(v);
                if (touched.name) setFieldErrors(prev => ({ ...prev, name: undefined }));
              }}
              onBlur={() => {
                touch('name');
                setFieldErrors(prev => ({ ...prev, name: validate().name }));
              }}
              placeholder="e.g. Spring Charity Classic"
              placeholderTextColor="#999"
              editable={!loading}
              maxLength={200}
              accessibilityLabel="Event name"
            />
            {showNameError && (
              <Text style={styles.fieldError}>{fieldErrors.name}</Text>
            )}

            {/* ── Format ── */}
            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>
              Format <Text style={styles.requiredStar}>*</Text>
            </Text>
            <View style={styles.optionGrid}>
              {FORMAT_OPTIONS.map(f => {
                const active = format === f;
                return (
                  <Pressable
                    key={f}
                    style={[
                      styles.optionCard,
                      active && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
                    ]}
                    onPress={() => setFormat(f)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={FORMAT_LABELS[f]}
                  >
                    <Text style={[styles.optionCardTitle, active && { color: '#fff' }]}>
                      {FORMAT_LABELS[f]}
                    </Text>
                    <Text style={[styles.optionCardHint, active && { color: 'rgba(255,255,255,0.85)' }]}>
                      {FORMAT_HINTS[f]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ── Start Type ── */}
            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>
              Start Type <Text style={styles.requiredStar}>*</Text>
            </Text>
            <View style={styles.optionRow}>
              {START_OPTIONS.map(s => {
                const active = startType === s;
                return (
                  <Pressable
                    key={s}
                    style={[
                      styles.optionCard,
                      styles.optionCardHalf,
                      active && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
                    ]}
                    onPress={() => setStartType(s)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={START_LABELS[s]}
                  >
                    <Text style={[styles.optionCardTitle, active && { color: '#fff' }]}>
                      {START_LABELS[s]}
                    </Text>
                    <Text style={[styles.optionCardHint, active && { color: 'rgba(255,255,255,0.85)' }]}>
                      {START_HINTS[s]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ── Holes ── */}
            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>
              Holes <Text style={styles.requiredStar}>*</Text>
            </Text>
            <View style={styles.pillRow}>
              {HOLES_OPTIONS.map(h => (
                <Pressable
                  key={h}
                  style={[styles.pill, holes === h && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
                  onPress={() => setHoles(h)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: holes === h }}
                >
                  <Text style={[styles.pillText, holes === h && { color: '#fff' }]}>
                    {h} holes
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* ── Start Date & Time ── */}
            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>
              Start Date & Time{' '}
              <Text style={styles.optionalTag}>(optional)</Text>
            </Text>
            <Text style={styles.fieldHint}>
              Can be set now or updated later from event settings.
            </Text>

            <View style={styles.dateTimeRow}>
              {/* Date */}
              <View style={styles.dateCol}>
                <Text style={styles.subLabel}>Date</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.inputSm,
                    { borderColor: showDateError ? '#e74c3c' : theme.colors.accent },
                  ]}
                  value={startDate}
                  onChangeText={v => {
                    setStartDate(formatDateInput(v));
                    if (touched.startDate) setFieldErrors(prev => ({ ...prev, startDate: undefined }));
                  }}
                  onBlur={() => {
                    touch('startDate');
                    setFieldErrors(prev => ({ ...prev, startDate: validateDateField(startDate) }));
                  }}
                  placeholder="MM/DD/YYYY"
                  placeholderTextColor="#aaa"
                  keyboardType="number-pad"
                  editable={!loading}
                  accessibilityLabel="Start date MM/DD/YYYY"
                />
                {showDateError && (
                  <Text style={styles.fieldError}>{fieldErrors.startDate}</Text>
                )}
              </View>

              {/* Time + AM/PM */}
              <View style={styles.timeCol}>
                <Text style={styles.subLabel}>Time</Text>
                <View style={styles.timeInputRow}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.inputSm,
                      styles.timeInput,
                      { borderColor: showTimeError ? '#e74c3c' : theme.colors.accent },
                    ]}
                    value={startTime}
                    onChangeText={v => {
                      setStartTime(formatTimeInput(v));
                      if (touched.startTime) setFieldErrors(prev => ({ ...prev, startTime: undefined }));
                    }}
                    onBlur={() => {
                      touch('startTime');
                      setFieldErrors(prev => ({ ...prev, startTime: validateTimeField(startTime) }));
                    }}
                    placeholder="HH:MM"
                    placeholderTextColor="#aaa"
                    keyboardType="number-pad"
                    editable={!loading}
                    accessibilityLabel="Start time HH:MM"
                  />
                  <Pressable
                    style={[styles.ampmBtn, { borderColor: theme.colors.accent }]}
                    onPress={() => setStartAmPm(p => p === 'AM' ? 'PM' : 'AM')}
                    accessibilityRole="button"
                    accessibilityLabel={`Toggle AM/PM, currently ${startAmPm}`}
                  >
                    <Text style={[styles.ampmText, { color: theme.colors.primary }]}>{startAmPm}</Text>
                  </Pressable>
                </View>
                {showTimeError && (
                  <Text style={styles.fieldError}>{fieldErrors.startTime}</Text>
                )}
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.cancelBtn, { borderColor: theme.colors.accent }]}
                onPress={handleClose}
                disabled={loading}
              >
                <Text style={[styles.cancelText, { color: theme.colors.accent }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.submitBtn,
                  { backgroundColor: theme.colors.primary },
                  loading && { opacity: 0.6 },
                ]}
                onPress={handleSubmit}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Create event"
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitText}>Create Event</Text>}
              </Pressable>
            </View>
          </View>
        </ScrollView>
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
  cardActions: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 10,
  },
  openRegBtn: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  openRegBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
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
  overlayScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
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
    marginBottom: 4,
  },
  requiredNote: {
    fontSize: 12,
    color: '#888',
    marginBottom: 14,
  },
  requiredStar: {
    color: '#e74c3c',
    fontWeight: '700',
  },
  submitErrorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fdf2f2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#e74c3c',
    gap: 8,
  },
  submitErrorIcon: {
    fontSize: 14,
    color: '#c0392b',
    marginTop: 1,
  },
  submitErrorText: {
    color: '#c0392b',
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 14,
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 14,
  },
  charCount: {
    fontSize: 11,
    color: '#aaa',
  },
  charCountWarn: {
    color: '#e67e22',
  },
  fieldError: {
    fontSize: 12,
    color: '#e74c3c',
    marginTop: 4,
    marginLeft: 2,
  },
  fieldHint: {
    fontSize: 12,
    color: '#888',
    marginTop: -4,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fafafa',
  },
  inputSm: {
    fontSize: 14,
    paddingVertical: 9,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  optionCard: {
    flex: 1,
    minWidth: '44%',
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fafafa',
  },
  optionCardHalf: {
    minWidth: 0,
  },
  optionCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
    marginBottom: 2,
  },
  optionCardHint: {
    fontSize: 11,
    color: '#777',
    lineHeight: 15,
  },
  pillRow: {
    flexDirection: 'row',
    marginBottom: 4,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#ccc',
    backgroundColor: '#fafafa',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
  },
  optionalTag: {
    fontSize: 12,
    fontWeight: '400',
    color: '#888',
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  dateCol: {
    flex: 3,
  },
  timeCol: {
    flex: 2,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeInputRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  timeInput: {
    flex: 1,
  },
  ampmBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#fafafa',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 46,
  },
  ampmText: {
    fontSize: 13,
    fontWeight: '700',
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
