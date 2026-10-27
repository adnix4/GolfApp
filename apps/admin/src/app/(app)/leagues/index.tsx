import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, TextInput, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, AsyncSection, FormModal, PrimaryButton, MoneyInput } from '@gfp/ui';
import { dollarsToCents } from '@gfp/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import { leagueApi } from '@/lib/api';
import { leagueKeys, useLeagueList } from '@/lib/queries';
import { useResponsive } from '@/lib/responsive';
import { fontSize, radius, spacing } from '@gfp/theme';

const FORMATS    = ['Stableford', 'Stroke', 'Match'];
const HC_SYSTEMS = ['Club', 'USGA'];

export default function LeaguesScreen() {
  const theme      = useTheme();
  const router     = useRouter();
  const { isMobile } = useResponsive();

  const queryClient = useQueryClient();
  const leagueList  = useLeagueList();
  const leagues     = leagueList.data ?? [];
  const loading     = leagueList.isPending;
  const [actionError, setError]     = useState<string | null>(null);
  const error = actionError
    ?? (leagueList.error ? (leagueList.error.message || 'Failed to load leagues.') : null);
  const [showCreate, setShowCreate] = useState(false);

  const [name, setName]         = useState('');
  const [format, setFormat]     = useState('Stableford');
  const [hcSystem, setHcSystem] = useState('Club');
  const [hcCap, setHcCap]       = useState('36');
  const [dues, setDues]         = useState('');
  const [saving, setSaving]     = useState(false);

  const { refetch } = leagueList;
  const load = useCallback(() => {
    setError(null);
    refetch();
  }, [refetch]);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await leagueApi.create({
        name: name.trim(),
        format,
        handicapSystem: hcSystem,
        handicapCap: parseFloat(hcCap) || 36,
        duesCents: dollarsToCents(dues),
      });
      setShowCreate(false);
      setName(''); setFormat('Stableford'); setHcSystem('Club');
      setHcCap('36'); setDues('');
      await queryClient.invalidateQueries({ queryKey: leagueKeys.all });
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.accent }]}>
        <Text style={[styles.title, { color: theme.colors.primary }]}>Leagues</Text>
        <PrimaryButton
          label="+ New League"
          size="sm"
          onPress={() => setShowCreate(true)}
        />
      </View>

      <AsyncSection
        loading={loading}
        error={error}
        empty={leagues.length === 0 ? 'No leagues yet. Create one to get started.' : null}
        onRetry={load}
      >
        <FlatList
          data={leagues}
          keyExtractor={l => l.id}
          numColumns={!isMobile ? 3 : 1}
          contentContainerStyle={styles.list}
          key={!isMobile ? 'wide' : 'narrow'}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.card, {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.accent,
                flex: !isMobile ? 1 : undefined,
                margin: spacing[2],
              }]}
              onPress={() => router.push(`/(app)/leagues/${item.id}` as never)}
            >
              <Text style={[styles.cardTitle, { color: theme.colors.primary }]}>{item.name}</Text>
              <View style={styles.cardRow}>
                <Text style={[styles.chip, { backgroundColor: theme.colors.accent + '33', color: theme.colors.primary }]}>
                  {item.format}
                </Text>
                <Text style={[styles.chip, { backgroundColor: theme.colors.primary + '11', color: theme.colors.primary }]}>
                  {item.handicapSystem}
                </Text>
              </View>
              <Text style={[styles.cardMeta, { color: theme.mutedText }]}>
                {item.seasonCount} season{item.seasonCount !== 1 ? 's' : ''}
                {item.duesCents > 0 ? `  ·  $${(item.duesCents / 100).toFixed(0)} dues` : ''}
              </Text>
            </Pressable>
          )}
        />
      </AsyncSection>

      <FormModal
        visible={showCreate}
        title="New League"
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
        submitLabel="Create"
        loading={saving}
      >
            <Text style={[styles.label, { color: theme.mutedText }]}>League Name</Text>
            <TextInput
              style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
              value={name} onChangeText={setName} placeholder="Tuesday Night League"
              placeholderTextColor={theme.colors.accent}
            />

            <Text style={[styles.label, { color: theme.mutedText }]}>Format</Text>
            <View style={styles.segRow}>
              {FORMATS.map(f => (
                <Pressable
                  key={f}
                  style={[styles.seg, { borderColor: theme.colors.accent }, format === f && { backgroundColor: theme.colors.primary }]}
                  onPress={() => setFormat(f)}
                >
                  <Text style={{ color: format === f ? theme.colors.surface : theme.colors.primary, fontSize: fontSize.xs }}>
                    {f}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: theme.mutedText }]}>Handicap System</Text>
            <View style={styles.segRow}>
              {HC_SYSTEMS.map(h => (
                <Pressable
                  key={h}
                  style={[styles.seg, { borderColor: theme.colors.accent }, hcSystem === h && { backgroundColor: theme.colors.primary }]}
                  onPress={() => setHcSystem(h)}
                >
                  <Text style={{ color: hcSystem === h ? theme.colors.surface : theme.colors.primary, fontSize: fontSize.xs }}>
                    {h}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: spacing[2] }}>
                <Text style={[styles.label, { color: theme.mutedText }]}>HC Cap</Text>
                <TextInput
                  style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                  value={hcCap} onChangeText={setHcCap} keyboardType="numeric"
                  placeholderTextColor={theme.colors.accent}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: theme.mutedText }]}>Dues ($)</Text>
                <MoneyInput
                  style={[styles.input, { color: theme.colors.primary, borderColor: theme.colors.accent }]}
                  value={dues} onChangeText={setDues} placeholder="$0.00"
                  placeholderTextColor={theme.colors.accent}
                />
              </View>
            </View>

      </FormModal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing[5], borderBottomWidth: 1 },
  title:        { fontSize: fontSize.title, fontWeight: '700' },
  list:         { padding: spacing[3] },
  card:         { borderRadius: radius.lg, padding: spacing[4], borderWidth: 1, marginBottom: spacing[2] },
  cardTitle:    { fontSize: fontSize.xl, fontWeight: '600', marginBottom: spacing[2] },
  cardRow:      { flexDirection: 'row', gap: spacing[2], marginBottom: spacing[2] },
  chip:         { fontSize: fontSize.xxs, fontWeight: '600', paddingHorizontal: spacing[2], paddingVertical: spacing[1], borderRadius: radius.lg },
  cardMeta:     { fontSize: fontSize.xs },
  label:        { fontSize: fontSize.xs, fontWeight: '600', marginTop: spacing[3], marginBottom: spacing[1] },
  input:        { borderWidth: 1, borderRadius: radius.md, padding: spacing[3], fontSize: fontSize.md },
  segRow:       { flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] },
  seg:          { flex: 1, paddingVertical: spacing[2], borderRadius: radius.md, borderWidth: 1, alignItems: 'center' },
  row:          { flexDirection: 'row', marginTop: spacing[1] },
});
