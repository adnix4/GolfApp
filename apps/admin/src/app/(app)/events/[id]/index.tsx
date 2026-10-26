import { useState, useEffect } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView, Modal, TextInput,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useEventDetail } from '@/lib/eventContext';
import { eventKeys } from '@/lib/queries';
import { useTheme, StatusPill, MoneyInput } from '@gfp/ui';
import {
  FORMAT_OPTIONS, FORMAT_LABELS,
  START_OPTIONS, START_LABELS,
  HOLES_OPTIONS, centsToMoneyValue,
  formatDateTime,
} from '@gfp/shared-types';
import { eventsApi, testDataApi, teamsApi, auctionApi, type Course, type EventDetail } from '@/lib/api';
import { isAuctionStatusFinal } from '@/lib/auctionEnd';
import { useResponsive } from '@/lib/responsive';
import { TestDataWarningModal } from '@/components/TestDataWarningModal';
import { confirmAction } from '@/lib/confirmAction';
import { isCheckedIn } from '@/lib/checkIn';
import {
  isoToPickerValues, pickerValuesToIso, toPickerDate, validatePickerDateTime,
} from '@/lib/dateTime';
import { DateTimePairField } from '@/components/DateTimePairField';
import {
  eventStatusColor, eventStatusLabel, NEXT_TRANSITIONS,
  scoringGate, scoringGateHint, openScoringEarlyCopy,
  completionGate, markCompleteCopy, markCompleteUncheckedCopy, cancelEventCopy,
} from '@/lib/eventStatus';
import { fontSize, radius, spacing } from '@gfp/theme';

// ── Entry fee helpers ─────────────────────────────────────────────────────────
// The per-golfer fee lives in the event config JSONB (entryFeeCents). Organizers
// type dollars; the API stores cents. 0 / unset both mean "free" — the public
// page and email ad hide the fee in that case.

function readEntryFeeCents(config: Record<string, unknown>): number | null {
  const v = config['entryFeeCents'];
  return typeof v === 'number' && v > 0 ? v : null;
}


