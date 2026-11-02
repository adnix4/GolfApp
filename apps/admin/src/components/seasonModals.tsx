/**
 * Modal components for the season dashboard.
 *
 * Hoisted out of index.tsx (which was 835 LOC and growing) so each modal
 * sits next to its own state without the parent file having to inline
 * 200+ LOC of repeated Modal/overlay scaffolding.
 *
 * Each modal is a pure presentational component: the parent owns the form
 * state (which it must, since the same fields are reset/seeded on demand)
 * and passes value+setter pairs through. Save handlers are also parent-owned
 * because they couple to the dashboard reload + error banner.
 *
 * All of them are FormModal + the shared classes (E5), so they match every
 * other admin popup and scroll instead of clipping when the window is short.
 */

import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme, useClasses, FormModal } from '@gfp/ui';
import { DateTimeField } from './DateTimeField';
import type {
  FlightSummary, HandicapHistoryRow, LeagueMember, LeagueRound, LeagueScorecard, PairingGroup, RoundAbsence,
} from '@/lib/api';
import type { FlightFields, HoleInputs } from '@/lib/leagueAdmin';
import { formatDateOnly, formatDate } from '@gfp/shared-types';
import { fontSize, radius, spacing, status } from '@gfp/theme';

const PLACEHOLDER = '#999';

// ── PAIRINGS PREVIEW ──────────────────────────────────────────────────────────

export function PairingsPreviewModal({
  visible, round, groups, onDiscard, onLock,
}: {
  visible:   boolean;
  round:     LeagueRound | null;
  groups:    PairingGroup[];
  onDiscard: () => void;
  onLock:    () => void;
}) {
  const theme = useTheme();
  return (
    <FormModal
      visible={visible}
      title={`Proposed Pairings — ${formatDateOnly(round?.roundDate)}`}
      onClose={onDiscard}
      cancelLabel="Discard"
      onSubmit={onLock}
      submitLabel="Lock Pairings"
    >
      {groups.map(g => (
        <View key={g.id} style={[mStyles.pairingGroup, { borderColor: theme.colors.accent }]}>
          <Text style={[mStyles.groupLabel, { color: theme.colors.primary }]}>Group {g.groupNumber}</Text>
          {g.memberNames.map((n, i) => (
            <Text key={i} style={[mStyles.groupMember, { color: theme.colors.primary }]}>· {n}</Text>
          ))}
        </View>
      ))}
    </FormModal>
  );
}

// ── HANDICAP HISTORY ──────────────────────────────────────────────────────────

export function HandicapHistoryModal({
  visible, member, history, onClose,
}: {
  visible: boolean;
  member:  LeagueMember | null;
  history: HandicapHistoryRow[];
  onClose: () => void;
}) {
  const theme = useTheme();
  const c = useClasses();
  return (
    <FormModal
      visible={visible}
      title={`HC History — ${member?.firstName ?? ''} ${member?.lastName ?? ''}`}
      onClose={onClose}
      cancelLabel="Close"
      onSubmit={onClose}
      submitLabel="Close"
      hideSubmit
    >
      {history.length === 0
        ? <Text style={c.muted}>No history yet.</Text>
        : history.map(h => (
          <View key={h.id} style={[mStyles.histRow, { borderColor: theme.colors.accent }]}>
            <Text style={[mStyles.histDate, c.muted]}>
              {h.roundDate ? formatDateOnly(h.roundDate) : formatDate(h.createdAt)}{h.adminOverride ? ' (Admin)' : ''}
            </Text>
            <Text style={[mStyles.histChg, { color: theme.colors.primary }]}>
              {h.oldIndex.toFixed(1)} → {h.newIndex.toFixed(1)}
            </Text>
            <Text style={[mStyles.histDiff, c.muted]}>
              diff {h.differential.toFixed(1)}
            </Text>
          </View>
        ))
      }
    </FormModal>
  );
}

// ── OVERRIDE HANDICAP ─────────────────────────────────────────────────────────

