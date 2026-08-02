/**
 * Auction checkout desk.
 *
 * Closing a lot no longer charges anyone — winners settle here when they collect
 * their item. Staff look a winner up, take payment (their saved card, or cash or
 * check handed over at the desk), and mark the items as collected.
 *
 * Payment and handover are deliberately separate actions, because they come
 * apart at a real desk: someone pays in the app and collects an hour later, or
 * takes the item now and settles on the way out.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, TextInput, ActivityIndicator, ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import {
  checkoutApi,
  type CheckoutDeskRow, type CheckoutCart, type SettlementMethod,
} from '@/lib/api';
import { useResponsive } from '@/lib/responsive';
import { confirmAction } from '@/lib/confirmAction';
import { formatCents, settleCopy } from '@/lib/auctionEnd';
import { AddCardModal, cardCaptureEnabled } from '@/components/AddCardModal';

const METHODS: SettlementMethod[] = ['Card', 'Cash', 'Check'];

export default function AuctionCheckoutScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { isMobile, pagePadding } = useResponsive();

  const [rows,    setRows]    = useState<CheckoutDeskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [search,  setSearch]  = useState('');

  const [cart,      setCart]      = useState<CheckoutCart | null>(null);
  const [cartBusy,  setCartBusy]  = useState(false);
  const [notice,    setNotice]    = useState<string | null>(null);
  const [pickUpToo, setPickUpToo] = useState(true);
  const [showAddCard, setShowAddCard] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await checkoutApi.getDesk(eventId)); }
    catch (e: any) { setError(e.message ?? 'Failed to load the checkout queue.'); }
    finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  async function openCart(playerId: string) {
    setCartBusy(true); setError(null); setNotice(null);
    try { setCart(await checkoutApi.getCart(eventId, playerId)); }
    catch (e: any) { setError(e.message ?? 'Could not load that cart.'); }
    finally { setCartBusy(false); }
  }

  function handleSettle(method: SettlementMethod) {
    if (!cart || cart.outstandingCents === 0) return;

    // Card with nothing on file will fail at Stripe. Say so before charging
    // rather than letting the desk discover it as a failure.
    if (method === 'Card' && !cart.hasPaymentMethod) {
      setError(
        `${cart.playerName} has no card on file. Take cash or check, or have them `
        + 'add a card in the app.');
      return;
    }

    const copy = settleCopy(cart.playerName, cart.outstandingCents, method, pickUpToo);
    confirmAction(copy.title, copy.message, async () => {
      setCartBusy(true); setError(null); setNotice(null);
      try {
        const res = await checkoutApi.settle(eventId, cart.playerId, method, pickUpToo);
        setCart(res.cart);
        setNotice(
          res.failed > 0
            ? `${res.failed} charge${res.failed === 1 ? '' : 's'} failed — `
              + `${formatCents(res.cart.outstandingCents)} still outstanding.`
            : `Took ${formatCents(res.settledCents)} from ${res.cart.playerName}.`);
        await load();
      } catch (e: any) {
        setError(e.message ?? 'Could not settle up.');
      } finally {
        setCartBusy(false);
      }
    }, copy.confirmText);
  }

  async function handlePickup(winnerId: string) {
    if (!cart) return;
    setCartBusy(true); setError(null);
    try {
      await checkoutApi.markPickedUp(winnerId);
      setCart(await checkoutApi.getCart(eventId, cart.playerId));
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Could not mark that item as collected.');
    } finally {
      setCartBusy(false);
    }
  }

  const term    = search.trim().toLowerCase();
  const visible = term
    ? rows.filter(r =>
        r.playerName.toLowerCase().includes(term) ||
        r.playerEmail.toLowerCase().includes(term))
    : rows;

  const owed      = rows.reduce((s, r) => s + r.outstandingCents, 0);
  const collected = rows.reduce((s, r) => s + r.settledCents, 0);
  const remaining = rows.filter(r => !r.isComplete).length;

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
  );

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: pagePadding }}>
      <Text style={[styles.title, { color: theme.colors.primary }]}>Auction Checkout</Text>
      <Text style={[styles.sub, { color: theme.mutedText }]}>
        Winners settle up and collect their items here. Fund-a-Need pledges are
        charged when the auction closes and never appear in this queue.
      </Text>

      {/* Settlement report — the numbers the organizer works the room against. */}
      <View style={[styles.statsRow, isMobile && styles.statsWrap]}>
        {[
          { label: 'Still to settle', value: String(remaining) },
          { label: 'Outstanding',     value: formatCents(owed) },
          { label: 'Collected',       value: formatCents(collected) },
        ].map(s => (
          <View key={s.label} style={styles.statCard}>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: theme.mutedText }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {error && (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {notice && (
        <View style={styles.noticeBox} accessibilityRole="alert">
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      )}

      <TextInput
        style={styles.search}
        placeholder="Search by name or email…"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />

      <FlatList
        data={visible}
        scrollEnabled={false}
        keyExtractor={r => r.playerId}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.mutedText }]}>
            {rows.length === 0
              ? 'Nobody has won a lot yet. Winners appear here once the auction closes.'
              : 'No winner matches that search.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, item.isComplete && styles.rowDone]}
            onPress={() => openCart(item.playerId)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{item.playerName}</Text>
              <Text style={[styles.rowMeta, { color: theme.mutedText }]}>
                {item.itemsWon} item{item.itemsWon === 1 ? '' : 's'} ·{' '}
                {item.itemsPickedUp}/{item.itemsWon} collected
                {!item.hasPaymentMethod && ' · no card on file'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[
                styles.rowAmount,
                { color: item.outstandingCents > 0 ? '#b45309' : '#059669' },
              ]}>
                {item.outstandingCents > 0 ? formatCents(item.outstandingCents) : 'Paid'}
              </Text>
              {item.isComplete && <Text style={styles.rowDoneTag}>Done</Text>}
            </View>
          </Pressable>
        )}
      />

      {/* Cart — inline rather than a modal so the desk can keep the queue in view. */}
      {cart && (
        <View style={styles.cart}>
          <View style={styles.cartHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cartName, { color: theme.colors.primary }]}>{cart.playerName}</Text>
              <Text style={[styles.rowMeta, { color: theme.mutedText }]}>{cart.playerEmail}</Text>
            </View>
            <Pressable onPress={() => { setCart(null); setNotice(null); }}>
              <Text style={{ color: theme.mutedText, fontSize: 20 }}>✕</Text>
            </Pressable>
          </View>

          {cart.lines.map(line => (
            <View key={line.winnerId} style={styles.line}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineTitle}>{line.itemTitle}</Text>
                <Text style={[styles.rowMeta, { color: theme.mutedText }]}>
                  {line.chargeStatus === 'Succeeded'
                    ? `Paid${line.settlementMethod ? ` · ${line.settlementMethod.toLowerCase()}` : ''}`
                    : line.chargeStatus === 'Waived' ? 'Waived'
                    : line.chargeStatus === 'Failed' ? 'Charge failed — still owed'
                    : 'Unpaid'}
                  {line.pickedUpAt ? ' · collected' : ''}
                </Text>
              </View>
              <Text style={styles.lineAmount}>{formatCents(line.amountCents)}</Text>
              {!line.pickedUpAt && (
                <Pressable
                  style={styles.pickupBtn}
                  onPress={() => handlePickup(line.winnerId)}
                  disabled={cartBusy}
                >
                  <Text style={styles.pickupBtnText}>Hand over</Text>
                </Pressable>
              )}
            </View>
          ))}

          <View style={styles.totals}>
            <Text style={styles.totalLabel}>Outstanding</Text>
            <Text style={[styles.totalValue, { color: theme.colors.primary }]}>
              {formatCents(cart.outstandingCents)}
            </Text>
          </View>

          {cart.outstandingCents > 0 ? (
            <>
              <Pressable
                style={styles.checkRow}
                onPress={() => setPickUpToo(v => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: pickUpToo }}
              >
                <View style={[styles.checkbox, pickUpToo && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}>
                  {pickUpToo && <Text style={styles.checkMark}>✓</Text>}
                </View>
                <Text style={styles.checkLabel}>Also mark everything as collected</Text>
              </Pressable>

              <View style={styles.methodRow}>
                {METHODS.map(m => (
                  <Pressable
                    key={m}
                    style={[styles.methodBtn, { backgroundColor: theme.colors.primary }, cartBusy && { opacity: 0.6 }]}
                    onPress={() => handleSettle(m)}
                    disabled={cartBusy}
                  >
                    <Text style={styles.methodBtnText}>
                      {m === 'Card' ? 'Charge card' : `Record ${m.toLowerCase()}`}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {!cart.hasPaymentMethod && (
                <>
                  <Text style={styles.cartWarning}>
                    No card on file — check-in lets a golfer bid without saving one.
                    Take cash or check, or add their card here.
                  </Text>
                  {cardCaptureEnabled && (
                    <Pressable
                      style={styles.addCardBtn}
                      onPress={() => setShowAddCard(true)}
                      disabled={cartBusy}
                    >
                      <Text style={styles.addCardText}>+ Add a card for {cart.playerName}</Text>
                    </Pressable>
                  )}
                </>
              )}
            </>
          ) : (
            <Text style={styles.settledNote}>Paid in full.</Text>
          )}

          {cartBusy && <ActivityIndicator style={{ marginTop: 10 }} color={theme.colors.primary} />}
        </View>
      )}

      {cart && (
        <AddCardModal
          visible={showAddCard}
          eventId={eventId}
          playerId={cart.playerId}
          playerName={cart.playerName}
          onClose={() => setShowAddCard(false)}
          onSaved={async () => {
            setNotice(`Card saved for ${cart.playerName}.`);
            setCart(await checkoutApi.getCart(eventId, cart.playerId));
            await load();
          }}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page:   { flex: 1, backgroundColor: '#f7f7f8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title:  { fontSize: 20, fontWeight: '800' },
  sub:    { fontSize: 13, marginTop: 4, marginBottom: 14, lineHeight: 18 },

  statsRow:  { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statsWrap: { flexWrap: 'wrap' },
  statCard:  { flex: 1, minWidth: 110, backgroundColor: '#fff', borderRadius: 10, padding: 12 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 2 },

  search: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#fff',
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 12,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
  },
  rowDone:    { opacity: 0.6 },
  rowName:    { fontSize: 15, fontWeight: '700', color: '#111' },
  rowMeta:    { fontSize: 12, marginTop: 2 },
  rowAmount:  { fontSize: 15, fontWeight: '800' },
  rowDoneTag: { fontSize: 11, color: '#059669', fontWeight: '700', marginTop: 2 },
  empty:      { textAlign: 'center', paddingVertical: 28, fontSize: 14 },

  cart:       { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 16 },
  cartHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  cartName:   { fontSize: 17, fontWeight: '800' },
  line:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  lineTitle:  { fontSize: 14, fontWeight: '600', color: '#111' },
  lineAmount: { fontSize: 14, fontWeight: '700', color: '#111' },
  pickupBtn:  { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#6b7280' },
  pickupBtnText: { fontSize: 12, fontWeight: '600', color: '#374151' },

  totals:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, marginTop: 4, borderTopWidth: 2, borderTopColor: '#eee' },
  totalLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  totalValue: { fontSize: 20, fontWeight: '800' },

  checkRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  checkbox:  { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#bbb', alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '800' },
  checkLabel:{ fontSize: 13, color: '#374151' },

  methodRow:     { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  methodBtn:     { flex: 1, minWidth: 120, paddingVertical: 11, borderRadius: 8, alignItems: 'center' },
  methodBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  cartWarning: {
    color: '#92400e', backgroundColor: '#fffbeb',
    borderLeftWidth: 3, borderLeftColor: '#f59e0b',
    fontSize: 12, lineHeight: 17, marginTop: 10,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 4,
  },
  settledNote: { color: '#059669', fontSize: 14, fontWeight: '600', marginTop: 12 },
  addCardBtn:  { marginTop: 10, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#6b7280', alignItems: 'center' },
  addCardText: { fontSize: 13, fontWeight: '600', color: '#374151' },

  errorBox:  { backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
  errorText: { color: '#c0392b', fontSize: 14 },
  noticeBox: { backgroundColor: '#ecfdf5', borderRadius: 8, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#10b981' },
  noticeText:{ color: '#065f46', fontSize: 14 },
});
