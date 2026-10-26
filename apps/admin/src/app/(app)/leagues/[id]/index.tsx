import React, { useState } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput, Modal,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { useQueryClient } from '@tanstack/react-query';
import { leagueApi } from '@/lib/api';
import { leagueKeys, useSeasonList } from '@/lib/queries';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useLeagueName } from './_layout';
import { DateTimeField } from '@/components/DateTimeField';
import { validateDateRange } from '@/lib/dateTime';
import { formatDateOnly } from '@gfp/shared-types';
import { fontSize, radius, spacing } from '@gfp/theme';

export default function LeagueDetailScreen() {
  const theme  = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const queryClient = useQueryClient();
  const seasonList  = useSeasonList(id ?? '');
  const seasons     = seasonList.data ?? [];
  const loading     = seasonList.isPending;
  const [actionError, setError]     = useState<string | null>(null);
  const error = actionError
    ?? (seasonList.error ? (seasonList.error.message || 'Failed to load seasons.') : null);
  const [showCreate, setShowCreate] = useState(false);

  const [sName, setSName]     = useState('');
  const [rounds, setRounds]   = useState('18');
  const [start, setStart]     = useState('');
  const [end, setEnd]         = useState('');   // YYYY-MM-DD, as is start
  const [dateErrs, setDateErrs] = useState<{ start?: string; end?: string }>({});
  const [counted, setCounted] = useState('0');
  const [method, setMethod]   = useState('TotalNet');
  const [saving, setSaving]   = useState(false);

  const leagueName = useLeagueName();
  useDocumentTitle(leagueName ? `${leagueName} - Seasons` : 'GFP Leagues');

  async function handleCreate() {
    if (!id) return;
    const errs = validateDateRange(start, end);
    setDateErrs(errs);
    if (!sName.trim() || errs.start || errs.end) return;
    setSaving(true);
    try {
      await leagueApi.createSeason(id, {
        name: sName.trim(),
        totalRounds: parseInt(rounds) || 18,
        startDate: start,
        endDate: end,
        roundsCounted: parseInt(counted) || 0,
        standingMethod: method,
      });
      setShowCreate(false);
      resetForm();
      await queryClient.invalidateQueries({ queryKey: leagueKeys.all });
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setSName(''); setRounds('18'); setStart(''); setEnd(''); setDateErrs({});
    setCounted('0'); setMethod('TotalNet');
  }

  const statusColor = (s: string) => {
    if (s === 'Active')    return '#16a34a';
    if (s === 'Completed') return '#6366f1';
    return theme.mutedText;
  };

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface }]}>
      <View style={[styles.header, { borderBottomColor: theme.colors.accent }]}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: theme.colors.action, fontSize: fontSize.lg }}>← Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.primary }]}>Seasons</Text>
        <Pressable
          style={[styles.btn, { backgroundColor: theme.colors.primary }]}
          onPress={() => setShowCreate(true)}
        >
          <Text style={[styles.btnText, { color: theme.colors.surface }]}>+ Season</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={{ color: '#dc2626' }}>{error}</Text>
        </View>
      )}

      {seasons.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: theme.mutedText }]}>
            No seasons yet. Create the first one.
          </Text>
        </View>
      ) : (
        <FlatList
          data={seasons}
          keyExtractor={s => s.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.accent }]}
              onPress={() => router.push(`/(app)/leagues/${id}/seasons/${item.id}` as never)}
            >
              <View style={styles.cardTop}>
                <Text style={[styles.cardTitle, { color: theme.colors.primary }]}>{item.name}</Text>
                <Text style={[styles.statusDot, { color: statusColor(item.status) }]}>
                  ● {item.status}
                </Text>
              </View>
              <Text style={[styles.cardMeta, { color: theme.mutedText }]}>
                {formatDateOnly(item.startDate)} – {formatDateOnly(item.endDate)}
              </Text>
              <View style={styles.cardStats}>
                <Text style={[styles.stat, { color: theme.colors.primary }]}>
                  {item.memberCount} member{item.memberCount !== 1 ? 's' : ''}
                </Text>
                <Text style={[styles.stat, { color: theme.colors.primary }]}>
                  {item.roundCount}/{item.totalRounds} rounds
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}

      <Modal visible={showCreate} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>New Season</Text>

            <Text style={[styles.label, { color: theme.mutedText }]}>Season Name</Text>
            <TextInput
              style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
              value={sName} onChangeText={setSName} placeholder="2026 Spring Season"
              placeholderTextColor={theme.colors.accent}
            />

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: spacing[2] }}>
                <Text style={[styles.label, { color: theme.mutedText }]}>Start Date</Text>
                <DateTimeField
                  mode="date"
                  value={start}
                  onChange={v => { setStart(v); if (dateErrs.start || dateErrs.end) setDateErrs(validateDateRange(v, end)); }}
                  placeholder="Pick a date"
                  disabled={saving}
                  borderColor={dateErrs.start ? '#e74c3c' : theme.colors.accent}
                  accessibilityLabel="Season start date"
                />
                {!!dateErrs.start && <Text style={styles.fieldError}>{dateErrs.start}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: theme.mutedText }]}>End Date</Text>
                <DateTimeField
                  mode="date"
                  value={end}
                  onChange={v => { setEnd(v); if (dateErrs.start || dateErrs.end) setDateErrs(validateDateRange(start, v)); }}
                  min={start || undefined}
                  placeholder="Pick a date"
                  disabled={saving}
                  borderColor={dateErrs.end ? '#e74c3c' : theme.colors.accent}
                  accessibilityLabel="Season end date"
                />
                {!!dateErrs.end && <Text style={styles.fieldError}>{dateErrs.end}</Text>}
              </View>
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: spacing[2] }}>
                <Text style={[styles.label, { color: theme.mutedText }]}>Total Rounds</Text>
                <TextInput
                  style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                  value={rounds} onChangeText={setRounds} keyboardType="numeric"
                  placeholderTextColor={theme.colors.accent}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: theme.mutedText }]}>Rounds Counted (0=all)</Text>
                <TextInput
                  style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                  value={counted} onChangeText={setCounted} keyboardType="numeric"
                  placeholderTextColor={theme.colors.accent}
                />
              </View>
            </View>

            <Text style={[styles.label, { color: theme.mutedText }]}>Standing Method</Text>
            <View style={styles.segRow}>
              {['TotalNet', 'AverageNet'].map(m => (
                <Pressable
                  key={m}
                  style={[styles.seg, { borderColor: theme.colors.accent }, method === m && { backgroundColor: theme.colors.primary }]}
                  onPress={() => setMethod(m)}
                >
                  <Text style={{ color: method === m ? theme.colors.surface : theme.colors.primary, fontSize: fontSize.xs }}>
                    {m}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => { setShowCreate(false); resetForm(); }}>
                <Text style={{ color: theme.mutedText }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, { backgroundColor: theme.colors.primary, opacity: saving ? 0.6 : 1 }]}
                onPress={handleCreate} disabled={saving}
              >
                <Text style={{ color: theme.colors.surface }}>{saving ? 'Creating…' : 'Create'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing[5], borderBottomWidth: 1 },
  title:        { fontSize: fontSize.xxl, fontWeight: '700' },
  btn:          { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.md },
  btnText:      { fontWeight: '600', fontSize: fontSize.md },
  errorBanner:  { margin: spacing[3], padding: spacing[3], borderRadius: radius.md, backgroundColor: '#fef2f2' },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing[10] },
  emptyText:    { fontSize: fontSize.lg, textAlign: 'center' },
  list:         { padding: spacing[4], gap: spacing[3] },
  card:         { borderRadius: radius.lg, padding: spacing[4], borderWidth: 1 },
  cardTop:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing[1] },
  cardTitle:    { fontSize: fontSize.xl, fontWeight: '600' },
  statusDot:    { fontSize: fontSize.xs, fontWeight: '600' },
  cardMeta:     { fontSize: fontSize.xs, marginBottom: spacing[2] },
  cardStats:    { flexDirection: 'row', gap: spacing[4] },
  stat:         { fontSize: fontSize.sm, fontWeight: '500' },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  modal:        { width: '90%', maxWidth: 460, borderRadius: radius.xl, padding: spacing[6] },
  modalTitle:   { fontSize: fontSize.xl, fontWeight: '700', marginBottom: spacing[2] },
  label:        { fontSize: fontSize.xs, fontWeight: '600', marginTop: spacing[3], marginBottom: spacing[1] },
  fieldError:   { fontSize: fontSize.xs, color: '#e74c3c', marginTop: spacing[1] },
  input:        { borderWidth: 1, borderRadius: radius.md, padding: spacing[3], fontSize: fontSize.md },
  row:          { flexDirection: 'row', marginTop: spacing[1] },
  segRow:       { flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] },
  seg:          { flex: 1, paddingVertical: spacing[2], borderRadius: radius.md, borderWidth: 1, alignItems: 'center' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[3], marginTop: spacing[5] },
  cancelBtn:    { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.md },
});
