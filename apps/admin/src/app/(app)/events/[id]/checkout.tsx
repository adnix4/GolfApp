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

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { formatCents, settleCopy, paidLabel, CHECK_NUMBER_INPUT } from '@/lib/auctionEnd';
import { AddCardModal, cardCaptureEnabled } from '@/components/AddCardModal';

const METHODS: SettlementMethod[] = ['Card', 'Cash', 'Check'];

/** The desk's working order — unfinished first, then biggest balance (mirrors the API). */
function deskOrder(a: CheckoutDeskRow, b: CheckoutDeskRow): number {
  if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;
  if (a.outstandingCents !== b.outstandingCents) return b.outstandingCents - a.outstandingCents;
  return a.playerName.localeCompare(b.playerName);
}

/** An item (not a pledge) still waiting to be handed over. */
function hasItemsToHandOver(cart: CheckoutCart): boolean {
  return cart.lines.some(l => !l.isPledge && !l.pickedUpAt);
}

export default function AuctionCheckoutScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { isMobile, pagePadding } = useResponsive();

  const [rows,    setRows]    = useState<CheckoutDeskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [search,  setSearch]  = useState('');

  // The open row is tracked apart from its cart so it can expand (with a
  // spinner) the moment it is clicked, before the cart has loaded.
  const [openPlayerId, setOpenPlayerId] = useState<string | null>(null);
  const [cart,      setCart]      = useState<CheckoutCart | null>(null);
  const [cartBusy,  setCartBusy]  = useState(false);
  // Feedback about the open cart shows inside it, next to the buttons.
  const [cartError, setCartError] = useState<string | null>(null);
  const [notice,    setNotice]    = useState<string | null>(null);
  const [pickUpToo, setPickUpToo] = useState(true);
  const [showAddCard, setShowAddCard] = useState(false);

  // toggleCart reads the open row after an await, when its closure is stale.
  const openRef = useRef<string | null>(null);
  openRef.current = openPlayerId;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await checkoutApi.getDesk(eventId)); }
    catch (e: any) { setError(e.message ?? 'Failed to load the checkout queue.'); }
    finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  /**
   * Re-pulls the queue after a change in the open cart — quietly (no
   * full-page spinner, which would reset the scroll) and without re-sorting,
   * so the row the desk is working on stays where they clicked it. The usual
   * order (unfinished first) returns when the cart closes.
   */
  async function refreshInPlace() {
    try {
      const fresh = await checkoutApi.getDesk(eventId);
      setRows(prev => {
        const byId = new Map(fresh.map(r => [r.playerId, r]));
        const kept = prev.filter(r => byId.has(r.playerId)).map(r => byId.get(r.playerId)!);
        const added = fresh.filter(r => !prev.some(p => p.playerId === r.playerId));
        return [...kept, ...added];
      });
    } catch (e: any) {
      setError(e.message ?? 'Failed to refresh the checkout queue.');
    }
  }

  function closeCart() {
    setOpenPlayerId(null); setCart(null); setCartError(null); setNotice(null);
    setRows(prev => [...prev].sort(deskOrder));
  }

  /** Clicking a name expands its cart under it; clicking it again collapses it. */
  async function toggleCart(playerId: string) {
    if (playerId === openPlayerId) { closeCart(); return; }
    setOpenPlayerId(playerId); setCart(null); setCartError(null); setNotice(null);
    setCartBusy(true);
    try {
      const loaded = await checkoutApi.getCart(eventId, playerId);
      // A slow response for a row the desk has already moved on from is dropped.
      setCart(current => (openRef.current === playerId ? loaded : current));
    } catch (e: any) {
      if (openRef.current === playerId) setCartError(e.message ?? 'Could not load that cart.');
    } finally {
      setCartBusy(false);
    }
  }

  function handleSettle(method: SettlementMethod) {
    if (!cart || cart.outstandingCents === 0) return;

    // Card with nothing on file will fail at Stripe. Say so before charging
    // rather than letting the desk discover it as a failure.
    if (method === 'Card' && !cart.hasPaymentMethod) {
      setCartError(
        `${cart.playerName} has no card on file. Take cash or check, or have them `
        + 'add a card in the app.');
      return;
    }

    // Pledges have nothing to hand over; only offer pickup when an item is waiting.
    const markPickedUp = pickUpToo && hasItemsToHandOver(cart);
    const copy = settleCopy(cart.playerName, cart.outstandingCents, method, markPickedUp);
    confirmAction(copy.title, copy.message, async (checkNumber) => {
      setCartBusy(true); setCartError(null); setNotice(null);
      try {
        const res = await checkoutApi.settle(
          eventId, cart.playerId, method, markPickedUp,
          method === 'Check' ? checkNumber.trim() || undefined : undefined);
        setCart(res.cart);
        setNotice(
          res.failed > 0
            ? `${res.failed} charge${res.failed === 1 ? '' : 's'} failed — `
              + `${formatCents(res.cart.outstandingCents)} still outstanding.`
            : `Took ${formatCents(res.settledCents)} from ${res.cart.playerName}.`);
        await refreshInPlace();
      } catch (e: any) {
        setCartError(e.message ?? 'Could not settle up.');
      } finally {
        setCartBusy(false);
      }
    // Verifies a payment amount: always asks, never "don't show again".
    }, copy.confirmText, {
      payment: true,
      ...(method === 'Check' && { input: CHECK_NUMBER_INPUT }),
    });
  }

  async function handlePickup(winnerId: string) {
    if (!cart) return;
    setCartBusy(true); setCartError(null);
    try {
      await checkoutApi.markPickedUp(winnerId);
      setCart(await checkoutApi.getCart(eventId, cart.playerId));
      await refreshInPlace();
    } catch (e: any) {
      setCartError(e.message ?? 'Could not mark that item as collected.');
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

  /** The open golfer's cart, rendered directly under their row. */
  function renderCart() {
    if (!cart || cart.playerId !== openPlayerId) {
      return (
        <View style={[styles.cart, { borderColor: theme.colors.primary }]}>
          {cartError
            ? <Text style={styles.errorText}>{cartError}</Text>
            : <ActivityIndicator color={theme.colors.primary} />}
        </View>
      );
    }
    return (
      <View style={[styles.cart, { borderColor: theme.colors.primary }]}>
        <View style={styles.cartHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cartName, { color: theme.colors.primary }]}>{cart.playerName}</Text>
            <Text style={[styles.rowMeta, { color: theme.mutedText }]}>{cart.playerEmail}</Text>
          </View>
          <Pressable onPress={closeCart} accessibilityLabel="Close">
            <Text style={{ color: theme.mutedText, fontSize: 20 }}>✕</Text>
          </Pressable>
        </View>

        {cart.lines.map(line => (
          <View key={line.winnerId} style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineTitle}>
                {line.itemTitle}
                {line.isPledge && <Text style={styles.pledgeTag}>  PLEDGE</Text>}
              </Text>
              <Text style={[styles.rowMeta, { color: theme.mutedText }]}>
                {line.chargeStatus === 'Succeeded'
                  ? paidLabel(line.settlementMethod, line.checkNumber)
                  : line.chargeStatus === 'Waived' ? 'Waived'
                  : line.chargeStatus === 'Failed' ? 'Charge failed — still owed'
                  : 'Unpaid'}
                {line.pickedUpAt ? ' · collected' : ''}
              </Text>
            </View>
            <Text style={styles.lineAmount}>{formatCents(line.amountCents)}</Text>
            {!line.isPledge && !line.pickedUpAt && (
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

        {cartError && (
          <View style={[styles.errorBox, styles.cartMsg]} accessibilityRole="alert">
            <Text style={styles.errorText}>{cartError}</Text>
          </View>
        )}
        {notice && (
          <View style={[styles.noticeBox, styles.cartMsg]} accessibilityRole="alert">
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}

        {cart.outstandingCents > 0 ? (
          <>
            {hasItemsToHandOver(cart) && (
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
            )}

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
    );
  }

  if (loading) return (
    <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /></View>
  );

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: pagePadding }}>
      <Text style={[styles.title, { color: theme.colors.primary }]}>Auction Checkout</Text>
      <Text style={[styles.sub, { color: theme.mutedText }]}>
        Winners settle up and collect their items here, and Fund-a-Need pledgers
        pay their pledges. Nothing is charged when the auction closes — use Charge
        card to bill the card on file, or record cash or check.
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
              ? 'Nobody has won a lot or pledged yet. They appear here once the auction closes.'
              : 'No winner matches that search.'}
          </Text>
        }
        renderItem={({ item }) => {
          const isOpen = item.playerId === openPlayerId;
          return (
            <View style={styles.rowWrap}>
              <Pressable
                style={[
                  styles.row,
                  item.isComplete && !isOpen && styles.rowDone,
                  isOpen && [styles.rowOpen, { borderColor: theme.colors.primary }],
                ]}
                onPress={() => toggleCart(item.playerId)}
                accessibilityRole="button"
                aria-expanded={isOpen}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{item.playerName}</Text>
                  <Text style={[styles.rowMeta, { color: theme.mutedText }]}>
                    {[
                      item.itemsWon > 0 &&
                        `${item.itemsWon} item${item.itemsWon === 1 ? '' : 's'} · ${item.itemsPickedUp}/${item.itemsWon} collected`,
                      item.pledges > 0 && `${item.pledges} pledge${item.pledges === 1 ? '' : 's'}`,
                      !item.hasPaymentMethod && 'no card on file',
                    ].filter(Boolean).join(' · ')}
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
                <Text style={[styles.chevron, { color: theme.mutedText }]}>{isOpen ? '▾' : '▸'}</Text>
              </Pressable>
              {isOpen && renderCart()}
            </View>
          );
        }}
      />

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
            await refreshInPlace();
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

  rowWrap: { marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  // The open row and its cart read as one card: shared border, joined edge.
  rowOpen:    { borderBottomWidth: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  chevron:    { fontSize: 16, width: 14, textAlign: 'center' },
  rowDone:    { opacity: 0.6 },
  rowName:    { fontSize: 15, fontWeight: '700', color: '#111' },
  rowMeta:    { fontSize: 12, marginTop: 2 },
  rowAmount:  { fontSize: 15, fontWeight: '800' },
  rowDoneTag: { fontSize: 11, color: '#059669', fontWeight: '700', marginTop: 2 },
  empty:      { textAlign: 'center', paddingVertical: 28, fontSize: 14 },

  cart:       {
    backgroundColor: '#fff', padding: 16, borderWidth: 1.5, borderTopWidth: 0,
    borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
  },
  cartMsg:    { marginTop: 12, marginBottom: 0 },
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
  pledgeTag:   { fontSize: 11, fontWeight: '700', color: '#7c3aed', letterSpacing: 0.5 },
  addCardBtn:  { marginTop: 10, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#6b7280', alignItems: 'center' },
  addCardText: { fontSize: 13, fontWeight: '600', color: '#374151' },

  errorBox:  { backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
  errorText: { color: '#c0392b', fontSize: 14 },
  noticeBox: { backgroundColor: '#ecfdf5', borderRadius: 8, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#10b981' },
  noticeText:{ color: '#065f46', fontSize: 14 },
});