function entryFeeLabel(cents: number | null): string {
  if (cents == null) return 'Free — no fee set';
  const d = cents / 100;
  return `$${Number.isInteger(d) ? d : d.toFixed(2)} per golfer`;
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function EventOverviewScreen() {
  const theme    = useTheme();
  const { isMobile, pagePadding } = useResponsive();

  // The layout loads the event; changes go back through setEvent/refresh so
  // the layout's theme, tab label and test-mode bar update with them.
  const { event, setEvent, refresh } = useEventDetail();
  const [error,    setError]    = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [showCourse, setShowCourse] = useState(false);
  const [showEdit,   setShowEdit]   = useState(false);
  const [seeding,    setSeeding]    = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [showTestWarning, setShowTestWarning] = useState(false);
  const [checkingTeams, setCheckingTeams] = useState(false);
  const [checkingScores, setCheckingScores] = useState(false);

  // Every change made here reaches the other tabs' cached lists: a status
  // change can stamp starting holes (U5) or clear test data, seeding adds
  // teams and players, and the format, holes or course change what the
  // leaderboard computes. Mark them stale so the next visit refetches.
  const queryClient = useQueryClient();
  const markListsStale = () => queryClient.invalidateQueries({ queryKey: eventKeys.all(event.id) });

  async function handleStatusChange(newStatus: string) {

    // If moving to Registration and test data exists → warn first
    if (newStatus === 'Registration' && (event.testDataSummary?.totalCount ?? 0) > 0) {
      setPendingStatus(newStatus);
      setShowTestWarning(true);
      return;
    }

    // If moving to Active and test data still present → hard block with warning
    if (newStatus === 'Active' && (event.testDataSummary?.totalCount ?? 0) > 0) {
      setPendingStatus(newStatus);
      setShowTestWarning(true);
      return;
    }

    // Both terminal statuses get a confirm — there is no way back from either.
    if (newStatus === 'Completed') {
      await handleMarkComplete();
      return;
    }

    if (newStatus === 'Cancelled') {
      const copy = cancelEventCopy();
      confirmAction(copy.title, copy.message, () => { doStatusChange('Cancelled'); }, copy.confirmText, { kind: 'warning', destructive: true });
      return;
    }

    await doStatusChange(newStatus);
  }

  async function doStatusChange(newStatus: string) {
    setUpdating(true); setError(null);
    try { setEvent(await eventsApi.update(event.id, { status: newStatus })); markListsStale(); }
    catch (e: any) { setError(e.message ?? 'Failed to update status.'); }
    finally { setUpdating(false); }
  }

  // Completing closes scoring server-side and can't be undone, so warn first if
  // anyone is still on the course. Neither per-team progress nor the auction is
  // on this screen (only event-wide counts), so fetch both lazily here — and
  // only when the organizer actually reaches for the button.
  async function handleMarkComplete() {
    if (checkingScores) return;
    setCheckingScores(true); setError(null);
    let copy;
    try {
      // The auction is a footnote to this decision, not a gate on it, so a
      // failed lot count degrades to 0 (no mention) instead of taking the whole
      // dialog down with it.
      const [board, openLots] = await Promise.all([
        eventsApi.getLeaderboard(event.id),
        auctionApi.getItems(event.id)
          .then(items => items.filter(i => !isAuctionStatusFinal(i.status)).length)
          .catch(() => 0),
      ]);
      copy = markCompleteCopy(completionGate(board), openLots);
    } catch {
      // A failed lookup must not strand the organizer at the banquet — offer
      // the confirm anyway, saying plainly that progress is unknown.
      copy = markCompleteUncheckedCopy();
    } finally {
      setCheckingScores(false);
    }
    confirmAction(copy.title, copy.message, () => { doStatusChange('Completed'); }, copy.confirmText, { kind: 'warning' });
  }

  // Override for the Open Scoring gate. The team list isn't loaded on this
  // screen (only counts), so fetch it lazily here — one request, and only when
  // the organizer actually reaches for the override.
  async function handleOpenScoringAnyway() {
    if (checkingTeams) return;
    setCheckingTeams(true); setError(null);
    try {
      const teams   = await teamsApi.list(event.id);
      const pending = teams
        .filter(t => !isCheckedIn(t.checkInStatus))
        .map(t => t.name);
      const copy = openScoringEarlyCopy(pending);
      confirmAction(copy.title, copy.message, () => { doStatusChange('Scoring'); }, copy.confirmText, { kind: 'warning' });
    } catch (e: any) {
      setError(e.message ?? 'Could not load teams.');
    } finally {
      setCheckingTeams(false);
    }
  }

  async function handleSeedTestData() {
    setSeeding(true); setError(null);
    try {
      await testDataApi.seed(event.id);
      markListsStale();
      await refresh();
    } catch (e: any) { setError(e.message ?? 'Failed to seed test data.'); }
    finally { setSeeding(false); }
  }

  async function handleConfirmTestWarning() {
    if (!pendingStatus) return;
    setShowTestWarning(false);
    await doStatusChange(pendingStatus);
    setPendingStatus(null);
  }

  const isDraft = event.status === 'Draft';

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.pageContent, { padding: pagePadding }]}>
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eventName, { color: theme.colors.primary }]}>{event.name}</Text>
          <Text style={[styles.eventCode, { color: theme.mutedText }]}>Code: {event.eventCode}</Text>
        </View>
        <StatusPill color={eventStatusColor(event.status)} label={eventStatusLabel(event.status)} />
      </View>

      {/* Draft setup checklist — shown instead of the plain "Advance Status" section */}
      {isDraft && (
        <DraftSetupSection
          event={event}
          updating={updating}
          seeding={seeding}
          onOpenEdit={() => setShowEdit(true)}
          onOpenCourse={() => setShowCourse(true)}
          onAdvance={handleStatusChange}
          onSeedTestData={handleSeedTestData}
        />
      )}

      {/* Quick stats */}
      <View style={[styles.statsRow, isMobile && styles.statsRowWrap]}>
        {[
          { label: 'Teams',        value: event.counts.teamsRegistered   },
          { label: 'Players',      value: event.counts.playersRegistered  },
          { label: 'Checked In',   value: event.counts.teamsCheckedIn    },
          { label: 'Holes Scored', value: event.counts.holesScored       },
        ].map(stat => (
          <View key={stat.label} style={[styles.statCard, isMobile && styles.statCardMobile]}>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: theme.mutedText }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Details */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Details</Text>
          <Pressable style={[styles.smallBtn, { backgroundColor: theme.colors.action }]} onPress={() => setShowEdit(true)}>
            <Text style={[styles.smallBtnText, { color: theme.ctaLabel }]}>Edit</Text>
          </Pressable>
        </View>
        <DetailRow label="Name"       value={event.name} />
        <DetailRow label="Format"     value={FORMAT_LABELS[event.format] ?? event.format} />
        <DetailRow label="Start Type" value={START_LABELS[event.startType] ?? event.startType} />
        <DetailRow label="Holes"      value={`${event.holes} holes`} />
        <DetailRow label="Entry Fee"  value={entryFeeLabel(readEntryFeeCents(event.config))} />
        {event.startAt && (
          <DetailRow label="Start Date" value={formatDateTime(event.startAt)} />
        )}
      </View>

      {/* Course */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Course</Text>
          <Pressable style={[styles.smallBtn, { backgroundColor: theme.colors.action }]} onPress={() => setShowCourse(true)}>
            <Text style={[styles.smallBtnText, { color: theme.ctaLabel }]}>
              {event.course ? 'Edit' : 'Attach Course'}
            </Text>
          </Pressable>
        </View>
        {event.course ? (
          <>
            <DetailRow label="Name"  value={event.course.name} />
            {!!event.course.address && <DetailRow label="Address" value={event.course.address} />}
            <DetailRow
              label="City"
              value={`${event.course.city}, ${event.course.state}${event.course.zip ? ` ${event.course.zip}` : ''}`}
            />
            <DetailRow label="Holes" value={String(event.course.holes.length)} />
          </>
        ) : (
          <Text style={[styles.placeholder, { color: theme.mutedText }]}>No course attached yet.</Text>
        )}
      </View>

      {/* Advance status for non-draft events */}
      {!isDraft && (() => {
        const nexts = NEXT_TRANSITIONS[event.status] ?? [];
        if (nexts.length === 0 && !['Active', 'Scoring', 'Registration'].includes(event.status)) return null;

        // Only meaningful on the Active → Scoring step.
        const gate    = scoringGate(event.counts);
        const blocked = event.status === 'Active' && !gate.ready;

        return (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Event Status</Text>
            <StatusDescription status={event.status} event={event} />

            {blocked && (
              <View style={[styles.blockingNote, { backgroundColor: '#fff8e1', borderColor: '#f39c12' }]}>
                <Text style={[styles.blockingNoteText, { color: '#856404' }]}>
                  {scoringGateHint(gate)}
                </Text>
              </View>
            )}

            {nexts.length > 0 && (
              <View style={[styles.transitionRow, { marginTop: spacing[4] }]}>
                {nexts.map(t => {
                  const gated = blocked && t.status === 'Scoring';
                  return (
                    <Pressable
                      key={t.status}
                      style={[
                        styles.advanceBtn,
                        { backgroundColor: gated ? '#bdbdbd' : theme.colors.primary },
                        (updating || checkingScores) && { opacity: 0.6 },
                      ]}
                      onPress={() => !gated && handleStatusChange(t.status)}
                      disabled={updating || gated || checkingScores}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: gated }}
                    >
                      {updating || checkingScores
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.advanceBtnText}>{t.label}</Text>}
                    </Pressable>
                  );
                })}
                <Pressable
                  style={[styles.cancelBtn, (updating || checkingScores) && { opacity: 0.6 }]}
                  onPress={() => handleStatusChange('Cancelled')}
                  disabled={updating || checkingScores}
                >
                  <Text style={styles.cancelBtnText}>Cancel Event</Text>
                </Pressable>
              </View>
            )}

            {/* Escape hatch — a no-show team must never strand the round. */}
            {blocked && (
              <Pressable
                style={styles.overrideLink}
                onPress={handleOpenScoringAnyway}
                disabled={checkingTeams || updating}
                accessibilityRole="button"
              >
                {checkingTeams
                  ? <ActivityIndicator size="small" color={theme.mutedText} />
                  : (
                    <Text style={[styles.overrideLinkText, { color: theme.mutedText }]}>
                      Open Scoring anyway →
                    </Text>
                  )}
              </Pressable>
            )}
          </View>
        );
      })()}

      <EditEventModal
        visible={showEdit}
        event={event}
        onClose={() => setShowEdit(false)}
        onSaved={updated => { setEvent(updated); markListsStale(); setShowEdit(false); }}
      />
      <AttachCourseModal
        visible={showCourse}
        eventId={event.id}
        course={event.course}
        onClose={() => setShowCourse(false)}
        onAttached={updated => { setEvent(updated); markListsStale(); setShowCourse(false); }}
      />
      <TestDataWarningModal
        visible={showTestWarning}
        title={
          pendingStatus === 'Registration'
            ? 'Clear Test Data Before Opening Registration?'
            : 'Test Data Detected — Cannot Go Active'
        }
        description={
          pendingStatus === 'Registration'
            ? `This event has ${event.testDataSummary?.totalCount ?? 0} test record(s). Proceeding to Registration will automatically remove all test registration and scoring data. Real registrations can then begin.`
            : `This event still has ${event.testDataSummary?.totalCount ?? 0} test record(s). Please clear all test data from the Fundraising tab before activating the event.`
        }
        confirmLabel={pendingStatus === 'Registration' ? 'Clear & Open Registration' : 'OK'}
        loading={updating}
        onConfirm={pendingStatus === 'Registration' ? handleConfirmTestWarning : () => setShowTestWarning(false)}
        onCancel={() => { setShowTestWarning(false); setPendingStatus(null); }}
      />
    </ScrollView>
  );
}

