import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { eventsApi, type FundraisingTotals } from '@/lib/api';

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default function FundraisingScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const [totals,   setTotals]   = useState<FundraisingTotals | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      setTotals(await eventsApi.getFundraising(id));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load fundraising data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;
  }

  const feeProgress = totals && totals.teamsTotal > 0
    ? totals.teamsPaid / totals.teamsTotal
    : 0;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.primary }]}>Fundraising</Text>
        <Pressable
          style={[styles.refreshBtn, { borderColor: theme.colors.action }]}
          onPress={() => load(true)}
          disabled={refreshing}
        >
          {refreshing
            ? <ActivityIndicator size="small" color={theme.colors.action} />
            : <Text style={[styles.refreshText, { color: theme.colors.action }]}>Refresh</Text>}
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
      )}

      {totals && (
        <>
          {/* Grand total */}
          <View style={[styles.grandTotal, { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.grandTotalLabel, { color: theme.colors.surface }]}>Total Raised</Text>
            <Text style={[styles.grandTotalAmount, { color: theme.colors.surface }]}>
              {formatCurrency(totals.grandTotalCents)}
            </Text>
          </View>

          {/* Breakdown cards */}
          <View style={styles.breakdown}>
            <View style={[styles.breakdownCard, { borderColor: '#e8e8e8' }]}>
              <Text style={[styles.breakdownLabel, { color: theme.colors.accent }]}>Entry Fees</Text>
              <Text style={[styles.breakdownAmount, { color: theme.colors.primary }]}>
                {formatCurrency(totals.entryFeesCents)}
              </Text>
            </View>
            <View style={[styles.breakdownCard, { borderColor: '#e8e8e8' }]}>
              <Text style={[styles.breakdownLabel, { color: theme.colors.accent }]}>Donations</Text>
              <Text style={[styles.breakdownAmount, { color: theme.colors.primary }]}>
                {formatCurrency(totals.donationsCents)}
              </Text>
            </View>
          </View>

          {/* Entry fee progress */}
          <View style={[styles.section, { borderColor: '#e8e8e8' }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Entry Fee Collection</Text>
            <View style={styles.progressRow}>
              <Text style={[styles.progressLabel, { color: theme.colors.accent }]}>
                {totals.teamsPaid} of {totals.teamsTotal} teams paid
              </Text>
              <Text style={[styles.progressPct, { color: theme.colors.primary }]}>
                {Math.round(feeProgress * 100)}%
              </Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: '#e8e8e8' }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: theme.colors.action,
                    width: `${Math.round(feeProgress * 100)}%` as any,
                  },
                ]}
              />
            </View>
            <Text style={[styles.remainingText, { color: theme.colors.accent }]}>
              {totals.teamsTotal - totals.teamsPaid} team{totals.teamsTotal - totals.teamsPaid !== 1 ? 's' : ''} outstanding
            </Text>
          </View>

          {/* Donation count */}
          <View style={[styles.section, { borderColor: '#e8e8e8' }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Donations</Text>
            <View style={styles.donationStat}>
              <Text style={[styles.donationCount, { color: theme.colors.primary }]}>
                {totals.donationCount}
              </Text>
              <Text style={[styles.donationLabel, { color: theme.colors.accent }]}>
                donation{totals.donationCount !== 1 ? 's' : ''} received
              </Text>
            </View>
            {totals.donationCount > 0 && (
              <Text style={[styles.avgDonation, { color: theme.colors.accent }]}>
                Avg: {formatCurrency(Math.round(totals.donationsCents / totals.donationCount))} per donation
              </Text>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page:    { flex: 1 },
  content: { padding: 28, gap: 16 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:   { fontSize: 22, fontWeight: '800' },
  refreshBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 80,
    alignItems: 'center',
  },
  refreshText: { fontSize: 14, fontWeight: '600' },
  errorBox: {
    backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12,
    borderLeftWidth: 3, borderLeftColor: '#e74c3c',
  },
  errorText: { color: '#c0392b', fontSize: 14 },
  grandTotal: {
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
  },
  grandTotalLabel: { fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  grandTotalAmount: { fontSize: 48, fontWeight: '800', marginTop: 8 },
  breakdown: {
    flexDirection: 'row',
    gap: 12,
  },
  breakdownCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  breakdownLabel:  { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  breakdownAmount: { fontSize: 24, fontWeight: '800' },
  section: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 18,
    backgroundColor: '#fff',
    gap: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: 14 },
  progressPct: { fontSize: 14, fontWeight: '700' },
  progressTrack: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  remainingText: { fontSize: 13 },
  donationStat: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  donationCount: { fontSize: 36, fontWeight: '800' },
  donationLabel: { fontSize: 16 },
  avgDonation:   { fontSize: 13 },
});