export function OverrideHandicapModal({
  visible, member, overrideIdx, overrideReason, saving,
  setOverrideIdx, setOverrideReason, onCancel, onSave,
}: {
  visible:           boolean;
  member:            LeagueMember | null;
  overrideIdx:       string;
  overrideReason:    string;
  saving:            boolean;
  setOverrideIdx:    (v: string) => void;
  setOverrideReason: (v: string) => void;
  onCancel:          () => void;
  onSave:            () => void;
}) {
  const c = useClasses();
  return (
    <FormModal
      visible={visible}
      title={`Override HC — ${member?.firstName ?? ''} ${member?.lastName ?? ''}`}
      onClose={onCancel}
      onSubmit={onSave}
      submitLabel="Override"
      loading={saving}
    >
      <Text style={c.fieldLabel}>New Handicap Index</Text>
      <TextInput
        style={c.input}
        value={overrideIdx} onChangeText={setOverrideIdx} keyboardType="numeric"
        placeholderTextColor={PLACEHOLDER}
      />
      <Text style={c.fieldLabel}>Reason (required)</Text>
      <TextInput
        style={c.input}
        value={overrideReason} onChangeText={setOverrideReason}
        placeholder="e.g. Course adjustment" placeholderTextColor={PLACEHOLDER}
      />
    </FormModal>
  );
}

// ── ADD MEMBER / ADD SUBSTITUTE ───────────────────────────────────────────────

export interface AddMemberFields {
  firstName: string; lastName: string; email: string; handicap: string;
}
export type AddSubFields = AddMemberFields;

interface PersonFormProps {
  visible:  boolean;
  fields:   AddMemberFields;
  saving:   boolean;
  /** Inline validation or save error, shown above the buttons. */
  error?:   string | null;
  onChange: (next: AddMemberFields) => void;
  onCancel: () => void;
  onSave:   () => void;
}

/** The member and substitute forms are the same four fields. */
function PersonFormModal({
  visible, fields, saving, error, onChange, onCancel, onSave,
  title, submitLabel, handicapLabel,
}: PersonFormProps & { title: string; submitLabel: string; handicapLabel: string }) {
  const c = useClasses();
  const set = <K extends keyof AddMemberFields>(k: K, v: AddMemberFields[K]) =>
    onChange({ ...fields, [k]: v });
  return (
    <FormModal
      visible={visible}
      title={title}
      onClose={onCancel}
      onSubmit={onSave}
      submitLabel={submitLabel}
      loading={saving}
    >
      <View style={mStyles.row}>
        <View style={mStyles.half}>
          <Text style={c.fieldLabel}>First Name *</Text>
          <TextInput
            style={c.input}
            value={fields.firstName} onChangeText={v => set('firstName', v)}
            placeholderTextColor={PLACEHOLDER}
          />
        </View>
        <View style={mStyles.half}>
          <Text style={c.fieldLabel}>Last Name *</Text>
          <TextInput
            style={c.input}
            value={fields.lastName} onChangeText={v => set('lastName', v)}
            placeholderTextColor={PLACEHOLDER}
          />
        </View>
      </View>
      <Text style={c.fieldLabel}>Email *</Text>
      <TextInput
        style={c.input}
        value={fields.email} onChangeText={v => set('email', v)} keyboardType="email-address"
        placeholderTextColor={PLACEHOLDER}
      />
      <Text style={c.fieldLabel}>{handicapLabel}</Text>
      <TextInput
        style={c.input}
        value={fields.handicap} onChangeText={v => set('handicap', v)} keyboardType="decimal-pad"
        placeholder="e.g. 14.2 — required for league play" placeholderTextColor={PLACEHOLDER}
      />
      {error ? <View style={[c.errorBox, mStyles.formError]}><Text style={c.errorText}>{error}</Text></View> : null}
    </FormModal>
  );
}

export function AddMemberModal(props: PersonFormProps) {
  return (
    <PersonFormModal
      {...props}
      title="Add Member"
      submitLabel="Add Member"
      handicapLabel="Starting Handicap Index *"
    />
  );
}