// ── Draft setup checklist ─────────────────────────────────────────────────────

interface DraftSetupProps {
  event:          EventDetail;
  updating:       boolean;
  seeding:        boolean;
  onOpenEdit:     () => void;
  onOpenCourse:   () => void;
  onAdvance:      (status: string) => void;
  onSeedTestData: () => void;
}

function DraftSetupSection({ event, updating, seeding, onOpenEdit, onOpenCourse, onAdvance, onSeedTestData }: DraftSetupProps) {
  const theme = useTheme();
  const hasDate   = !!event.startAt;
  const hasCourse = !!event.course;
  const canOpen   = hasDate; // API requires StartAt before Registration

  return (
    <View style={[styles.section, styles.setupSection]}>
      <Text style={[styles.setupTitle, { color: theme.colors.primary }]}>Event Setup</Text>
      <Text style={[styles.setupSubtitle, { color: theme.mutedText }]}>
        Complete the required steps below, then open registration so golfers can find and join your tournament.
      </Text>

      <View style={styles.checklistContainer}>
        {/* Start date */}
        <ChecklistItem
          done={hasDate}
          required
          label="Start date & time"
          doneDetail={formatDateTime(event.startAt, { weekday: 'short', year: undefined }) || undefined}
          missingDetail="Required before golfers can register."
          action={!hasDate ? { label: 'Set Date', onPress: onOpenEdit } : undefined}
        />

        {/* Course */}
        <ChecklistItem
          done={hasCourse}
          required={false}
          label="Course attached"
          doneDetail={event.course ? `${event.course.name} · ${event.course.city}, ${event.course.state}` : undefined}
          missingDetail="Required before going Active on the day of the event."
          action={!hasCourse ? { label: 'Add Course', onPress: onOpenCourse } : undefined}
        />

        {/* Teams info — always OK */}
        <ChecklistItem
          done
          required={false}
          label="Add teams & players"
          doneDetail="Admins can add teams any time. Golfers can register once registration is open."
        />
      </View>

      <View style={styles.setupDivider} />

      {/* Test data seeding — only visible in Draft */}
      <View style={[styles.testDataSection, { backgroundColor: '#fff8e1', borderColor: '#f39c12' }]}>
        <Text style={[styles.testDataTitle, { color: '#856404' }]}>Testing Mode</Text>
        <Text style={[styles.testDataDesc, { color: '#856404' }]}>
          Populate realistic test teams, scores, and donations to preview the event flow.
          {event.testDataSummary?.totalCount > 0
            ? ` ${event.testDataSummary.totalCount} test records active.`
            : ' No test data yet.'}
        </Text>
        <Pressable
          style={[styles.seedBtn, seeding && { opacity: 0.6 }]}
          onPress={onSeedTestData}
          disabled={seeding || updating}
        >
          {seeding
            ? <ActivityIndicator color="#856404" size="small" />
            : <Text style={styles.seedBtnText}>Seed Test Data</Text>}
        </Pressable>
      </View>

      {!canOpen && (
        <View style={[styles.blockingNote, { backgroundColor: '#fff8e1', borderColor: '#f39c12' }]}>
          <Text style={[styles.blockingNoteText, { color: '#856404' }]}>
            Set a start date & time before opening registration.
          </Text>
        </View>
      )}

      <Pressable
        style={[
          styles.openRegBtn,
          { backgroundColor: canOpen ? theme.colors.primary : '#bdbdbd' },
          updating && { opacity: 0.6 },
        ]}
        onPress={() => canOpen && onAdvance('Registration')}
        disabled={!canOpen || updating}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canOpen }}
      >
        {updating
          ? <ActivityIndicator color="#fff" />
          : (
            <>
              <Text style={styles.openRegBtnText}>Open Registration</Text>
              <Text style={styles.openRegBtnSub}>
                {canOpen
                  ? 'Golfers will see this tournament in the mobile app'
                  : 'Complete required steps above first'}
              </Text>
            </>
          )}
      </Pressable>

      <Pressable
        style={[styles.dangerLink, updating && { opacity: 0.4 }]}
        onPress={() => onAdvance('Cancelled')}
        disabled={updating}
      >
        <Text style={styles.dangerLinkText}>Cancel this event</Text>
      </Pressable>
    </View>
  );
}

