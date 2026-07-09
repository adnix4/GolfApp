import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList,
  TextInput, Modal, ScrollView, ActivityIndicator, Alert, Image,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { formatCentsShort, useLiveAuction } from '@gfp/shared-types';
import { useSession } from '@/lib/session';
import {
  fetchAuctionItems, placeBid, pledge,
  fetchPlayerBidHistory, fetchActiveAuctionSession,
  raiseHand,
  resolveUrl,
  AuctionItemDto, AuctionSessionDto, PlayerBidHistoryItem,
} from '@/lib/api';

type Tab = 'items' | 'history' | 'live';

// Phase 3 realtime: SignalR is primary; the 15 s HTTP poll is a fallback that
// only runs while the hub is disconnected (see useLiveAuction).
const FALLBACK_POLL_MS = 15_000;
const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';

type AuctionSnapshot = { items: AuctionItemDto[]; session: AuctionSessionDto | null };

// Full-screen photo viewer. Window-based sizing (not % of parent) so the photo
// always fits the view; the ScrollView catches any remaining overflow. Rendered
// in two spots (standalone + nested in the bid modal) — see the call sites.
function PhotoViewer({ url, screenWidth, screenHeight, onClose }: {
  url:          string | null;
  screenWidth:  number;
  screenHeight: number;
  onClose:      () => void;
}) {
  return (
    <Modal visible={url !== null} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.photoViewerOverlay}>
        <ScrollView contentContainerStyle={styles.photoViewerScroll}>
          {url && (
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close photo">
              <Image
                source={{ uri: resolveUrl(url) }}
                style={{ width: screenWidth - 24, height: screenHeight * 0.75 }}
                resizeMode="contain"
              />
            </Pressable>
          )}
          <Text style={styles.photoViewerHint}>Tap the photo to close</Text>
        </ScrollView>
        <Pressable
          style={styles.photoViewerClose}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
        >
          <Text style={styles.photoViewerCloseText}>✕</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

export default function AuctionScreen() {
  const theme  = useTheme();
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { session } = useSession();
  const player = session?.player;
  const eventId = session?.event?.id;
  const eventCode = session?.event?.eventCode;

  const [tab, setTab]             = useState<Tab>('items');
  const [history, setHistory]     = useState<PlayerBidHistoryItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<AuctionItemDto | null>(null);
  // Full-screen photo viewer — set by tapping an item thumbnail in the list.
  const [expandedPhotoUrl, setExpandedPhotoUrl] = useState<string | null>(null);
  const [bidAmt, setBidAmt]       = useState('');
  const [bidding, setBidding]     = useState(false);
  const [raisingHand, setRaisingHand] = useState(false);
  const [handRaised,  setHandRaised]  = useState(false);

  // Live auction snapshot: SignalR bid/pledge/close events trigger a coalesced
  // refetch so amounts update without a manual pull-to-refresh. The hook keys
  // its hub subscription on eventCode; the fetcher closes over eventId.
  const fetchAuction = useCallback(async (): Promise<AuctionSnapshot | null> => {
    if (!eventId) return null;
    try {
      const [items, sessionData] = await Promise.all([
        fetchAuctionItems(eventId),
        fetchActiveAuctionSession(eventId),
      ]);
      return { items, session: sessionData };
    } catch {
      return null;
    }
  }, [eventId]);

  const { data, loading, error: loadError, refresh } = useLiveAuction<AuctionSnapshot>({
    baseUrl:        BASE,
    eventCode,
    fetchAuction,
    pollIntervalMs: FALLBACK_POLL_MS,
  });

  const items       = data?.items ?? [];
  const liveSession = data?.session ?? null;

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
        await pledge(item.id, player.id, cents, session!.sessionToken);
      } else {
        await placeBid(item.id, player.id, cents, session!.sessionToken);
      }
      Alert.alert('Success', isDonation ? 'Pledge recorded!' : 'Bid placed!');
      setBidAmt('');
      setSelectedItem(null);
      refresh();
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

  // Re-derive the open modal's item from the live list so its "current bid"
  // reflects incoming bids instead of the snapshot taken when it was tapped.
  const liveSelectedItem = selectedItem
    ? items.find(i => i.id === selectedItem.id) ?? selectedItem
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
          <Text style={styles.errorBannerText}>Could not load auction data. Pull down to retry.</Text>
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
            <Text style={[styles.tabLabel, { color: tab === t ? theme.colors.primary : theme.mutedText }]}>
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
          onRefresh={refresh}
          renderItem={({ item }) => {
            const isDonation = item.auctionType.includes('Donation');
            return (
              <Pressable
                style={[styles.card, { backgroundColor: theme.colors.surface }]}
                onPress={() => { setSelectedItem(item); setBidAmt(''); }}
              >
                <View style={styles.cardRow}>
                  {/* Thumbnail only — tapping it expands the photo full-screen
                      (nested Pressable wins over the card's bid-modal press). */}
                  {item.photoUrls.length > 0 && (
                    <Pressable
                      onPress={() => setExpandedPhotoUrl(item.photoUrls[0])}
                      accessibilityRole="imagebutton"
                      accessibilityLabel={`View photo of ${item.title}`}
                    >
                      <Image
                        source={{ uri: resolveUrl(item.photoUrls[0]) }}
                        style={styles.cardThumb}
                        resizeMode="cover"
                      />
                    </Pressable>
                  )}
                  <View style={styles.cardBody}>
                    <Text style={[styles.itemTitle, { color: theme.colors.primary }]}>{item.title}</Text>
                    <Text style={{ color: theme.mutedText, fontSize: 12 }}>
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
                  </View>
                </View>
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
                <Text style={{ fontSize: 13, color: theme.mutedText }}>Called Amount</Text>
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

      {/* Full-screen photo viewer — opened from a list thumbnail. A second
          instance is nested inside the bid modal (iOS shows only one native
          sibling modal at a time, but a modal-in-modal works), so this one
          only renders while the bid modal is closed. */}
      <PhotoViewer
        url={selectedItem === null ? expandedPhotoUrl : null}
        screenWidth={screenWidth}
        screenHeight={screenHeight}
        onClose={() => setExpandedPhotoUrl(null)}
      />

      {/* Bid modal */}
      <Modal
        visible={selectedItem !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedItem(null)}
      >
        <View style={styles.modalOverlay}>
          {/* Bounded height + internal scroll so tall content (photos, denom
              grids) never pushes the bid controls off-screen. */}
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface, maxHeight: screenHeight * 0.88 }]}>
            {liveSelectedItem && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[styles.itemTitle, { color: theme.colors.primary }]}>
                  {liveSelectedItem.title}
                </Text>
                {liveSelectedItem.photoUrls.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
                    {liveSelectedItem.photoUrls.map(url => (
                      <Pressable
                        key={url}
                        onPress={() => setExpandedPhotoUrl(url)}
                        accessibilityRole="button"
                        accessibilityLabel="View photo full screen"
                      >
                        <Image
                          source={{ uri: resolveUrl(url) }}
                          style={styles.modalPhoto}
                          resizeMode="cover"
                        />
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
                <Text style={{ color: '#555', marginBottom: 12 }}>{liveSelectedItem.description}</Text>

                {liveSelectedItem.auctionType.includes('Donation') ? (
                  <>
                    {liveSelectedItem.donationDenominations ? (
                      <View style={styles.denomRow}>
                        {liveSelectedItem.donationDenominations.map(d => (
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
                    Current bid: {fmt(liveSelectedItem.currentHighBidCents)}
                    {'\n'}Min bid: {fmt(liveSelectedItem.currentHighBidCents + liveSelectedItem.bidIncrementCents)}
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
                    onPress={() => handleBid(liveSelectedItem)}
                    disabled={bidding || !player?.hasPaymentMethod}
                  >
                    {bidding
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.bidBtnText}>
                          {liveSelectedItem.auctionType.includes('Donation') ? 'Pledge' : 'Bid'}
                        </Text>}
                  </Pressable>
                </View>

                <Pressable
                  style={[styles.cancelBtn]}
                  onPress={() => setSelectedItem(null)}
                >
                  <Text style={{ color: '#888' }}>Cancel</Text>
                </Pressable>

                {/* Nested instance — a modal-in-modal is the only reliable way
                    to layer the viewer above this modal on iOS. */}
                <PhotoViewer
                  url={expandedPhotoUrl}
                  screenWidth={screenWidth}
                  screenHeight={screenHeight}
                  onClose={() => setExpandedPhotoUrl(null)}
                />
              </ScrollView>
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
  card:        { borderRadius: 12, padding: 14, marginBottom: 10, boxShadow: '0px 1px 6px rgba(0, 0, 0, 0.06)', elevation: 2 },
  cardRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardBody:    { flex: 1 },
  cardThumb:   { width: 64, height: 64, borderRadius: 8, backgroundColor: '#f0f0f0' },
  photoViewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  photoViewerScroll:  { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 12, paddingTop: 64, paddingBottom: 24 },
  photoViewerHint:    { color: '#bbb', fontSize: 13, marginTop: 14 },
  photoViewerClose:   {
    position: 'absolute', top: 40, right: 16, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  photoViewerCloseText: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 22 },
  photoStrip:  { marginBottom: 12 },
  // Fixed-size gallery tiles (tap to expand) — sizing off screenWidth made
  // these enormous in a desktop-width browser window and pushed the bid
  // controls off-screen.
  modalPhoto:  { width: 168, height: 126, borderRadius: 8, marginRight: 8, backgroundColor: '#f0f0f0' },
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
