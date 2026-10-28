import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useEventDetail } from '@/lib/eventContext';
import { useTheme, useClasses } from '@gfp/ui';
import { formatCents } from '@gfp/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import { testDataApi, auctionApi } from '@/lib/api';
import { eventKeys, useFailedCharges, useFundraising } from '@/lib/queries';
import { TestDataWarningModal } from '@/components/TestDataWarningModal';
import { fontSize, radius, spacing, status } from '@gfp/theme';

const formatCurrency = formatCents;

export default function FundraisingScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();
  const c        = useClasses();

  const { event, refresh } = useEventDetail();
  const client       = useQueryClient();
  const totalsQuery  = useFundraising(id);
  const chargesQuery = useFailedCharges(id);
  const totals        = totalsQuery.data ?? null;
  const failedCharges = chargesQuery.data ?? [];
  const loading       = totalsQuery.isPending;
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError
    ?? (totalsQuery.error ? (totalsQuery.error.message || 'Failed to load fundraising data.') : null);
  const [chargeWorking, setChargeWorking] = useState<string | null>(null);
  const [refreshing,    setRefreshing]    = useState(false);
  const [clearing,      setClearing]      = useState(false);
  const [showClearWarning, setShowClearWarning] = useState(false);

  // After a change: refetch this screen's numbers, mark the event's other
  // lists stale (a recharge settles a lot; clearing test data removes teams,
  // players and bids), and re-pull the event so the test-mode bar and counts
  // update.
  async function load() {
    setRefreshing(true);
    setError(null);
    try {
      // Invalidating refetches the queries on screen and leaves the rest for
      // their next visit.
      await Promise.all([client.invalidateQueries({ queryKey: eventKeys.all(id) }), refresh()]);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load fundraising data.');
    } finally {
      setRefreshing(false);
    }
  }

  async function recharge(winnerId: string) {
    setChargeWorking(winnerId);
    try {
      await auctionApi.rechargeWinner(winnerId);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Recharge failed.');
    } finally {
      setChargeWorking(null);
    }
  }

  async function waive(winnerId: string) {
    setChargeWorking(winnerId);
    try {
      await auctionApi.waiveWinner(winnerId);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Waive failed.');
    } finally {
      setChargeWorking(null);
    }
  }

  async function handleClearTestData() {
    setShowClearWarning(false);
    setClearing(true); setError(null);
    try {
      await testDataApi.clearAll(id);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Failed to clear test data.');
    } finally {
      setClearing(false);
    }
  }

  if (loading) {
    return <View style={c.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;
  }

  // Entry fees are per golfer — progress tracks paid golfers, not teams.
  const feeProgress = totals && totals.playersTotal > 0
    ? totals.playersPaid / totals.playersTotal
    : 0;

  return (
    <ScrollView style={c.page} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={c.title}>Fundraising</Text>
        <View style={styles.headerActions}>
          {(event?.isTestMode || (event?.testDataSummary?.totalCount ?? 0) > 0) && (
            <Pressable
              style={[styles.clearTestBtn, clearing && { opacity: 0.6 }]}
              onPress={() => setShowClearWarning(true)}
              disabled={clearing || refreshing}
            >
              {clearing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.clearTestText}>Clear Test Data</Text>}
            </Pressable>
          )}
          <Pressable
            style={[styles.refreshBtn, { borderColor: theme.colors.action }]}
            onPress={() => load()}
            disabled={refreshing || clearing}
          >
            {refreshing
              ? <ActivityIndicator size="small" color={theme.colors.action} />
              : <Text style={[styles.refreshText, { color: theme.colors.action }]}>Refresh</Text>}
          </Pressable>
        </View>
      </View>

      <TestDataWarningModal
        visible={showClearWarning}
        title="Clear All Test Data?"
        description={`This will permanently delete all ${event?.testDataSummary?.totalCount ?? 0} test record(s) including test teams, players, scores, donations, and auction bids. This cannot be undone.`}
        confirmLabel="Clear Test Data"
        loading={clearing}
        onConfirm={handleClearTestData}
        onCancel={() => setShowClearWarning(false)}
      />

      {error && (
        <View style={[c.errorBox, styles.errorBox]}>
          <Text style={c.errorText}>{error}</Text>
          <Pressable onPress={() => load()} style={{ marginTop: spacing[2] }}>
            <Text style={{ color: status.dangerText, fontSize: fontSize.sm, fontWeight: '600' }}>Retry</Text>
          </Pressable>
        </View>
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

          {/* Breakdown cards — one wrapping grid rather than fixed pairs, so the
              streams stay in step regardless of how many there are. */}
          <View style={styles.breakdown}>
            {([
              ['Entry Fees',      totals.entryFeesCents],
              ['Donations',       totals.donationsCents],
              ['Sponsors',        totals.sponsorAmountCents],
              ['Hole Challenges', totals.challengeAmountCents],
              ['Auction',         totals.auctionCents],
            ] as [string, number][]).map(([label, cents]) => (
              <View key={label} style={[styles.breakdownCard, { borderColor: '#e8e8e8' }]}>
                <Text style={[styles.breakdownLabel, { color: theme.mutedText }]}>{label}</Text>
                <Text style={[styles.breakdownAmount, { color: theme.colors.primary }]}>
                  {formatCurrency(cents)}
                </Text>
              </View>
            ))}
          </View>

          {/* Entry fee progress */}
          <View style={[styles.section, { borderColor: '#e8e8e8' }]}>
            <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Entry Fee Collection</Text>
            <View style={styles.progressRow}>
              <Text style={[styles.progressLabel, { color: theme.mutedText }]}>
                {totals.playersPaid} of {totals.playersTotal} golfers paid
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
            <Text style={[styles.remainingText, { color: theme.mutedText }]}>
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
              <Text style={[styles.donationLabel, { color: theme.mutedText }]}>
                donation{totals.donationCount !== 1 ? 's' : ''} received
              </Text>
            </View>
            {totals.donationCount > 0 && (
              <Text style={[styles.avgDonation, { color: theme.mutedText }]}>
                Avg: {formatCurrency(Math.round(totals.donationsCents / totals.donationCount))} per donation
              </Text>
            )}
          </View>

          {/* Auction detail — only worth the space once an auction exists. The
              grand total counts money still owed, so say how much that is
              rather than leaving the organizer to assume it is all banked. */}
          {(totals.auctionCents > 0 || totals.auctionItemsSold > 0) && (
            <View style={[styles.section, { borderColor: '#e8e8e8' }]}>
              <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>Auction</Text>
              <View style={styles.donationStat}>
                <Text style={[styles.donationCount, { color: theme.colors.primary }]}>
                  {totals.auctionItemsSold}
                </Text>
                <Text style={[styles.donationLabel, { color: theme.mutedText }]}>
                  item{totals.auctionItemsSold !== 1 ? 's' : ''} sold
                </Text>
              </View>
              {totals.auctionUncollectedCents > 0 && (
                <Text style={[styles.avgDonation, { color: theme.mutedText }]}>
                  {formatCurrency(totals.auctionUncollectedCents)} not yet charged
                </Text>
              )}
              {totals.auctionCents > 0 && totals.auctionItemsSold === 0 && (
                <Text style={[styles.avgDonation, { color: theme.mutedText }]}>
                  Bidding is still open — nothing has been charged yet.
                </Text>
              )}
            </View>
          )}

          {/* Failed auction charges */}
          {failedCharges.length > 0 && (
            <View style={[styles.section, { borderColor: status.danger, borderWidth: 2 }]}>
              <Text style={[styles.sectionTitle, { color: status.danger }]}>
                Failed Charges ({failedCharges.length})
              </Text>
              <Text style={{ fontSize: fontSize.sm, color: '#666', marginBottom: spacing[2] }}>
                These auction winners were not charged successfully. Re-charge or waive each below.
              </Text>
              {failedCharges.map(fc => (
                <View key={fc.winnerId} style={styles.failedChargeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', fontSize: fontSize.md, color: '#333' }}>{fc.itemTitle}</Text>
                    <Text style={{ fontSize: fontSize.sm, color: '#666' }}>
                      {fc.playerName} · {fc.playerEmail}
                    </Text>
                    <Text style={{ fontSize: fontSize.sm, color: status.danger, fontWeight: '600' }}>
                      {formatCurrency(fc.amountCents)}
                    </Text>
                  </View>
                  <View style={{ gap: spacing[2] }}>
                    <Pressable
                      style={[styles.chargeBtn, { backgroundColor: theme.colors.primary }]}
                      onPress={() => recharge(fc.winnerId)}
                      disabled={chargeWorking === fc.winnerId}
                    >
                      {chargeWorking === fc.winnerId
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.chargeBtnText}>Re-charge</Text>}
                    </Pressable>
                    <Pressable
                      style={[styles.chargeBtn, { backgroundColor: '#95a5a6' }]}
                      onPress={() => waive(fc.winnerId)}
                      disabled={chargeWorking === fc.winnerId}
                    >
                      <Text style={styles.chargeBtnText}>Waive</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing[8], gap: spacing[4] },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', gap: spacing[2], alignItems: 'center' },
  clearTestBtn:  { backgroundColor: status.danger, borderRadius: radius.md, paddingHorizontal: spacing[4], paddingVertical: spacing[2], alignItems: 'center' },
  clearTestText: { fontSize: fontSize.sm, fontWeight: '700', color: '#fff' },
  refreshBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    minWidth: 80,
    alignItems: 'center',
  },
  refreshText: { fontSize: fontSize.md, fontWeight: '600' },
  errorBox: { marginBottom: 0 },   // the parent's gap spaces it
  grandTotal: {
    borderRadius: radius.xl,
    padding: spacing[8],
    alignItems: 'center',
  },
  grandTotalLabel: { fontSize: fontSize.md, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  grandTotalAmount: { fontSize: 48, fontWeight: '800', marginTop: spacing[2] },
  breakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  breakdownCard: {
    // Grow to share the row, but never narrower than this — five cards sit in
    // one row on a desktop window and wrap to two/three on a narrow one.
    flexGrow: 1,
    flexBasis: 170,
    minWidth: 170,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing[5],
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  breakdownLabel:  { fontSize: fontSize.sm, fontWeight: '500', marginBottom: spacing[2] },
  breakdownAmount: { fontSize: fontSize.title, fontWeight: '800' },
  section: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing[5],
    backgroundColor: '#fff',
    gap: spacing[2],
  },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing[1] },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: fontSize.md },
  progressPct: { fontSize: fontSize.md, fontWeight: '700' },
  progressTrack: {
    height: 12,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.sm,
  },
  remainingText: { fontSize: fontSize.sm },
  donationStat: { flexDirection: 'row', alignItems: 'baseline', gap: spacing[2] },
  donationCount: { fontSize: 36, fontWeight: '800' },
  donationLabel: { fontSize: fontSize.xl },
  avgDonation:   { fontSize: fontSize.sm },
  failedChargeRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[3],
    paddingVertical: spacing[3],
    borderTopWidth: 1, borderTopColor: '#f5e0e0',
  },
  chargeBtn: {
    paddingHorizontal: spacing[3], paddingVertical: spacing[2],
    borderRadius: radius.md, alignItems: 'center', minWidth: 90,
  },
  chargeBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
});