// ── Checklist item ────────────────────────────────────────────────────────────

interface ChecklistItemProps {
  done:          boolean;
  required:      boolean;
  label:         string;
  doneDetail?:   string;
  missingDetail?: string;
  action?:       { label: string; onPress: () => void };
}

function ChecklistItem({ done, required, label, doneDetail, missingDetail, action }: ChecklistItemProps) {
  const theme = useTheme();
  return (
    <View style={styles.checklistItem}>
      <View style={[styles.checkDot, { backgroundColor: done ? '#2ecc71' : required ? '#e74c3c' : '#f39c12' }]}>
        <Text style={styles.checkDotText}>{done ? '✓' : required ? '✕' : '!'}</Text>
      </View>
      <View style={styles.checkContent}>
        <View style={styles.checkLabelRow}>
          <Text style={[styles.checkLabel, { color: theme.colors.primary }]}>{label}</Text>
          {required && !done && (
            <View style={styles.requiredPill}>
              <Text style={styles.requiredPillText}>Required</Text>
            </View>
          )}
        </View>
        <Text style={[styles.checkDetail, { color: theme.mutedText }]}>
          {done ? doneDetail : missingDetail}
        </Text>
      </View>
      {action && (
        <Pressable
          style={[styles.checkAction, { borderColor: theme.colors.action }]}
          onPress={action.onPress}
        >
          <Text style={[styles.checkActionText, { color: theme.colors.action }]}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Status description for non-draft states ───────────────────────────────────

function StatusDescription({ status, event }: { status: string; event: EventDetail }) {
  const theme = useTheme();
  const descriptions: Record<string, string> = {
    Registration: `Registration is open. Golfers can find and join this tournament in the mobile app. ${event.counts.teamsRegistered} team(s) registered so far.`,
    Active:       `Day of event — check-in is open. ${event.counts.teamsCheckedIn} of ${event.counts.teamsRegistered} teams checked in. Move to Scoring when play begins.`,
    Scoring:      'Round is in progress. Score entry is open on the mobile app. Late arrivals can still be checked in.',
    Completed:    'This event is complete. Final results are published.',
    Cancelled:    'This event has been cancelled.',
  };
  const text = descriptions[status];
  if (!text) return null;
  return <Text style={[styles.statusDesc, { color: theme.mutedText }]}>{text}</Text>;
}

// ── Edit Event Modal ──────────────────────────────────────────────────────────

interface EditEventModalProps {
  visible: boolean; event: EventDetail; onClose: () => void; onSaved: (u: EventDetail) => void;
}

function EditEventModal({ visible, event, onClose, onSaved }: EditEventModalProps) {
  const theme = useTheme();
  // The event's saved start, as picker values. Only a changed start is sent
  // (and checked against "must be in the future", which the API enforces), so
  // organizers can still edit other details of an event that already happened.
  const parsed = isoToPickerValues(event.startAt);

  const [name,      setName]      = useState(event.name);
  const [format,    setFormat]    = useState(event.format);
  // Scores are counted under the format they were entered in (U8); the API
  // rejects a switch once any exist, so don't offer one.
  const formatLocked = event.counts.holesScored > 0;
  const [startType, setStartType] = useState(event.startType);
  const [holes,     setHoles]     = useState(event.holes);
  const [startDate, setStartDate] = useState(parsed.date);
  const [startTime, setStartTime] = useState(parsed.time);
  const [entryFee,  setEntryFee]  = useState(centsToMoneyValue(readEntryFeeCents(event.config)));
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; startDate?: string; startTime?: string; entryFee?: string }>({});

  useEffect(() => {
    if (!visible) return;
    const p = isoToPickerValues(event.startAt);
    setName(event.name); setFormat(event.format); setStartType(event.startType); setHoles(event.holes);
    setStartDate(p.date); setStartTime(p.time);
    setEntryFee(centsToMoneyValue(readEntryFeeCents(event.config)));
    setError(null); setFieldErrors({});
  }, [visible, event]);

  // "$150" / "150.50" → cents; blank means free (0). null = invalid input.
  function parseEntryFeeCents(): number | null {
    const raw = entryFee.replace(/[$,\s]/g, '');
    if (raw === '') return 0;
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
    return Math.round(parseFloat(raw) * 100);
  }

  const startChanged = startDate !== parsed.date || startTime !== parsed.time;

  // Errors for the start pair, only the keys that failed. The API ignores a
  // null startAt on update, so a saved start can be changed but not removed.
  function startErrors(date: string, time: string): Pick<typeof fieldErrors, 'startDate' | 'startTime'> {
    if (parsed.date && !date) return { startDate: 'A start date can’t be removed once set; pick a new one instead.' };
    const changed = date !== parsed.date || time !== parsed.time;
    const e = validatePickerDateTime(date, time, { label: 'Start', future: changed });
    return { ...(e.date ? { startDate: e.date } : {}), ...(e.time ? { startTime: e.time } : {}) };
  }

  function validate(): boolean {
    const errs: typeof fieldErrors = {};
    if (!name.trim() || name.trim().length < 3) errs.name = 'Event name must be at least 3 characters.';
    else if (name.trim().length > 200) errs.name = 'Event name must be 200 characters or fewer.';
    Object.assign(errs, startErrors(startDate, startTime));
    if (parseEntryFeeCents() == null) errs.entryFee = 'Enter a dollar amount like 150 or 150.50 (leave blank for free).';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setError(null); setLoading(true);
    try {
      const updated = await eventsApi.update(event.id, {
        name: name.trim(), format, startType, holes,
        ...(startChanged && startDate ? { startAt: pickerValuesToIso(startDate, startTime) } : {}),
        config: { entryFeeCents: parseEntryFeeCents() ?? 0 },
      });
      onSaved(updated);
    } catch (e: any) { setError(e.message ?? 'Failed to save event details.'); }
    finally { setLoading(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.modalScroll}>
          <View style={styles.modal}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>Edit Event Details</Text>

            {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Event Name *</Text>
            <TextInput
              style={[styles.input, { borderColor: fieldErrors.name ? '#e74c3c' : theme.colors.accent }]}
              value={name}
              onChangeText={v => { setName(v); if (fieldErrors.name) setFieldErrors(p => ({ ...p, name: undefined })); }}
              placeholder="Annual Charity Golf Classic"
              placeholderTextColor="#999"
              editable={!loading}
              maxLength={200}
            />
            {fieldErrors.name && <Text style={styles.fieldError}>{fieldErrors.name}</Text>}

            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Format</Text>
            <View style={styles.pillRow}>
              {FORMAT_OPTIONS.map(f => (
                <Pressable
                  key={f}
                  style={[styles.pill, format === f && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }, formatLocked && format !== f && { opacity: 0.4 }]}
                  onPress={() => setFormat(f)}
                  disabled={formatLocked}
                  accessibilityState={{ disabled: formatLocked, selected: format === f }}
                >
                  <Text style={[styles.pillText, format === f && { color: '#fff' }]}>{FORMAT_LABELS[f]}</Text>
                </Pressable>
              ))}
            </View>
            {formatLocked && (
              <Text style={[styles.fieldHint, { color: theme.mutedText }]}>
                Scores have been entered, and they were counted under this format — it can't be changed now.
              </Text>
            )}

            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Start Type</Text>
            <View style={styles.pillRow}>
              {START_OPTIONS.map(s => (
                <Pressable key={s} style={[styles.pill, startType === s && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]} onPress={() => setStartType(s)}>
                  <Text style={[styles.pillText, startType === s && { color: '#fff' }]}>{START_LABELS[s]}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Holes</Text>
            <View style={styles.pillRow}>
              {HOLES_OPTIONS.map(h => (
                <Pressable key={h} style={[styles.pill, holes === h && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]} onPress={() => setHoles(h)}>
                  <Text style={[styles.pillText, holes === h && { color: '#fff' }]}>{h} holes</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Entry Fee per Golfer ($)</Text>
            <MoneyInput
              style={[styles.input, { borderColor: fieldErrors.entryFee ? '#e74c3c' : theme.colors.accent }]}
              value={entryFee}
              onChangeText={v => { setEntryFee(v); if (fieldErrors.entryFee) setFieldErrors(p => ({ ...p, entryFee: undefined })); }}
              placeholder="Leave blank for a free event"
              placeholderTextColor="#999"
              editable={!loading}
            />
            {fieldErrors.entryFee
              ? <Text style={styles.fieldError}>{fieldErrors.entryFee}</Text>
              : <Text style={[styles.fieldHint, { color: theme.mutedText }]}>Shown on the public event page and email ads; each golfer pays at registration.</Text>}

            <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>Start Date & Time</Text>
            <DateTimePairField
              label="Start"
              date={startDate}
              time={startTime}
              onChange={({ date, time }) => {
                setStartDate(date); setStartTime(time);
                const e = startErrors(date, time);
                setFieldErrors(p => ({ ...p, startDate: e.startDate, startTime: e.startTime }));
              }}
              errors={{ date: fieldErrors.startDate, time: fieldErrors.startTime }}
              min={!parsed.date || parsed.date >= toPickerDate(new Date()) ? toPickerDate(new Date()) : undefined}
              disabled={loading}
              clearable={!parsed.date}
            />

            <View style={styles.modalActions}>
              <Pressable style={[styles.modalCancelBtn, { borderColor: theme.colors.accent }]} onPress={onClose}>
                <Text style={[styles.modalCancelText, { color: theme.mutedText }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalSubmitBtn, { backgroundColor: theme.colors.primary }, loading && { opacity: 0.6 }]} onPress={handleSave} disabled={loading}>
                {loading ? <ActivityIndicator color={theme.buttonLabel} /> : <Text style={[styles.modalSubmitText, { color: theme.buttonLabel }]}>Save Changes</Text>}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Attach / Edit Course Modal ────────────────────────────────────────────────
// With a `course` prop the modal edits the existing course IN PLACE via
// PATCH /course (holes preserved); without it, POST /course attaches a new one.

interface AttachCourseModalProps {
  visible: boolean; eventId: string; course: Course | null;
  onClose: () => void; onAttached: (e: EventDetail) => void;
}

function AttachCourseModal({ visible, eventId, course, onClose, onAttached }: AttachCourseModalProps) {
  const theme = useTheme();
  const isEdit = !!course;
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from the attached course each time the modal opens (edit mode).
  useEffect(() => {
    if (!visible) return;
    setName(course?.name ?? ''); setAddress(course?.address ?? '');
    setCity(course?.city ?? ''); setState(course?.state ?? ''); setZip(course?.zip ?? '');
    setError(null);
  }, [visible, course]);

  function reset() { setName(''); setAddress(''); setCity(''); setState(''); setZip(''); setError(null); }

  async function handleSubmit() {
    if (!name.trim())    { setError('Course name is required.'); return; }
    if (!address.trim()) { setError('Address is required.'); return; }
    if (!city.trim())    { setError('City is required.'); return; }
    if (!state.trim())   { setError('State is required.'); return; }
    setLoading(true); setError(null);
    const payload = {
      name: name.trim(), address: address.trim(), city: city.trim(), state: state.trim(), zip: zip.trim(),
    };
    try {
      const updated = isEdit
        ? await eventsApi.updateCourse(eventId, payload)
        : await eventsApi.attachCourse(eventId, payload);
      reset(); onAttached(updated);
    } catch (e: any) { setError(e.message ?? (isEdit ? 'Failed to update course.' : 'Failed to attach course.')); }
    finally { setLoading(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { reset(); onClose(); }}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>
            {isEdit ? 'Edit Course' : 'Attach Course'}
          </Text>
          {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}
          {([
            { label: 'Course Name *', value: name,    setter: setName,    placeholder: 'Pebble Beach Golf Links' },
            { label: 'Address *',     value: address, setter: setAddress, placeholder: '17 Mile Dr' },
            { label: 'City *',        value: city,    setter: setCity,    placeholder: 'Pebble Beach' },
            { label: 'State *',       value: state,   setter: setState,   placeholder: 'CA' },
            { label: 'Zip',           value: zip,     setter: setZip,     placeholder: '93953' },
          ] as const).map(f => (
            <View key={f.label}>
              <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>{f.label}</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.colors.accent }]}
                value={f.value} onChangeText={f.setter as any}
                placeholder={f.placeholder} placeholderTextColor="#999" editable={!loading}
              />
            </View>
          ))}
          <View style={styles.modalActions}>
            <Pressable style={[styles.modalCancelBtn, { borderColor: theme.colors.accent }]} onPress={() => { reset(); onClose(); }}>
              <Text style={[styles.modalCancelText, { color: theme.mutedText }]}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.modalSubmitBtn, { backgroundColor: theme.colors.primary }, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color={theme.buttonLabel} /> : <Text style={[styles.modalSubmitText, { color: theme.buttonLabel }]}>{isEdit ? 'Save Changes' : 'Attach'}</Text>}
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
      <Text style={[styles.detailLabel, { color: theme.mutedText }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: theme.colors.primary }]}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page:        { flex: 1 },
  pageContent: { gap: spacing[4] },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center' },

  pageHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], marginBottom: spacing[1] },
  eventName:  { fontSize: fontSize.title, fontWeight: '800' },
  eventCode:  { fontSize: fontSize.sm, marginTop: spacing[0.5] },

  section: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8e8e8', borderRadius: radius.lg, padding: spacing[4] },

  // ── Setup section ────────────────────────────────────────────────────────────
  setupSection:    { borderColor: '#d0e8ff', backgroundColor: '#f0f7ff' },
  setupTitle:      { fontSize: fontSize.xl, fontWeight: '800', marginBottom: spacing[1] },
  setupSubtitle:   { fontSize: fontSize.sm, lineHeight: 18, marginBottom: spacing[4] },
  checklistContainer: { gap: spacing[4] },
  checklistItem:   { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  checkDot: { width: 24, height: 24, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  checkDotText:    { fontSize: fontSize.xs, fontWeight: '800', color: '#fff' },
  checkContent:    { flex: 1 },
  checkLabelRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' },
  checkLabel:      { fontSize: fontSize.md, fontWeight: '600' },
  checkDetail:     { fontSize: fontSize.xs, marginTop: spacing[0.5], lineHeight: 16 },
  checkAction: {
    borderWidth: 1.5, borderRadius: radius.sm, paddingHorizontal: spacing[3], paddingVertical: spacing[1], flexShrink: 0,
  },
  checkActionText: { fontSize: fontSize.xs, fontWeight: '700' },
  requiredPill:    { backgroundColor: '#fde8e8', borderRadius: radius.xs, paddingHorizontal: spacing[2], paddingVertical: spacing[0.5] },
  requiredPillText: { fontSize: fontSize.xxs, fontWeight: '700', color: '#c0392b' },
  setupDivider:    { height: 1, backgroundColor: '#c8dff5', marginVertical: spacing[4] },
  blockingNote: {
    borderWidth: 1, borderRadius: radius.md, padding: spacing[3], marginBottom: spacing[3],
  },
  blockingNoteText: { fontSize: fontSize.sm, fontWeight: '500' },
  openRegBtn: {
    borderRadius: radius.lg, paddingVertical: spacing[4], paddingHorizontal: spacing[5], alignItems: 'center',
  },
  openRegBtnText:  { fontSize: fontSize.xl, fontWeight: '800', color: '#fff' },
  openRegBtnSub:   { fontSize: fontSize.xxs, color: 'rgba(255,255,255,0.8)', marginTop: spacing[1] },
  dangerLink:      { alignItems: 'center', paddingTop: spacing[4] },
  dangerLinkText:  { fontSize: fontSize.sm, color: '#e74c3c', fontWeight: '500' },
  testDataSection: { borderWidth: 1, borderRadius: radius.md, padding: spacing[3], marginTop: spacing[1], gap: spacing[2] },
  testDataTitle:   { fontSize: fontSize.sm, fontWeight: '700' },
  testDataDesc:    { fontSize: fontSize.xs, lineHeight: 16 },
  seedBtn:         { alignSelf: 'flex-start', backgroundColor: '#f39c12', borderRadius: radius.sm, paddingHorizontal: spacing[4], paddingVertical: spacing[2], marginTop: spacing[1] },
  seedBtnText:     { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },

  // ── Stats ────────────────────────────────────────────────────────────────────
  statsRow:       { flexDirection: 'row', gap: spacing[3] },
  statsRowWrap:   { flexWrap: 'wrap' },
  statCard:       { flex: 1, borderWidth: 1, borderColor: '#e8e8e8', borderRadius: radius.lg, padding: spacing[4], backgroundColor: '#fff', alignItems: 'center' },
  statCardMobile: { flex: 0, width: '47%' },
  statValue:      { fontSize: fontSize.display, fontWeight: '800' },
  statLabel:      { fontSize: fontSize.xs, fontWeight: '500', marginTop: spacing[0.5] },

  // ── Section shared ───────────────────────────────────────────────────────────
  sectionHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[3] },
  sectionTitle:   { fontSize: fontSize.lg, fontWeight: '700' },
  detailRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing[2], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  detailLabel:    { fontSize: fontSize.sm, fontWeight: '500' },
  detailValue:    { fontSize: fontSize.sm, fontWeight: '600' },
  placeholder:    { fontSize: fontSize.md, fontStyle: 'italic' },
  smallBtn:       { paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.sm },
  smallBtnText:   { fontSize: fontSize.sm, fontWeight: '600' },

  // ── Status advance ───────────────────────────────────────────────────────────
  statusDesc:     { fontSize: fontSize.sm, lineHeight: 18 },
  transitionRow:  { flexDirection: 'row', gap: spacing[3], flexWrap: 'wrap' },
  advanceBtn:     { flex: 1, minWidth: 140, paddingVertical: spacing[3], borderRadius: radius.md, alignItems: 'center' },
  advanceBtnText: { fontSize: fontSize.md, fontWeight: '700', color: '#fff' },
  overrideLink:     { marginTop: spacing[3], alignSelf: 'flex-start', paddingVertical: spacing[1] },
  overrideLinkText: { fontSize: fontSize.sm, fontWeight: '600', textDecorationLine: 'underline' },
  cancelBtn:      { paddingVertical: spacing[3], paddingHorizontal: spacing[4], borderRadius: radius.md, borderWidth: 1.5, borderColor: '#e74c3c', alignItems: 'center' },
  cancelBtnText:  { fontSize: fontSize.md, fontWeight: '600', color: '#e74c3c' },

  // ── Modals ───────────────────────────────────────────────────────────────────
  errorBox:       { backgroundColor: '#fdf2f2', borderRadius: radius.md, padding: spacing[3], marginBottom: spacing[3], borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
  errorText:      { color: '#c0392b', fontSize: fontSize.md },
  fieldError:     { color: '#e74c3c', fontSize: fontSize.xs, marginTop: spacing[1], marginBottom: spacing[1] },
  fieldHint:      { fontSize: fontSize.xxs, lineHeight: 15, marginTop: spacing[1] },
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalScroll:    { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: spacing[5] },
  modal:          { width: '100%', maxWidth: 480, backgroundColor: '#fff', borderRadius: radius.xl, padding: spacing[8] },
  modalTitle:     { fontSize: fontSize.xxl, fontWeight: '800', marginBottom: spacing[4] },
  fieldLabel:     { fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing[2], marginTop: spacing[3] },
  input:          { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing[3], paddingVertical: spacing[3], fontSize: fontSize.lg, backgroundColor: '#fafafa' },
  pillRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginBottom: spacing[1] },
  pill:           { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.xxl, borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fafafa' },
  pillText:       { fontSize: fontSize.sm, fontWeight: '600', color: '#555' },
  modalActions:   { flexDirection: 'row', gap: spacing[3], marginTop: spacing[5] },
  modalCancelBtn: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing[3], alignItems: 'center' },
  modalCancelText: { fontSize: fontSize.lg, fontWeight: '600' },
  modalSubmitBtn: { flex: 2, borderRadius: radius.md, paddingVertical: spacing[3], alignItems: 'center' },
  modalSubmitText: { fontSize: fontSize.lg, fontWeight: '700' },
});
