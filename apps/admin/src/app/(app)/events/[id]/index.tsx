import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView, Modal, TextInput,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { eventsApi, type EventDetail, type UpdateEventPayload } from '@/lib/api';
import { useResponsive } from '@/lib/responsive';

const FORMAT_OPTIONS  = ['scramble', 'stroke', 'stableford', 'best_ball'] as const;
const START_OPTIONS   = ['shotgun', 'tee_times'] as const;
const HOLES_OPTIONS   = [9, 18] as const;
const FORMAT_LABELS: Record<string, string> = {
  scramble: 'Scramble', stroke: 'Stroke Play', stableford: 'Stableford', best_ball: 'Best Ball',
};
const START_LABELS: Record<string, string> = {
  shotgun: 'Shotgun Start', tee_times: 'Tee Times',
};

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

// ── Date/time helpers (same pattern as event create) ─────────────────────────

function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

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
  return new Date(y, m - 1, d, h, min).toISOString();
}

function parseStartAt(startAt: string | null): { date: string; time: string; ampm: 'AM' | 'PM' } {
  if (!startAt) return { date: '', time: '', ampm: 'AM' };
  const dt = new Date(startAt);
  const mo  = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  const yr  = dt.getFullYear();
  let h = dt.getHours();
  const min = String(dt.getMinutes()).padStart(2, '0');
  const ampm: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return {
    date: `${mo}/${day}/${yr}`,
    time: `${String(h).padStart(2, '0')}:${min}`,
    ampm,
  };
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function EventOverviewScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const { isMobile, pagePadding } = useResponsive();

  const [event,    setEvent]    = useState<EventDetail | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [showCourse, setShowCourse] = useState(false);
  const [showEdit,   setShowEdit]   = useState(false);

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
    setError(null);
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

  if (error && !event) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={load}>
          <Text style={{ color: theme.colors.action, marginTop: 8 }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!event) return null;

  const transitions = STATUS_TRANSITIONS[event.status] ?? [];

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.pageContent, { padding: pagePadding }]}>
      {/* Page-level error (status change failures) */}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

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
      <View style={[styles.statsRow, isMobile && styles.statsRowWrap]}>
        {[
          { label: 'Teams',        value: event.counts.teamsRegistered  },
          { label: 'Players',      value: event.counts.playersRegistered },
          { label: 'Checked In',   value: event.counts.teamsCheckedIn   },
          { label: 'Holes Scored', value: event.counts.holesScored      },
        ].map(stat => (
          <View key={stat.label} style={[
            styles.statCard,
            { borderColor: '#e8e8e8' },
            isMobile && styles.statCardMobile,
          ]}>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: theme.colors.accent }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Event details — editable */}
      <View style={[styles.section, { backgroundColor: '#fff', borderColor: '#e8e8e8' }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary, marginBottom: 0 }]}>Details</Text>
          <Pressable
            style={[styles.smallBtn, { backgroundColor: theme.colors.action }]}
            onPress={() => setShowEdit(true)}
          >
            <Text style={styles.smallBtnText}>Edit</Text>
          </Pressable>
        </View>
        <DetailRow label="Name"       value={event.name} />
        <DetailRow label="Format"     value={FORMAT_LABELS[event.format] ?? event.format} />
        <DetailRow label="Start Type" value={START_LABELS[event.startType] ?? event.startType} />
        <DetailRow label="Holes"      value={`${event.holes} holes`} />
        {event.startAt && (
          <DetailRow label="Start Date" value={new Date(event.startAt).toLocaleString([], {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })} />
        )}
      </View>

      {/* Course */}
      <View style={[styles.section, { backgroundColor: '#fff', borderColor: '#e8e8e8' }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary, marginBottom: 0 }]}>Course</Text>
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
            <DetailRow label="Name"  value={event.course.name} />
            <DetailRow label="City"  value={`${event.course.city}, ${event.course.state}`} />
            <DetailRow label="Holes" value={String(event.course.holes.length)} />
          </>
        ) : (
          <Text style={[styles.placeholder, { color: theme.colors.accent }]}>
            No course attached yet.
          </Text>
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

      <EditEventModal
        visible={showEdit}
        event={event}
        onClose={() => setShowEdit(false)}
        onSaved={updated => { setEvent(updated); setShowEdit(false); }}
      />

      <AttachCourseModal
        visible={showCourse}
        eventId={event.id}
        onClose={() => setShowCourse(false)}
        onAttached={updated => { setEvent(updated); setShowCourse(false); }}
      />
    </ScrollView>
  );
}

