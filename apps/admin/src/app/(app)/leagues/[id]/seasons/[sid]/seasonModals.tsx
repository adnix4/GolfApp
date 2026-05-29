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
import type {
  HandicapHistoryRow, LeagueMember, LeagueRound, PairingGroup, RoundAbsence,
} from '@/lib/api';

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
            Proposed Pairings — {round?.roundDate}
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
              <Text style={{ color: theme.colors.accent }}>Discard</Text>
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
              ? <Text style={{ color: theme.colors.accent }}>No history yet.</Text>
              : history.map(h => (
                <View key={h.id} style={[mStyles.histRow, { borderColor: theme.colors.accent }]}>
                  <Text style={[mStyles.histDate, { color: theme.colors.accent }]}>
                    {h.roundDate ?? h.createdAt.slice(0, 10)}{h.adminOverride ? ' (Admin)' : ''}
                  </Text>
                  <Text style={[mStyles.histChg, { color: theme.colors.primary }]}>
                    {h.oldIndex.toFixed(1)} → {h.newIndex.toFixed(1)}
                  </Text>
                  <Text style={[mStyles.histDiff, { color: theme.colors.accent }]}>
                    diff {h.differential.toFixed(1)}
                  </Text>
                </View>
              ))
            }
          </ScrollView>
          <Pressable
            style={[mStyles.btn, { backgroundColor: theme.colors.primary, marginTop: 12, alignSelf: 'flex-end' }]}
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
          <Text style={[mStyles.label, { color: theme.colors.accent }]}>New Handicap Index</Text>
          <TextInput
            style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
            value={overrideIdx} onChangeText={setOverrideIdx} keyboardType="numeric"
            placeholderTextColor={theme.colors.accent}
          />
          <Text style={[mStyles.label, { color: theme.colors.accent }]}>Reason (required)</Text>
          <TextInput
            style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
            value={overrideReason} onChangeText={setOverrideReason}
            placeholder="e.g. Course adjustment" placeholderTextColor={theme.colors.accent}
          />
          <View style={mStyles.modalActions}>
            <Pressable style={mStyles.cancelBtn} onPress={onCancel}>
              <Text style={{ color: theme.colors.accent }}>Cancel</Text>
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
  visible, fields, saving, onChange, onCancel, onSave,
}: {
  visible:  boolean;
  fields:   AddMemberFields;
  saving:   boolean;
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
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={[mStyles.label, { color: theme.colors.accent }]}>First Name</Text>
              <TextInput
                style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                value={fields.firstName} onChangeText={v => set('firstName', v)}
                placeholderTextColor={theme.colors.accent}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[mStyles.label, { color: theme.colors.accent }]}>Last Name</Text>
              <TextInput
                style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                value={fields.lastName} onChangeText={v => set('lastName', v)}
                placeholderTextColor={theme.colors.accent}
              />
            </View>
          </View>
          <Text style={[mStyles.label, { color: theme.colors.accent }]}>Email</Text>
          <TextInput
            style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
            value={fields.email} onChangeText={v => set('email', v)} keyboardType="email-address"
            placeholderTextColor={theme.colors.accent}
          />
          <Text style={[mStyles.label, { color: theme.colors.accent }]}>Starting Handicap</Text>
          <TextInput
            style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
            value={fields.handicap} onChangeText={v => set('handicap', v)} keyboardType="numeric" placeholder="0"
            placeholderTextColor={theme.colors.accent}
          />
          <View style={mStyles.modalActions}>
            <Pressable style={mStyles.cancelBtn} onPress={onCancel}>
              <Text style={{ color: theme.colors.accent }}>Cancel</Text>
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
            Absences — {round?.roundDate}
          </Text>
          <ScrollView style={{ maxHeight: 260 }}>
            {absences.length === 0
              ? <Text style={{ color: theme.colors.accent, fontSize: 13 }}>No absences reported yet.</Text>
              : absences.map(a => (
                <View key={a.id} style={[mStyles.absenceRow, { borderColor: theme.colors.accent }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '600' }}>{a.memberName}</Text>
                    {a.subMemberName
                      ? <Text style={{ color: '#16a34a', fontSize: 12 }}>Sub: {a.subMemberName}</Text>
                      : <Text style={{ color: theme.colors.accent, fontSize: 12 }}>No sub assigned</Text>}
                  </View>
                  {!a.subMemberId && (
                    <Pressable
                      style={[mStyles.iconBtn, { borderColor: theme.colors.accent }]}
                      onPress={() => onAddSub(a.memberId)}
                    >
                      <Text style={{ fontSize: 12, color: theme.colors.action }}>Add Sub</Text>
                    </Pressable>
                  )}
                </View>
              ))
            }
          </ScrollView>
          <Text style={[mStyles.label, { color: theme.colors.accent }]}>Report New Absence</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.accent, fontSize: 11, marginBottom: 4 }}>Select Member</Text>
              <ScrollView style={{ maxHeight: 100, borderWidth: 1, borderColor: theme.colors.accent, borderRadius: 8 }}>
                {roster.filter(m => m.status === 'Active').map(m => (
                  <Pressable
                    key={m.id}
                    style={{ padding: 8, backgroundColor: selMemberId === m.id ? theme.colors.primary + '22' : 'transparent' }}
                    onPress={() => onSelectMember(m.id)}
                  >
                    <Text style={{ color: theme.colors.primary, fontSize: 12 }}>
                      {m.lastName}, {m.firstName}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
          <View style={mStyles.modalActions}>
            <Pressable style={mStyles.cancelBtn} onPress={onClose}>
              <Text style={{ color: theme.colors.accent }}>Close</Text>
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
  visible, fields, saving, onChange, onCancel, onSave,
}: {
  visible:  boolean;
  fields:   AddSubFields;
  saving:   boolean;
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
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={[mStyles.label, { color: theme.colors.accent }]}>First Name</Text>
              <TextInput
                style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                value={fields.firstName} onChangeText={v => set('firstName', v)}
                placeholderTextColor={theme.colors.accent}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[mStyles.label, { color: theme.colors.accent }]}>Last Name</Text>
              <TextInput
                style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                value={fields.lastName} onChangeText={v => set('lastName', v)}
                placeholderTextColor={theme.colors.accent}
              />
            </View>
          </View>
          <Text style={[mStyles.label, { color: theme.colors.accent }]}>Email</Text>
          <TextInput
            style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
            value={fields.email} onChangeText={v => set('email', v)} keyboardType="email-address"
            placeholderTextColor={theme.colors.accent}
          />
          <Text style={[mStyles.label, { color: theme.colors.accent }]}>Handicap Index</Text>
          <TextInput
            style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
            value={fields.handicap} onChangeText={v => set('handicap', v)} keyboardType="numeric" placeholder="0"
            placeholderTextColor={theme.colors.accent}
          />
          <View style={mStyles.modalActions}>
            <Pressable style={mStyles.cancelBtn} onPress={onCancel}>
              <Text style={{ color: theme.colors.accent }}>Cancel</Text>
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
  visible, date, notes, saving, setDate, setNotes, onCancel, onSave,
}: {
  visible: boolean;
  date:    string;
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
          <Text style={[mStyles.label, { color: theme.colors.accent }]}>Round Date (YYYY-MM-DD)</Text>
          <TextInput
            style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
            value={date} onChangeText={setDate} placeholder="2026-06-15"
            placeholderTextColor={theme.colors.accent}
          />
          <Text style={[mStyles.label, { color: theme.colors.accent }]}>Notes (optional)</Text>
          <TextInput
            style={[mStyles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
            value={notes} onChangeText={setNotes} placeholder="Rain makeup round"
            placeholderTextColor={theme.colors.accent}
          />
          <View style={mStyles.modalActions}>
            <Pressable style={mStyles.cancelBtn} onPress={onCancel}>
              <Text style={{ color: theme.colors.accent }}>Cancel</Text>
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
  modal:         { width: '92%', maxWidth: 500, borderRadius: 16, padding: 24 },
  modalTitle:    { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  label:         { fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  input:         { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14 },
  row:           { flexDirection: 'row' },
  modalActions:  { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  cancelBtn:     { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  btn:           { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  pairingGroup:  { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8 },
  groupLabel:    { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  groupMember:   { fontSize: 13, paddingLeft: 4 },
  histRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, gap: 8 },
  histDate:      { fontSize: 12, flex: 1 },
  histChg:       { fontSize: 14, fontWeight: '600' },
  histDiff:      { fontSize: 12, width: 60, textAlign: 'right' },
  absenceRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1 },
  iconBtn:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
});
