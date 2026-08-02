/**
 * "You won" + self-checkout.
 *
 * Closing a lot no longer charges the winner — they settle at the auction
 * checkout desk when they collect the item. This screen is what makes that
 * bearable: the golfer sees what they won and what they owe, and can confirm
 * their saved card here so the desk visit is only a handover.
 *
 * Card only. Cash and check are things staff physically receive, so they can
 * never be self-serviced.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { useSession } from '@/lib/session';
import { fetchMyCheckout, confirmMyCheckout, type CheckoutCartDto } from '@/lib/api';

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AuctionCheckoutScreen() {
  const theme    = useTheme();
  const router   = useRouter();
  const { session } = useSession();

  const [cart,      setCart]      = useState<CheckoutCartDto | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [paying,    setPaying]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [paidJust,  setPaidJust]  = useState(false);

  const playerId     = session?.player.id;
  const sessionToken = session?.sessionToken;

  const load = useCallback(async () => {
    if (!playerId || !sessionToken) { setLoading(false); return; }
    setError(null);
    try { setCart(await fetchMyCheckout(playerId, sessionToken)); }
    catch (e: any) { setError(e.message ?? 'Could not load your winnings.'); }
    finally { setLoading(false); }
  }, [playerId, sessionToken]);

  useEffect(() => { load(); }, [load]);

  async function handlePay() {
    if (!playerId || !sessionToken || !cart) return;

    // Nothing to charge against — send them to card setup rather than firing a
    // request we already know the server will reject.
    if (!cart.hasPaymentMethod) {
      router.push('/payment-setup');
      return;
    }

    setPaying(true); setError(null);
    try {
      const res = await confirmMyCheckout(playerId, sessionToken);
      setCart(res.cart);
      if (res.failed > 0) {
        setError(
          'That card was declined. Try another card, or settle at the auction '
          + 'checkout desk.');
      } else {
        setPaidJust(true);
      }
    } catch (e: any) {
      const msg = String(e.message ?? '');
      if (msg.includes('NO_PAYMENT_METHOD')) {
        router.push('/payment-setup');
      } else {
        setError(msg || 'Payment failed. You can also settle at the checkout desk.');
      }
    } finally {
      setPaying(false);
    }
  }

  if (!session) return (
    <View style={styles.center}><Text style={{ color: '#888' }}>No active event session.</Text></View>
  );

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
  );

  const won = cart?.lines ?? [];

  return (
    <ScrollView
      style={[styles.page, { backgroundColor: theme.pageBackground }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
    >
      <Text style={[styles.title, { color: theme.colors.primary }]}>
        {won.length === 0 ? 'Auction checkout' : `You won ${won.length} item${won.length === 1 ? '' : 's'}!`}
      </Text>

      {won.length === 0 ? (
        <Text style={styles.empty}>
          You haven't won anything yet. Winners appear here once the auction closes.
        </Text>
      ) : (
        <>
          {won.map(line => (
            <View key={line.winnerId} style={styles.line}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineTitle}>{line.itemTitle}</Text>
                <Text style={styles.lineMeta}>
                  {line.chargeStatus === 'Succeeded'
                    ? `Paid${line.settlementMethod ? ` · ${line.settlementMethod.toLowerCase()}` : ''}`
                    : line.chargeStatus === 'Waived' ? 'Nothing to pay'
                    : line.chargeStatus === 'Failed' ? 'Payment failed'
                    : 'Unpaid'}
                  {line.pickedUpAt ? ' · collected' : ''}
                </Text>
              </View>
              <Text style={styles.lineAmount}>{usd(line.amountCents)}</Text>
            </View>
          ))}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              {cart!.outstandingCents > 0 ? 'You owe' : 'Total'}
            </Text>
            <Text style={[styles.totalValue, { color: theme.colors.primary }]}>
              {usd(cart!.outstandingCents > 0 ? cart!.outstandingCents : cart!.totalCents)}
            </Text>
          </View>

          {error && <Text style={styles.error}>⚠️ {error}</Text>}

          {cart!.outstandingCents > 0 ? (
            <>
              <Pressable
                style={[styles.payBtn, { backgroundColor: theme.colors.action }, paying && { opacity: 0.6 }]}
                onPress={handlePay}
                disabled={paying}
                accessibilityRole="button"
              >
                {paying
                  ? <ActivityIndicator color="#fff" />
                  : (
                    <Text style={styles.payBtnText}>
                      {cart!.hasPaymentMethod
                        ? `Confirm & pay ${usd(cart!.outstandingCents)}`
                        : 'Add a card to pay'}
                    </Text>
                  )}
              </Pressable>
              <Text style={styles.deskNote}>
                Or settle at the auction checkout desk — cash and check are welcome there.
              </Text>
            </>
          ) : (
            <Text style={styles.paidNote}>
              {paidJust ? '✓ Paid — thank you!' : '✓ Paid in full.'}
              {won.some(l => !l.pickedUpAt)
                ? ' Collect your items at the auction checkout desk.'
                : ' Everything has been collected.'}
            </Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page:    { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: 22, fontWeight: '800', marginBottom: 16 },
  empty:   { color: '#888', fontSize: 15, lineHeight: 21 },

  line:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)' },
  lineTitle:  { fontSize: 16, fontWeight: '700', color: '#111' },
  lineMeta:   { fontSize: 12, color: '#777', marginTop: 2 },
  lineAmount: { fontSize: 16, fontWeight: '700', color: '#111' },

  totalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  totalLabel: { fontSize: 15, fontWeight: '600', color: '#374151' },
  totalValue: { fontSize: 24, fontWeight: '800' },

  payBtn:     { marginTop: 18, paddingVertical: 15, borderRadius: 10, alignItems: 'center' },
  payBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  deskNote:   { color: '#777', fontSize: 12, textAlign: 'center', marginTop: 10, lineHeight: 17 },
  paidNote:   { color: '#059669', fontSize: 15, fontWeight: '600', marginTop: 18, lineHeight: 21 },
  error:      { color: '#c0392b', fontSize: 13, marginTop: 12, lineHeight: 18 },
});