// ── Edit Event Modal ──────────────────────────────────────────────────────────

interface EditEventModalProps {
  visible:  boolean;
  event:    EventDetail;
  onClose:  () => void;
  onSaved:  (updated: EventDetail) => void;
}

function EditEventModal({ visible, event, onClose, onSaved }: EditEventModalProps) {
  const theme = useTheme();

  const parsed = parseStartAt(event.startAt);

  const [name,      setName]      = useState(event.name);
  const [format,    setFormat]    = useState(event.format);
  const [startType, setStartType] = useState(event.startType);
  const [holes,     setHoles]     = useState(event.holes);
  const [startDate, setStartDate] = useState(parsed.date);
  const [startTime, setStartTime] = useState(parsed.time);
  const [ampm,      setAmpm]      = useState<'AM' | 'PM'>(parsed.ampm);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; startDate?: string; startTime?: string }>({});

  // Re-seed when event prop changes
  useEffect(() => {
    if (!visible) return;
    const p = parseStartAt(event.startAt);
    setName(event.name);
    setFormat(event.format);
    setStartType(event.startType);
    setHoles(event.holes);
    setStartDate(p.date);
    setStartTime(p.time);
    setAmpm(p.ampm);
    setError(null);
    setFieldErrors({});
  }, [visible, event]);

  function validate(): boolean {
    const errs: typeof fieldErrors = {};
    if (!name.trim() || name.trim().length < 3) errs.name = 'Event name must be at least 3 characters.';
    else if (name.trim().length > 200) errs.name = 'Event name must be 200 characters or fewer.';
    const dateErr = validateDateField(startDate);
    if (dateErr) errs.startDate = dateErr;
    const timeErr = validateTimeField(startTime);
    if (timeErr) errs.startTime = timeErr;
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setError(null);
    setLoading(true);
    try {
      const payload: Partial<UpdateEventPayload> = {
        name:      name.trim(),
        format,
        startType,
        holes,
        ...(startDate ? { startAt: buildStartAt(startDate, startTime, ampm) } : {}),
      };
      const updated = await eventsApi.update(event.id, payload);
      onSaved(updated);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save event details.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.modalScroll}>
          <View style={styles.modal}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>Edit Event Details</Text>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Name */}
            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Event Name *</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: fieldErrors.name ? '#e74c3c' : theme.colors.accent },
              ]}
              value={name}
              onChangeText={v => { setName(v); if (fieldErrors.name) setFieldErrors(p => ({ ...p, name: undefined })); }}
              placeholder="Annual Charity Golf Classic"
              placeholderTextColor="#999"
              editable={!loading}
              maxLength={200}
            />
            {fieldErrors.name && <Text style={styles.fieldError}>{fieldErrors.name}</Text>}

            {/* Format */}
            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Format</Text>
            <View style={styles.pillRow}>
              {FORMAT_OPTIONS.map(f => (
                <Pressable
                  key={f}
                  style={[styles.pill, format === f && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
                  onPress={() => setFormat(f)}
                >
                  <Text style={[styles.pillText, format === f && { color: '#fff' }]}>
                    {FORMAT_LABELS[f]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Start Type */}
            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Start Type</Text>
            <View style={styles.pillRow}>
              {START_OPTIONS.map(s => (
                <Pressable
                  key={s}
                  style={[styles.pill, startType === s && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
                  onPress={() => setStartType(s)}
                >
                  <Text style={[styles.pillText, startType === s && { color: '#fff' }]}>
                    {START_LABELS[s]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Holes */}
            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Holes</Text>
            <View style={styles.pillRow}>
              {HOLES_OPTIONS.map(h => (
                <Pressable
                  key={h}
                  style={[styles.pill, holes === h && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
                  onPress={() => setHoles(h)}
                >
                  <Text style={[styles.pillText, holes === h && { color: '#fff' }]}>{h} holes</Text>
                </Pressable>
              ))}
            </View>

            {/* Start Date */}
            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Start Date (optional)</Text>
            <TextInput
              style={[
                styles.input,
                { borderColor: fieldErrors.startDate ? '#e74c3c' : theme.colors.accent },
              ]}
              value={startDate}
              onChangeText={v => {
                setStartDate(formatDateInput(v));
                if (fieldErrors.startDate) setFieldErrors(p => ({ ...p, startDate: undefined }));
              }}
              onBlur={() => {
                const err = validateDateField(startDate);
                if (err) setFieldErrors(p => ({ ...p, startDate: err }));
              }}
              placeholder="MM/DD/YYYY"
              placeholderTextColor="#999"
              keyboardType="numeric"
              editable={!loading}
            />
            {fieldErrors.startDate && <Text style={styles.fieldError}>{fieldErrors.startDate}</Text>}

            {/* Start Time + AM/PM */}
            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Start Time (optional)</Text>
            <View style={styles.timeRow}>
              <TextInput
                style={[
                  styles.input,
                  styles.timeInput,
                  { borderColor: fieldErrors.startTime ? '#e74c3c' : theme.colors.accent },
                ]}
                value={startTime}
                onChangeText={v => {
                  setStartTime(formatTimeInput(v));
                  if (fieldErrors.startTime) setFieldErrors(p => ({ ...p, startTime: undefined }));
                }}
                onBlur={() => {
                  const err = validateTimeField(startTime);
                  if (err) setFieldErrors(p => ({ ...p, startTime: err }));
                }}
                placeholder="HH:MM"
                placeholderTextColor="#999"
                keyboardType="numeric"
                editable={!loading}
              />
              <Pressable
                style={[styles.ampmBtn, { borderColor: theme.colors.primary }]}
                onPress={() => setAmpm(a => a === 'AM' ? 'PM' : 'AM')}
              >
                <Text style={[styles.ampmText, { color: theme.colors.primary }]}>{ampm}</Text>
              </Pressable>
            </View>
            {fieldErrors.startTime && <Text style={styles.fieldError}>{fieldErrors.startTime}</Text>}

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.cancelBtn, { borderColor: theme.colors.accent }]}
                onPress={onClose}
              >
                <Text style={[styles.cancelText, { color: theme.colors.accent }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.submitBtn, { backgroundColor: theme.colors.primary }, loading && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitText}>Save Changes</Text>}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Attach Course Modal ───────────────────────────────────────────────────────

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
    if (!name.trim())  { setError('Course name is required.'); return; }
    if (!city.trim())  { setError('City is required.'); return; }
    if (!state.trim()) { setError('State is required.'); return; }
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
      setError(e.message ?? 'Failed to attach course. Check the details and try again.');
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
            { label: 'Course Name *', value: name,    setter: setName,    placeholder: 'Pebble Beach Golf Links' },
            { label: 'Address',       value: address, setter: setAddress, placeholder: '17 Mile Dr' },
            { label: 'City *',        value: city,    setter: setCity,    placeholder: 'Pebble Beach' },
            { label: 'State *',       value: state,   setter: setState,   placeholder: 'CA' },
            { label: 'Zip',           value: zip,     setter: setZip,     placeholder: '93953' },
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

// ── Sub-components ────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: theme.colors.accent }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: theme.colors.primary }]}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page:        { flex: 1 },
  pageContent: { gap: 16 },
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
  statsRow:     { flexDirection: 'row', gap: 12 },
  statsRowWrap: { flexWrap: 'wrap' },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  statCardMobile: { flex: 0, width: '47%' },
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
  errorBox: {
    backgroundColor: '#fdf2f2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#e74c3c',
  },
  errorText:  { color: '#c0392b', fontSize: 14 },
  fieldError: { color: '#e74c3c', fontSize: 12, marginTop: 4, marginBottom: 4 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 480,
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
  pillRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#ddd',
    backgroundColor: '#fafafa',
  },
  pillText:     { fontSize: 13, fontWeight: '600', color: '#555' },
  timeRow:      { flexDirection: 'row', gap: 10, alignItems: 'center' },
  timeInput:    { flex: 1 },
  ampmBtn:      { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5 },
  ampmText:     { fontSize: 15, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn:    { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  cancelText:   { fontSize: 15, fontWeight: '600' },
  submitBtn:    { flex: 2, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  submitText:   { fontSize: 15, fontWeight: '700', color: '#fff' },
});
