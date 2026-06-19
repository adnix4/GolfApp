import { memo, useCallback, useEffect, useState } from 'react';
import {
  View, Text, Pressable, FlatList, TextInput,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, StatusPill, AsyncSection, PrimaryButton, FormModal } from '@gfp/ui';
import {
  FORMAT_OPTIONS, FORMAT_LABELS, FORMAT_HINTS,
  START_OPTIONS, START_LABELS, START_HINTS,
  HOLES_OPTIONS,
} from '@gfp/shared-types';
import { eventsApi, type EventSummary, type CreateEventPayload } from '@/lib/api';
import {
  formatDateInput, formatTimeInput,
  validateDateField, validateTimeField,
  buildIsoDateTime,
} from '@/lib/dateTime';
import { eventStatusColor } from '@/lib/eventStatus';
import { friendlyApiError } from '@/lib/errors';

// ── Row component (memoized) ──────────────────────────────────────────────────
// Hoisted so the FlatList renderItem closure doesn't recreate the row tree on
// every parent render. Memo with default referential equality skips the render
// when item + isOpeningReg + handler refs are unchanged — handler refs are
// stable thanks to useCallback in the parent, so a row only re-renders when
// its own EventSummary or its loading flag actually changes.

interface EventRowProps {
  item:               EventSummary;
  isOpeningReg:       boolean;
  onOpenEvent:        (eventId: string) => void;
  onOpenRegistration: (item: EventSummary) => void;
}

const EventRow = memo(function EventRow({
  item, isOpeningReg, onOpenEvent, onOpenRegistration,
}: EventRowProps) {
  const theme = useTheme();
  // The card container is a plain View — not a Pressable — so the Draft
  // "Open Registration" button below can be a sibling Pressable rather than a
  // nested one. On web, RN Pressable renders as <button>, and a <button> nested
  // inside another <button> is invalid DOM (hydration error). The card's main
  // tap target is its own Pressable wrapping just the header + meta.
  return (
    <View style={[styles.card, { backgroundColor: '#fff', borderColor: '#e8e8e8' }]}>
      <Pressable
        onPress={() => onOpenEvent(item.id)}
        accessibilityRole="button"
        accessibilityLabel={`Open event ${item.name}`}
      >
        <View style={styles.cardTop}>
          <Text style={[styles.cardName, { color: theme.colors.primary }]} numberOfLines={1}>
            {item.name}
          </Text>
          <StatusPill color={eventStatusColor(item.status)} label={item.status} />
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
      </Pressable>
      {item.status === 'Draft' && (
        <View style={styles.cardActions}>
          <Pressable
            style={[
              styles.openRegBtn,
              { backgroundColor: item.startAt ? theme.colors.primary : '#bdbdbd' },
              isOpeningReg && { opacity: 0.6 },
            ]}
            onPress={() => onOpenRegistration(item)}
            disabled={isOpeningReg}
            accessibilityRole="button"
            accessibilityLabel="Open registration for this event"
          >
            {isOpeningReg
              ? <ActivityIndicator color="#fff" size="small" />
              : (
                <Text style={styles.openRegBtnText}>
                  {item.startAt ? 'Open Registration' : 'Set Start Date to Open Registration'}
                </Text>
              )}
          </Pressable>
        </View>
      )}
    </View>
  );
});

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

  const handleOpenRegistration = useCallback(async (item: EventSummary) => {
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
  }, [router]);

  const handleOpenEvent = useCallback((eventId: string) => {
    router.push(`/(app)/events/${eventId}` as any);
  }, [router]);

  const renderRow = useCallback(({ item }: { item: EventSummary }) => (
    <EventRow
      item={item}
      isOpeningReg={openingReg === item.id}
      onOpenEvent={handleOpenEvent}
      onOpenRegistration={handleOpenRegistration}
    />
  ), [openingReg, handleOpenEvent, handleOpenRegistration]);

  return (
    <View style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.primary }]}>Events</Text>
        <PrimaryButton
          label="+ New Event"
          size="sm"
          onPress={() => setShowCreate(true)}
          accessibilityLabel="Create new event"
        />
      </View>

      <AsyncSection
        loading={loading}
        error={error}
        empty={events.length === 0 ? 'No events yet. Create your first event to get started.' : null}
        onRetry={load}
      >
        <FlatList
          data={events}
          keyExtractor={e => e.id}
          contentContainerStyle={styles.list}
          renderItem={renderRow}
        />
      </AsyncSection>

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
      const startAt = buildIsoDateTime(startDate, startTime, startAmPm);
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
    <FormModal
      visible={visible}
      title="New Event"
      onClose={handleClose}
      onSubmit={handleSubmit}
      submitLabel="Create Event"
      loading={loading}
    >
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

    </FormModal>
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
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.05)',
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
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.15)',
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
