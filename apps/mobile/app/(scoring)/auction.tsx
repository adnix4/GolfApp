import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList,
  TextInput, Modal, ScrollView, ActivityIndicator, Alert, Image,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { formatCentsShort } from '@gfp/shared-types';
import { useSession } from '@/lib/session';
import {
  fetchAuctionItems, placeBid, pledge,
  fetchPlayerBidHistory, fetchActiveAuctionSession,
  raiseHand,
  resolveUrl,
  AuctionItemDto, AuctionSessionDto, PlayerBidHistoryItem,
} from '@/lib/api';

type Tab = 'items' | 'history' | 'live';

export default function AuctionScreen() {
  const theme  = useTheme();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const { session } = useSession();
  const player = session?.player;
  const eventId = session?.event?.id;

  const [tab, setTab]             = useState<Tab>('items');
  const [items, setItems]         = useState<AuctionItemDto[]>([]);
  const [history, setHistory]     = useState<PlayerBidHistoryItem[]>([]);
  const [liveSession, setLiveSession] = useState<AuctionSessionDto | null>(null);
  const [loading, setLoading]     = useState(true);
  const [selectedItem, setSelectedItem] = useState<AuctionItemDto | null>(null);
  const [bidAmt, setBidAmt]       = useState('');
  const [bidding, setBidding]     = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [raisingHand, setRaisingHand] = useState(false);
  const [handRaised,  setHandRaised]  = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [itemsData, sessionData] = await Promise.all([
        fetchAuctionItems(eventId),
        fetchActiveAuctionSession(eventId),
      ]);
      setItems(itemsData);
      setLiveSession(sessionData);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Could not load auction data. Pull down to retry.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  const loadHistory = useCallback(async () => {
    if (!player?.id) return;
    try {
      const data = await fetchPlayerBidHistory(player.id);
      setHistory(data);
    } catch {
      Alert.alert('Could not load bid history', 'Check your connection and try again.');
    }
  }, [player?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  async function handleRaiseHand() {
    if (!eventId || raisingHand) return;
    setRaisingHand(true);
    try {
      await raiseHand(eventId);
      setHandRaised(true);
      setTimeout(() => setHandRaised(false), 3000);
    } catch { /* non-critical — ignore */ }
    finally { setRaisingHand(false); }
  }

  async function handleBid(item: AuctionItemDto) {
    if (!player?.id) return;
    const cents = parseInt(bidAmt) || 0;
    if (cents <= 0) { Alert.alert('Invalid Amount', 'Please enter an amount greater than zero.'); return; }
    setBidding(true);
    try {
      const isDonation = item.auctionType.includes('Donation');
      if (isDonation) {
        await pledge(item.id, player.id, cents);
      } else {
        await placeBid(item.id, player.id, cents);
      }
      Alert.alert('Success', isDonation ? 'Pledge recorded!' : 'Bid placed!');
      setBidAmt('');
      setSelectedItem(null);
      await load();
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : '';
      const msg = raw === 'NO_PAYMENT_METHOD'
        ? 'A saved payment method is required to place bids. Please complete entry fee payment first.'
        : raw || 'Something went wrong. Please try again.';
      Alert.alert('Could not place bid', msg);
    } finally {
      setBidding(false);
    }
  }

  const fmt = formatCentsShort;

  const currentLiveItem = liveSession?.currentItemId
    ? items.find(i => i.id === liveSession.currentItemId) ?? null
    : null;

  const openItems = items.filter(i => i.status === 'Open');

  if (!eventId) return (
    <View style={styles.center}>
      <Text style={{ color: '#888' }}>No active event session.</Text>
    </View>
  );

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );

  return (
    <View style={[styles.page, { backgroundColor: theme.pageBackground }]}>
      {/* Load error banner */}
      {loadError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{loadError}</Text>
        </View>
      )}

      {/* No payment method warning */}
      {!player?.hasPaymentMethod && (
        <Pressable
          style={styles.paymentWarning}
          onPress={() => router.push('/payment-setup')}
          accessibilityRole="button"
        >
          <View style={styles.paymentWarningRow}>
            <Text style={styles.paymentWarningText}>
              No payment method on file — bids require a saved card.
            </Text>
            <Text style={styles.paymentWarningLink}>Set Up →</Text>
          </View>
        </Pressable>
      )}

      {/* Live auction banner */}
      {liveSession?.isActive && (
        <View style={[styles.liveBanner]}>
          <Text style={styles.liveBannerText}>🔴 LIVE AUCTION IN PROGRESS</Text>
        </View>
      )}

      {/* Tab selector */}
      <View style={styles.tabRow}>
        {([['items', 'Auction'], ['live', 'Live'], ['history', 'My Bids']] as [Tab, string][]).map(([t, label]) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tabBtn, tab === t && { borderBottomColor: theme.colors.primary }]}
          >
            <Text style={[styles.tabLabel, { color: tab === t ? theme.colors.primary : theme.colors.accent }]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Items tab */}
      {tab === 'items' && (
        <FlatList
          data={openItems}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshing={loading}
          onRefresh={load}
          renderItem={({ item }) => {
            const isDonation = item.auctionType.includes('Donation');
            return (
              <Pressable
                style={[styles.card, { backgroundColor: theme.colors.surface }]}
                onPress={() => { setSelectedItem(item); setBidAmt(''); }}
              >
                {item.photoUrls.length > 0 && (
                  <Image
                    source={{ uri: resolveUrl(item.photoUrls[0]) }}
                    style={styles.cardPhoto}
                    resizeMode="contain"
                  />
                )}
                <Text style={[styles.itemTitle, { color: theme.colors.primary }]}>{item.title}</Text>
                <Text style={{ color: theme.colors.accent, fontSize: 12 }}>
                  {item.auctionType}
                  {item.closesAt ? `  · Closes: ${new Date(item.closesAt).toLocaleTimeString()}` : ''}
                </Text>
                {isDonation ? (
                  <Text style={{ color: '#27ae60', fontWeight: '700', marginTop: 4 }}>
                    Raised: {fmt(item.totalRaisedCents)}
                    {item.goalCents ? ` / ${fmt(item.goalCents)}` : ''}
                  </Text>
                ) : (
                  <Text style={{ color: '#27ae60', fontWeight: '700', marginTop: 4 }}>
                    Current: {fmt(item.currentHighBidCents)}
                    <Text style={{ color: '#888', fontWeight: '400' }}>
                      {'  '}min increment: {fmt(item.bidIncrementCents)}
                    </Text>
                  </Text>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', color: '#999', marginTop: 40 }}>
              No open auction items.
            </Text>
          }
        />
      )}

      {/* Live tab */}
      {tab === 'live' && (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {liveSession?.isActive && currentLiveItem ? (
            <View>
              <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>
                Now: {currentLiveItem.title}
              </Text>
              <Text style={{ color: '#555', marginBottom: 12 }}>{currentLiveItem.description}</Text>
              <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                <Text style={{ fontSize: 13, color: theme.colors.accent }}>Called Amount</Text>
                <Text style={{ fontSize: 36, fontWeight: '900', color: '#27ae60' }}>
                  {fmt(liveSession.currentCalledAmountCents)}
                </Text>
              </View>

              {/* Raise Hand — soft "I'm Bidding" signal */}
              <Pressable
                style={[
                  styles.raiseHandBtn,
                  handRaised && { backgroundColor: '#27ae60' },
                  raisingHand && { opacity: 0.6 },
                ]}
                onPress={handleRaiseHand}
                disabled={raisingHand}
                accessibilityLabel="Raise hand to signal interest"
                accessibilityRole="button"
              >
                {raisingHand
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.raiseHandText}>
                      {handRaised ? '✓ Hand Raised!' : '🙋 I\'m Bidding'}
                    </Text>}
              </Pressable>

              <Text style={[styles.sectionTitle, { color: theme.colors.primary, marginTop: 16 }]}>
                Pledge / Bid on this item
              </Text>
              <View style={styles.bidRow}>
                <TextInput
                  style={[styles.bidInput, { borderColor: theme.colors.accent }]}
                  value={bidAmt}
                  onChangeText={setBidAmt}
                  keyboardType="number-pad"
                  placeholder="Amount in cents (e.g. 500 = $5)"
                  placeholderTextColor="#aaa"
                />
                <Pressable
                  style={[styles.bidBtn, { backgroundColor: theme.colors.primary }]}
                  onPress={() => handleBid(currentLiveItem)}
                  disabled={bidding}
                >
                  {bidding ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.bidBtnText}>Bid</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={{ color: '#888', fontSize: 15 }}>
                {liveSession?.isActive
                  ? 'Waiting for the host to call the next item…'
                  : 'No live auction is active right now.'}
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* My Bids tab */}
      {tab === 'history' && (
        <FlatList
          data={history}
          keyExtractor={i => `${i.auctionItemId}-${i.placedAt}`}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
              <Text style={[styles.itemTitle, { color: theme.colors.primary }]}>{item.itemTitle}</Text>
              <Text style={{ color: '#555', fontSize: 13 }}>
                {fmt(item.amountCents)} · {item.status}
              </Text>
              <Text style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
                {new Date(item.placedAt).toLocaleString()}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', color: '#999', marginTop: 40 }}>
              You haven't placed any bids yet.
            </Text>
          }
        />
      )}

      {/* Bid modal */}
      <Modal
        visible={selectedItem !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedItem(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
            {selectedItem && (
              <>
                <Text style={[styles.itemTitle, { color: theme.colors.primary }]}>
                  {selectedItem.title}
                </Text>
                {selectedItem.photoUrls.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
                    {selectedItem.photoUrls.map(url => (
                      <Image
                        key={url}
                        source={{ uri: resolveUrl(url) }}
                        style={[styles.modalPhoto, { width: screenWidth - 96 }]}
                        resizeMode="contain"
                      />
                    ))}
                  </ScrollView>
                )}
                <Text style={{ color: '#555', marginBottom: 12 }}>{selectedItem.description}</Text>

                {selectedItem.auctionType.includes('Donation') ? (
                  <>
                    {selectedItem.donationDenominations ? (
                      <View style={styles.denomRow}>
                        {selectedItem.donationDenominations.map(d => (
                          <Pressable
                            key={d}
                            onPress={() => setBidAmt(String(d))}
                            style={[
                              styles.denomBtn,
                              bidAmt === String(d) && { backgroundColor: theme.colors.primary },
                            ]}
                          >
                            <Text style={{ color: bidAmt === String(d) ? '#fff' : theme.colors.primary, fontWeight: '700' }}>
                              {fmt(d)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    <Text style={styles.bidLabel}>Or enter amount (cents):</Text>
                  </>
                ) : (
                  <Text style={styles.bidLabel}>
                    Current bid: {fmt(selectedItem.currentHighBidCents)}
                    {'\n'}Min bid: {fmt(selectedItem.currentHighBidCents + selectedItem.bidIncrementCents)}
                  </Text>
                )}

                <View style={styles.bidRow}>
                  <TextInput
                    style={[styles.bidInput, { borderColor: theme.colors.accent, flex: 1 }]}
                    value={bidAmt}
                    onChangeText={setBidAmt}
                    keyboardType="number-pad"
                    placeholder="Amount in cents (e.g. 500 = $5)"
                    placeholderTextColor="#aaa"
                  />
                  <Pressable
                    style={[
                      styles.bidBtn,
                      { backgroundColor: player?.hasPaymentMethod ? theme.colors.primary : '#aaa' },
                    ]}
                    onPress={() => handleBid(selectedItem)}
                    disabled={bidding || !player?.hasPaymentMethod}
                  >
                    {bidding
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.bidBtnText}>
                          {selectedItem.auctionType.includes('Donation') ? 'Pledge' : 'Bid'}
                        </Text>}
                  </Pressable>
                </View>

                <Pressable
                  style={[styles.cancelBtn]}
                  onPress={() => setSelectedItem(null)}
                >
                  <Text style={{ color: '#888' }}>Cancel</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page:        { flex: 1 },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  liveBanner:  { backgroundColor: '#c0392b', paddingVertical: 8, alignItems: 'center' },
  liveBannerText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  tabRow:      { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  tabBtn:      { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabLabel:    { fontSize: 13, fontWeight: '700' },
  card:        { borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  cardPhoto:   { width: '100%', aspectRatio: 4 / 3, borderRadius: 8, marginBottom: 10, backgroundColor: '#f0f0f0' },
  photoStrip:  { marginBottom: 12 },
  modalPhoto:  { aspectRatio: 4 / 3, borderRadius: 8, marginRight: 8, backgroundColor: '#f0f0f0' },
  itemTitle:   { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  bidRow:      { flexDirection: 'row', gap: 8, marginTop: 12 },
  bidInput:    { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  bidBtn:      { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, justifyContent: 'center' },
  bidBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
  bidLabel:    { color: '#555', fontSize: 14, marginBottom: 8 },
  denomRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  denomBtn:    { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#27ae60' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard:   { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  cancelBtn:   { alignItems: 'center', marginTop: 16, paddingVertical: 10 },
  raiseHandBtn: {
    backgroundColor: '#2980b9', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 12,
  },
  raiseHandText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  errorBanner: { backgroundColor: '#fdf2f2', borderLeftWidth: 3, borderLeftColor: '#e74c3c', padding: 12 },
  errorBannerText: { color: '#c0392b', fontSize: 13 },
  paymentWarning:    { backgroundColor: '#fff8e1', borderLeftWidth: 3, borderLeftColor: '#f39c12', padding: 12 },
  paymentWarningRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  paymentWarningText: { color: '#b7770d', fontSize: 13, flex: 1 },
  paymentWarningLink: { color: '#e67e22', fontSize: 13, fontWeight: '700' },
});