export function AddSubModal(props: PersonFormProps) {
  return (
    <PersonFormModal
      {...props}
      title="Add Substitute"
      submitLabel="Add Sub"
      handicapLabel="Handicap Index *"
    />
  );
}

// ── ABSENCES ──────────────────────────────────────────────────────────────────

export function AbsencesModal({
  visible, round, absences, roster, selMemberId, saving,
  onSelectMember, onClose, onReportAbsent, onAddSub,
}: {
  visible:        boolean;
  round:          LeagueRound | null;
  absences:       RoundAbsence[];
  roster:         LeagueMember[];
  selMemberId:    string;
  saving:         boolean;
  onSelectMember: (id: string) => void;
  onClose:        () => void;
  onReportAbsent: () => void;
  onAddSub:       (memberId: string) => void;
}) {
  const theme = useTheme();
  const c = useClasses();
  return (
    <FormModal
      visible={visible}
      title={`Absences — ${formatDateOnly(round?.roundDate)}`}
      onClose={onClose}
      cancelLabel="Close"
      onSubmit={onReportAbsent}
      submitLabel="Report Absent"
      destructive
      loading={saving}
      submitDisabled={!selMemberId}
    >
      <ScrollView style={{ maxHeight: 260 }}>
        {absences.length === 0
          ? <Text style={[c.muted, { fontSize: fontSize.sm }]}>No absences reported yet.</Text>
          : absences.map(a => (
            <View key={a.id} style={[mStyles.absenceRow, { borderColor: theme.colors.accent }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.primary, fontSize: fontSize.sm, fontWeight: '600' }}>{a.memberName}</Text>
                {a.subMemberName
                  ? <Text style={{ color: status.success, fontSize: fontSize.xs }}>Sub: {a.subMemberName}</Text>
                  : <Text style={[c.muted, { fontSize: fontSize.xs }]}>No sub assigned</Text>}
              </View>
              {!a.subMemberId && (
                <Pressable
                  style={[mStyles.iconBtn, { borderColor: theme.colors.accent }]}
                  onPress={() => onAddSub(a.memberId)}
                >
                  <Text style={{ fontSize: fontSize.xs, color: theme.colors.action }}>Add Sub</Text>
                </Pressable>
              )}
            </View>
          ))
        }
      </ScrollView>
      <Text style={c.fieldLabel}>Report New Absence</Text>
      <Text style={c.fieldHint}>Select Member</Text>
      <ScrollView style={[mStyles.picker, { borderColor: theme.colors.accent }]}>
        {roster.filter(m => m.status === 'Active').map(m => (
          <Pressable
            key={m.id}
            style={{ padding: spacing[2], backgroundColor: selMemberId === m.id ? theme.colors.primary + '22' : 'transparent' }}
            onPress={() => onSelectMember(m.id)}
          >
            <Text style={{ color: theme.colors.primary, fontSize: fontSize.sm }}>
              {m.lastName}, {m.firstName}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </FormModal>
  );
}

// ── ENTER SCORES ──────────────────────────────────────────────────────────────

export function EnterScoresModal({
  visible, round, members, scorecards, selMemberId, inputs, saving, error, notice,
  onSelectMember, onChangeHole, onClose, onSave,
}: {
  visible:        boolean;
  round:          LeagueRound | null;
  members:        LeagueMember[];
  scorecards:     LeagueScorecard[];
  selMemberId:    string;
  inputs:         HoleInputs;
  saving:         boolean;
  error:          string | null;
  notice:         string | null;
  onSelectMember: (id: string) => void;
  onChangeHole:   (hole: number, value: string) => void;
  onClose:        () => void;
  onSave:         () => void;
}) {
  const theme = useTheme();
  const c = useClasses();
  const holes = Array.from({ length: round?.holeCount ?? 18 }, (_, i) => i + 1);
  return (
    <FormModal
      visible={visible}
      title={`Enter Scores — ${formatDateOnly(round?.roundDate)}`}
      onClose={onClose}
      cancelLabel="Close"
      onSubmit={onSave}
      submitLabel="Save Scores"
      loading={saving}
      submitDisabled={!selMemberId}
      maxWidth={560}
    >
      <Text style={c.fieldHint}>Select Member</Text>
      <ScrollView style={[mStyles.picker, { borderColor: theme.colors.accent }]}>
        {members.map(m => {
          const card = scorecards.find(s => s.memberId === m.id);
          return (
            <Pressable
              key={m.id}
              style={[mStyles.scoreMember, { backgroundColor: selMemberId === m.id ? theme.colors.primary + '22' : 'transparent' }]}
              onPress={() => onSelectMember(m.id)}
            >
              <Text style={{ flex: 1, color: theme.colors.primary, fontSize: fontSize.sm }}>
                {m.lastName}, {m.firstName}
              </Text>
              {card && (
                <Text style={[c.muted, { fontSize: fontSize.xs }]}>
                  {card.holes.length}/{holes.length} holes · {card.grossTotal} gross
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      {notice && <Text style={{ color: status.success, fontSize: fontSize.sm }}>{notice}</Text>}
      {selMemberId !== '' && (
        <>
          <Text style={c.fieldLabel}>Gross Score by Hole</Text>
          <View style={mStyles.holeGrid}>
            {holes.map(h => (
              <View key={h} style={mStyles.holeCell}>
                <Text style={[c.muted, { fontSize: fontSize.xs }]}>{h}</Text>
                <TextInput
                  style={[c.input, mStyles.holeInput]}
                  value={inputs[h] ?? ''}
                  onChangeText={v => onChangeHole(h, v)}
                  keyboardType="number-pad"
                  maxLength={2}
                  accessibilityLabel={`Hole ${h} gross score`}
                />
              </View>
            ))}
          </View>
        </>
      )}
      {error && <Text style={{ color: status.danger, fontSize: fontSize.sm }}>{error}</Text>}
    </FormModal>
  );
}

// ── FLIGHTS ───────────────────────────────────────────────────────────────────

export function AddFlightModal({
  visible, fields, saving, error, onChange, onCancel, onSave,
}: {
  visible:  boolean;
  fields:   FlightFields;
  saving:   boolean;
  error:    string | null;
  onChange: (next: FlightFields) => void;
  onCancel: () => void;
  onSave:   () => void;
}) {
  const c = useClasses();
  return (
    <FormModal
      visible={visible}
      title="Add Flight"
      onClose={onCancel}
      onSubmit={onSave}
      submitLabel="Add Flight"
      loading={saving}
    >
      <Text style={c.fieldLabel}>Name</Text>
      <TextInput
        style={c.input}
        value={fields.name}
        onChangeText={name => onChange({ ...fields, name })}
        placeholder="A Flight"
        placeholderTextColor={PLACEHOLDER}
        maxLength={100}
      />
      <Text style={c.fieldLabel}>Lowest Handicap (optional)</Text>
      <TextInput
        style={c.input}
        value={fields.minHandicap}
        onChangeText={minHandicap => onChange({ ...fields, minHandicap })}
        keyboardType="numbers-and-punctuation"
      />
      <Text style={c.fieldLabel}>Highest Handicap (optional)</Text>
      <TextInput
        style={c.input}
        value={fields.maxHandicap}
        onChangeText={maxHandicap => onChange({ ...fields, maxHandicap })}
        keyboardType="numbers-and-punctuation"
      />
      <Text style={c.fieldHint}>The range is a guide for you. Assign each member to a flight from the roster.</Text>
      {error && <Text style={{ color: status.danger, fontSize: fontSize.sm }}>{error}</Text>}
    </FormModal>
  );
}

export function AssignFlightModal({
  visible, member, flights, selFlightId, saving, onSelect, onCancel, onSave,
}: {
  visible:     boolean;
  member:      LeagueMember | null;
  flights:     FlightSummary[];
  selFlightId: string;
  saving:      boolean;
  onSelect:    (id: string) => void;
  onCancel:    () => void;
  onSave:      () => void;
}) {
  const theme = useTheme();
  const options = [{ id: '', name: 'No flight' }, ...flights];
  return (
    <FormModal
      visible={visible}
      title={`Flight — ${member?.firstName ?? ''} ${member?.lastName ?? ''}`}
      onClose={onCancel}
      onSubmit={onSave}
      submitLabel="Save"
      loading={saving}
    >
      <ScrollView style={[mStyles.picker, { borderColor: theme.colors.accent }]}>
        {options.map(f => (
          <Pressable
            key={f.id}
            style={{ padding: spacing[2], backgroundColor: selFlightId === f.id ? theme.colors.primary + '22' : 'transparent' }}
            onPress={() => onSelect(f.id)}
          >
            <Text style={{ color: theme.colors.primary, fontSize: fontSize.sm }}>{f.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </FormModal>
  );
}

// ── ADD ROUND ─────────────────────────────────────────────────────────────────

export function AddRoundModal({
  visible, date, notes, saving, seasonStart, seasonEnd, dateError,
  setDate, setNotes, onCancel, onSave,
}: {
  visible: boolean;
  date:    string;   // YYYY-MM-DD
  /** The season's date range (`YYYY-MM-DD`); the picker is bounded to it. */
  seasonStart?: string;
  seasonEnd?:   string;
  dateError?:   string;
  notes:   string;
  saving:  boolean;
  setDate: (v: string) => void;
  setNotes:(v: string) => void;
  onCancel: () => void;
  onSave:   () => void;
}) {
  const theme = useTheme();
  const c = useClasses();
  return (
    <FormModal
      visible={visible}
      title="Add Round"
      onClose={onCancel}
      onSubmit={onSave}
      submitLabel="Add Round"
      loading={saving}
    >
      <Text style={c.fieldLabel}>Round Date</Text>
      <DateTimeField
        mode="date"
        value={date}
        onChange={setDate}
        min={seasonStart}
        max={seasonEnd}
        placeholder="Pick a date"
        disabled={saving}
        borderColor={dateError ? status.danger : theme.colors.accent}
        accessibilityLabel="Round date"
      />
      {!!dateError && <Text style={mStyles.fieldError}>{dateError}</Text>}
      <Text style={c.fieldLabel}>Notes (optional)</Text>
      <TextInput
        style={c.input}
        value={notes} onChangeText={setNotes} placeholder="Rain makeup round"
        placeholderTextColor={PLACEHOLDER}
      />
    </FormModal>
  );
}

// ── LOCAL LAYOUT ──────────────────────────────────────────────────────────────

const mStyles = StyleSheet.create({
  scoreMember:  { flexDirection: 'row', alignItems: 'center', gap: spacing[2], padding: spacing[2] },
  holeGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  holeCell:     { width: 52, alignItems: 'center', gap: spacing[0.5] },
  holeInput:    { width: 48, textAlign: 'center', paddingHorizontal: spacing[1] },
  row:           { flexDirection: 'row', gap: spacing[2] },
  half:          { flex: 1 },
  fieldError:    { fontSize: fontSize.xs, color: status.danger, marginTop: spacing[1] },
  formError:     { marginTop: spacing[3], marginBottom: 0 },   // over c.errorBox: sits right above the buttons
  picker:        { maxHeight: 120, borderWidth: 1, borderRadius: radius.md },
  pairingGroup:  { borderWidth: 1, borderRadius: radius.md, padding: spacing[3], marginBottom: spacing[2] },
  groupLabel:    { fontSize: fontSize.sm, fontWeight: '700', marginBottom: spacing[1] },
  groupMember:   { fontSize: fontSize.sm, paddingLeft: spacing[1] },
  histRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[2], borderBottomWidth: 1, gap: spacing[2] },
  histDate:      { fontSize: fontSize.xs, flex: 1 },
  histChg:       { fontSize: fontSize.md, fontWeight: '600' },
  histDiff:      { fontSize: fontSize.xs, width: 60, textAlign: 'right' },
  absenceRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[2], borderBottomWidth: 1 },
  iconBtn:       { paddingHorizontal: spacing[3], paddingVertical: spacing[1], borderRadius: radius.sm, borderWidth: 1 },
});
