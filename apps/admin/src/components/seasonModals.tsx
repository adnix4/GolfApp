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
 */

import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useTheme } from '@gfp/ui';
import { DateTimeField } from './DateTimeField';
import type {
  HandicapHistoryRow, LeagueMember, LeagueRound, PairingGroup, RoundAbsence,
} from '@/lib/api';
import { formatDateOnly, formatDate } from '@gfp/shared-types';
import { fontSize, radius, spacing, status } from '@gfp/theme';

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
    <Modal visible={visible} transparent animationType="slide">
      <View style={mStyles.overlay}>
        <View style={[mStyles.modal, { backgroundColor: theme.colors.surface, maxHeight: '80%' as unknown as number }]}>
          <Text style={[mStyles.modalTitle, { color: theme.colors.primary }]}>
            Proposed Pairings — {formatDateOnly(round?.roundDate)}
          </Text>
          <ScrollView>
            {groups.map(g => (
              <View key={g.id} style={[mStyles.pairingGroup, { borderColor: theme.colors.accent }]}>
                <Text style={[mStyles.groupLabel, { color: theme.colors.primary }]}>Group {g.groupNumber}</Text>
                {g.memberNames.map((n, i) => (
                  <Text key={i} style={[mStyles.groupMember, { color: theme.colors.primary }]}>· {n}</Text>
                ))}
              </View>
            ))}
          </ScrollView>
          <View style={mStyles.modalActions}>
            <Pressable style={mStyles.cancelBtn} onPress={onDiscard}>
              <Text style={{ color: theme.mutedText }}>Discard</Text>
            </Pressable>
            <Pressable style={[mStyles.btn, { backgroundColor: theme.colors.primary }]} onPress={onLock}>
              <Text style={{ color: theme.colors.surface }}>Lock Pairings</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={mStyles.overlay}>
        <View style={[mStyles.modal, { backgroundColor: theme.colors.surface, maxHeight: '70%' as unknown as number }]}>
          <Text style={[mStyles.modalTitle, { color: theme.colors.primary }]}>
            HC History — {member?.firstName} {member?.lastName}
          </Text>
          <ScrollView>
            {history.length === 0
              ? <Text style={{ color: theme.mutedText }}>No history yet.</Text>
              : history.map(h => (
                <View key={h.id} style={[mStyles.histRow, { borderColor: theme.colors.accent }]}>
                  <Text style={[mStyles.histDate, { color: theme.mutedText }]}>
                    {h.roundDate ? formatDateOnly(h.roundDate) : formatDate(h.createdAt)}{h.adminOverride ? ' (Admin)' : ''}
                  </Text>
                  <Text style={[mStyles.histChg, { color: theme.colors.primary }]}>
                    {h.oldIndex.toFixed(1)} → {h.newIndex.toFixed(1)}
                  </Text>
                  <Text style={[mStyles.histDiff, { color: theme.mutedText }]}>
                    diff {h.differential.toFixed(1)}
                  </Text>
                </View>
              ))
            }
          </ScrollView>
          <Pressable
            style={[mStyles.btn, { backgroundColor: theme.colors.primary, marginTop: spacing[3], alignSelf: 'flex-end' }]}
            onPress={onClose}
          >
            <Text style={{ color: theme.colors.surface }}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={mStyles.overlay}>
        <View style={[mStyles.modal, { backgroundColor: theme.colors.surface }]}>
          <Text style={[mStyles.modalTitle, { color: theme.colors.primary }]}>
            Override HC — {member?.firstName} {member?.lastName}
          </Text>
          <Text style={[mStyles.label, { color: theme.mutedText }]}>New Handicap Index</Text>
          <TextInput
            style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
            value={overrideIdx} onChangeText={setOverrideIdx} keyboardType="numeric"
            placeholderTextColor={theme.colors.accent}
          />
          <Text style={[mStyles.label, { color: theme.mutedText }]}>Reason (required)</Text>
          <TextInput
            style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
            value={overrideReason} onChangeText={setOverrideReason}
            placeholder="e.g. Course adjustment" placeholderTextColor={theme.colors.accent}
          />
          <View style={mStyles.modalActions}>
            <Pressable style={mStyles.cancelBtn} onPress={onCancel}>
              <Text style={{ color: theme.mutedText }}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[mStyles.btn, { backgroundColor: '#f59e0b', opacity: saving ? 0.6 : 1 }]}
              onPress={onSave} disabled={saving}
            >
              <Text style={{ color: '#fff' }}>{saving ? 'Saving…' : 'Override'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── ADD MEMBER ────────────────────────────────────────────────────────────────

export interface AddMemberFields {
  firstName: string; lastName: string; email: string; handicap: string;
}

export function AddMemberModal({
  visible, fields, saving, error, onChange, onCancel, onSave,
}: {
  visible:  boolean;
  fields:   AddMemberFields;
  saving:   boolean;
  /** Inline validation or save error, shown above the buttons. */
  error?:   string | null;
  onChange: (next: AddMemberFields) => void;
  onCancel: () => void;
  onSave:   () => void;
}) {
  const theme = useTheme();
  const set = <K extends keyof AddMemberFields>(k: K, v: AddMemberFields[K]) =>
    onChange({ ...fields, [k]: v });
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={mStyles.overlay}>
        <View style={[mStyles.modal, { backgroundColor: theme.colors.surface }]}>
          <Text style={[mStyles.modalTitle, { color: theme.colors.primary }]}>Add Member</Text>
          <View style={mStyles.row}>
            <View style={{ flex: 1, marginRight: spacing[2] }}>
              <Text style={[mStyles.label, { color: theme.mutedText }]}>First Name *</Text>
              <TextInput
                style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                value={fields.firstName} onChangeText={v => set('firstName', v)}
                placeholderTextColor={theme.colors.accent}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[mStyles.label, { color: theme.mutedText }]}>Last Name *</Text>
              <TextInput
                style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                value={fields.lastName} onChangeText={v => set('lastName', v)}
                placeholderTextColor={theme.colors.accent}
              />
            </View>
          </View>
          <Text style={[mStyles.label, { color: theme.mutedText }]}>Email *</Text>
          <TextInput
            style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
            value={fields.email} onChangeText={v => set('email', v)} keyboardType="email-address"
            placeholderTextColor={theme.colors.accent}
          />
          <Text style={[mStyles.label, { color: theme.mutedText }]}>Starting Handicap Index *</Text>
          <TextInput
            style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
            value={fields.handicap} onChangeText={v => set('handicap', v)} keyboardType="decimal-pad" placeholder="e.g. 14.2 — required for league play"
            placeholderTextColor={theme.colors.accent}
          />
          {error ? <Text style={mStyles.formError}>{error}</Text> : null}
          <View style={mStyles.modalActions}>
            <Pressable style={mStyles.cancelBtn} onPress={onCancel}>
              <Text style={{ color: theme.mutedText }}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[mStyles.btn, { backgroundColor: theme.colors.primary, opacity: saving ? 0.6 : 1 }]}
              onPress={onSave} disabled={saving}
            >
              <Text style={{ color: theme.colors.surface }}>{saving ? 'Adding…' : 'Add Member'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={mStyles.overlay}>
        <View style={[mStyles.modal, { backgroundColor: theme.colors.surface, maxHeight: '80%' as unknown as number }]}>
          <Text style={[mStyles.modalTitle, { color: theme.colors.primary }]}>
            Absences — {formatDateOnly(round?.roundDate)}
          </Text>
          <ScrollView style={{ maxHeight: 260 }}>
            {absences.length === 0
              ? <Text style={{ color: theme.mutedText, fontSize: fontSize.sm }}>No absences reported yet.</Text>
              : absences.map(a => (
                <View key={a.id} style={[mStyles.absenceRow, { borderColor: theme.colors.accent }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.primary, fontSize: fontSize.sm, fontWeight: '600' }}>{a.memberName}</Text>
                    {a.subMemberName
                      ? <Text style={{ color: '#16a34a', fontSize: fontSize.xs }}>Sub: {a.subMemberName}</Text>
                      : <Text style={{ color: theme.mutedText, fontSize: fontSize.xs }}>No sub assigned</Text>}
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
          <Text style={[mStyles.label, { color: theme.mutedText }]}>Report New Absence</Text>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.mutedText, fontSize: fontSize.xxs, marginBottom: spacing[1] }}>Select Member</Text>
              <ScrollView style={{ maxHeight: 100, borderWidth: 1, borderColor: theme.colors.accent, borderRadius: radius.md }}>
                {roster.filter(m => m.status === 'Active').map(m => (
                  <Pressable
                    key={m.id}
                    style={{ padding: spacing[2], backgroundColor: selMemberId === m.id ? theme.colors.primary + '22' : 'transparent' }}
                    onPress={() => onSelectMember(m.id)}
                  >
                    <Text style={{ color: theme.colors.primary, fontSize: fontSize.xs }}>
                      {m.lastName}, {m.firstName}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
          <View style={mStyles.modalActions}>
            <Pressable style={mStyles.cancelBtn} onPress={onClose}>
              <Text style={{ color: theme.mutedText }}>Close</Text>
            </Pressable>
            <Pressable
              style={[mStyles.btn, { backgroundColor: '#ef4444', opacity: (!selMemberId || saving) ? 0.5 : 1 }]}
              onPress={onReportAbsent}
              disabled={!selMemberId || saving}
            >
              <Text style={{ color: '#fff' }}>{saving ? 'Saving…' : 'Report Absent'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── ADD SUBSTITUTE ────────────────────────────────────────────────────────────

export interface AddSubFields {
  firstName: string; lastName: string; email: string; handicap: string;
}

export function AddSubModal({
  visible, fields, saving, error, onChange, onCancel, onSave,
}: {
  visible:  boolean;
  fields:   AddSubFields;
  saving:   boolean;
  /** Inline validation or save error, shown above the buttons. */
  error?:   string | null;
  onChange: (next: AddSubFields) => void;
  onCancel: () => void;
  onSave:   () => void;
}) {
  const theme = useTheme();
  const set = <K extends keyof AddSubFields>(k: K, v: AddSubFields[K]) =>
    onChange({ ...fields, [k]: v });
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={mStyles.overlay}>
        <View style={[mStyles.modal, { backgroundColor: theme.colors.surface }]}>
          <Text style={[mStyles.modalTitle, { color: theme.colors.primary }]}>Add Substitute</Text>
          <View style={mStyles.row}>
            <View style={{ flex: 1, marginRight: spacing[2] }}>
              <Text style={[mStyles.label, { color: theme.mutedText }]}>First Name *</Text>
              <TextInput
                style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                value={fields.firstName} onChangeText={v => set('firstName', v)}
                placeholderTextColor={theme.colors.accent}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[mStyles.label, { color: theme.mutedText }]}>Last Name *</Text>
              <TextInput
                style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                value={fields.lastName} onChangeText={v => set('lastName', v)}
                placeholderTextColor={theme.colors.accent}
              />
            </View>
          </View>
          <Text style={[mStyles.label, { color: theme.mutedText }]}>Email *</Text>
          <TextInput
            style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
            value={fields.email} onChangeText={v => set('email', v)} keyboardType="email-address"
            placeholderTextColor={theme.colors.accent}
          />
          <Text style={[mStyles.label, { color: theme.mutedText }]}>Handicap Index *</Text>
          <TextInput
            style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
            value={fields.handicap} onChangeText={v => set('handicap', v)} keyboardType="decimal-pad" placeholder="e.g. 14.2 — required for league play"
            placeholderTextColor={theme.colors.accent}
          />
          {error ? <Text style={mStyles.formError}>{error}</Text> : null}
          <View style={mStyles.modalActions}>
            <Pressable style={mStyles.cancelBtn} onPress={onCancel}>
              <Text style={{ color: theme.mutedText }}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[mStyles.btn, { backgroundColor: theme.colors.primary, opacity: saving ? 0.6 : 1 }]}
              onPress={onSave} disabled={saving}
            >
              <Text style={{ color: theme.colors.surface }}>{saving ? 'Adding…' : 'Add Sub'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={mStyles.overlay}>
        <View style={[mStyles.modal, { backgroundColor: theme.colors.surface }]}>
          <Text style={[mStyles.modalTitle, { color: theme.colors.primary }]}>Add Round</Text>
          <Text style={[mStyles.label, { color: theme.mutedText }]}>Round Date</Text>
          <DateTimeField
            mode="date"
            value={date}
            onChange={setDate}
            min={seasonStart}
            max={seasonEnd}
            placeholder="Pick a date"
            disabled={saving}
            borderColor={dateError ? '#e74c3c' : theme.colors.accent}
            accessibilityLabel="Round date"
          />
          {!!dateError && <Text style={mStyles.fieldError}>{dateError}</Text>}
          <Text style={[mStyles.label, { color: theme.mutedText }]}>Notes (optional)</Text>
          <TextInput
            style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
            value={notes} onChangeText={setNotes} placeholder="Rain makeup round"
            placeholderTextColor={theme.colors.accent}
          />
          <View style={mStyles.modalActions}>
            <Pressable style={mStyles.cancelBtn} onPress={onCancel}>
              <Text style={{ color: theme.mutedText }}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[mStyles.btn, { backgroundColor: theme.colors.primary, opacity: saving ? 0.6 : 1 }]}
              onPress={onSave} disabled={saving}
            >
              <Text style={{ color: theme.colors.surface }}>{saving ? 'Adding…' : 'Add Round'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── SHARED STYLES ─────────────────────────────────────────────────────────────

const mStyles = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  modal:         { width: '92%', maxWidth: 500, borderRadius: radius.xl, padding: spacing[6] },
  modalTitle:    { fontSize: fontSize.xl, fontWeight: '700', marginBottom: spacing[2] },
  label:         { fontSize: fontSize.xs, fontWeight: '600', marginTop: spacing[3], marginBottom: spacing[1] },
  fieldError:    { fontSize: fontSize.xs, color: status.danger, marginTop: spacing[1] },
  input:         { borderWidth: 1, borderRadius: radius.md, padding: spacing[3], fontSize: fontSize.md },
  row:           { flexDirection: 'row' },
  modalActions:  { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[3], marginTop: spacing[5] },
  formError:     { color: '#dc2626', fontSize: fontSize.sm, marginTop: spacing[3] },
  cancelBtn:     { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.md },
  btn:           { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.md },
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
