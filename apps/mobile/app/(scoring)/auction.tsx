import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList,
  Modal, ScrollView, ActivityIndicator, Image, Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, MoneyInput } from '@gfp/ui';
import {
  formatCentsShort, dollarsToCents, centsToMoneyValue, useLiveAuction,
  needsPaymentMethod, minimumBidCents, isDonationItem, usesProxyBidding,
  foldPlayerBidsByItem, bidTone, buildBidConfirmation, type BidTone,
} from '@gfp/shared-types';
import { useSession } from '@/lib/session';
import { notify } from '@/lib/notify';
import {
  fetchAuctionItems, placeBid, pledge,
  fetchPlayerBidHistory, fetchActiveAuctionSession,
  raiseHand,
  resolveUrl,
  fetchMyCheckout,
  AuctionItemDto, AuctionSessionDto, PlayerBidHistoryItem, CheckoutCartDto,
} from '@/lib/api';

type Tab = 'items' | 'history' | 'live';

// Phase 3 realtime: SignalR is primary; the 15 s HTTP poll is a fallback that
// only runs while the hub is disconnected (see useLiveAuction).
const FALLBACK_POLL_MS = 15_000;
const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';

type AuctionSnapshot = { items: AuctionItemDto[]; session: AuctionSessionDto | null };

/**
 * How the item's current price reads to THIS golfer. Local literals rather than
 * theme tokens because the theme carries no success/danger colors (see
 * ThemeContextValue) — same three values this screen already hardcodes for the
 * price, errors and muted text.
 */
const TONE_COLOR: Record<BidTone, string> = {
  winning: '#27ae60',
  outbid:  '#c0392b',
  none:    '#1a1a1a',
};

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

/**
 * Turns the server's bid rejection codes into something a golfer can act on.
 * These arrive as bare machine strings ("BID_TOO_LOW:5000") and used to be shown
 * verbatim, so the one message that told the golfer what to do next — the actual
 * minimum — was buried in a code.
 */
function describeBidError(raw: string): string {
  if (raw === 'NO_PAYMENT_METHOD')
    return 'To bid, either save a card or check in at the registration desk.';
  if (raw === 'AUCTION_CLOSED')
    return 'This item just closed. Pull down to refresh the list.';

  const tooLow = raw.match(/^BID_TOO_LOW:(\d+)$/);
  if (tooLow)
    return `That is below the minimum — bids on this item start at ${formatCentsShort(Number(tooLow[1]))}.`;

  // A session-token mismatch comes back as the generic player-not-found text.
  if (/was not found/i.test(raw))
    return 'Your session has expired. Rejoin the event and try again.';

  return raw || 'Something went wrong. Please try again.';
}

export default function AuctionScreen() {
  const theme  = useTheme();
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { session } = useSession();
  const player = session?.player;
  const eventId = session?.event?.id;
  const eventCode = session?.event?.eventCode;

  // Mirrors the server gate (AuctionBidRules.NeedsPaymentMethod): a saved card
  // is required ONLY until the golfer checks in. This screen used to test
  // hasPaymentMethod alone, which blocked checked-in golfers the server would
  // have accepted. session.tsx refreshes isCheckedIn on the status poll.
  const cardRequired = needsPaymentMethod(
    !!player?.hasPaymentMethod, !!player?.isCheckedIn,
  );
  // Checked in with no card — worth saying out loud, since the golfer may have
  // been staring at the "add a card" banner right up until check-in.
  const bidsUnlockedByCheckIn = !player?.hasPaymentMethod && !!player?.isCheckedIn;

  const [tab, setTab]             = useState<Tab>('items');
  const [history, setHistory]     = useState<PlayerBidHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AuctionItemDto | null>(null);
  // Full-screen photo viewer — set by tapping an item thumbnail in the list.
  const [expandedPhotoUrl, setExpandedPhotoUrl] = useState<string | null>(null);
  const [bidAmt, setBidAmt]       = useState('');
  const [bidding, setBidding]     = useState(false);
  // Bid failures show up inline, right under the amount field. A dialog was the
  // wrong place for this even on native — the golfer's next move is to change
  // the number they just typed, and it is the only place a web build can put it.
  const [bidError, setBidError]   = useState<string | null>(null);
  // Guards the synchronous window.confirm on web only — see handleBid.
  const bidInFlightRef = useRef(false);
  const [raisingHand, setRaisingHand] = useState(false);
  const [handRaised,  setHandRaised]  = useState(false);
  // Winnings. A closed lot drops straight out of the list, so without this the
  // golfer's only sign they won anything was a status string on a My Bids row.
  const [cart, setCart] = useState<CheckoutCartDto | null>(null);

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

  const { data, loading, error: loadError, lastUpdated, refresh } = useLiveAuction<AuctionSnapshot>({
    baseUrl:        BASE,
    eventCode,
    fetchAuction,
    pollIntervalMs: FALLBACK_POLL_MS,
  });

  const items       = data?.items ?? [];
  const liveSession = data?.session ?? null;

  // Overlapping history fetches are routine now that this runs on every
  // snapshot (a hub burst and a poll can land together), and an older response
  // arriving late would re-paint an outbid card green. Only the newest request
  // is allowed to write.
  const historyReqRef = useRef(0);

  const loadHistory = useCallback(async () => {
    if (!player?.id) return;
    const req = ++historyReqRef.current;
    try {
      const rows = await fetchPlayerBidHistory(player.id);
      if (req === historyReqRef.current) {
        setHistory(rows);
        setHistoryError(false);
      }
    } catch {
      // Deliberately silent: this now runs in the background every time the
      // auction refreshes, and a dialog raised behind the golfer every 15 s
      // would be worse than a stale card. The last known rows are kept, and the
      // My Bids tab shows an inline banner instead.
      if (req === historyReqRef.current) setHistoryError(true);
    }
  }, [player?.id]);

  // Runs on mount and after every successful snapshot, so a bid that moves the
  // price also re-reads where this golfer stands. Previously this only fired on
  // opening the My Bids tab, which is why the items list knew nothing about the
  // golfer at all.
  useEffect(() => { loadHistory(); }, [loadHistory, lastUpdated]);

  /** This golfer's standing bid per item — drives the card color and max line. */
  const myBidsByItem = useMemo(() => foldPlayerBidsByItem(history), [history]);

  // Winnings, refreshed whenever the auction data changes — an ItemClosed event
  // is exactly when a golfer becomes a winner.
  const loadCart = useCallback(async () => {
    if (!player?.id || !session?.sessionToken) return;
    try { setCart(await fetchMyCheckout(player.id, session.sessionToken)); }
    catch { /* non-critical: the banner just stays hidden */ }
  }, [player?.id, session?.sessionToken]);

  useEffect(() => { loadCart(); }, [loadCart, items.length]);

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

  /**
   * Validates, then reads the amount back to the golfer before anything posts.
   *
   * Only the dialog is new here — the floor checks still report inline under the
   * amount field, because the golfer's next move after one of those is to edit
   * the number they just typed, not to dismiss a box.
   */
  function handleBid(item: AuctionItemDto) {
    if (!player?.id) return;
    const isDonation = isDonationItem(item.auctionType);
    const cents = dollarsToCents(bidAmt);
    if (cents <= 0) {
      setBidError('Enter an amount greater than zero.');
      return;
    }
    // Client-side floor check, so the common mistake is caught before a round
    // trip. The server still decides — another golfer's bid can raise the bar
    // between this render and the request landing.
    const min = minimumBidCents(item);
    if (cents < min) {
      setBidError(isDonation
        ? `The smallest pledge for this item is ${fmt(min)}.`
        : `Bids start at ${fmt(min)} for this item.`);
      return;
    }
    setBidError(null);

    // Web only, and deliberately so. There, notify() is window.confirm: it runs
    // synchronously inside this handler, so a setState would not have flushed in
    // time to block a second tap — hence a ref — and it can only ever return
    // true or false, so the flag cannot get stranded.
    //
    // Native needs no guard: Alert is a system-modal dialog, so the Bid button
    // underneath cannot be tapped while it is up. Applying the ref there WOULD
    // strand it — Android dismisses an alert on the back button without calling
    // any button handler, and the flag would then block every later bid with no
    // message at all. That is the D12 dead-button failure exactly.
    if (Platform.OS === 'web') {
      if (bidInFlightRef.current) return;
      bidInFlightRef.current = true;
    }

    const prompt = buildBidConfirmation(item, cents);
    notify(prompt.title, prompt.message, [
      { text: 'Cancel', style: 'cancel', onPress: () => { bidInFlightRef.current = false; } },
      { text: prompt.confirmLabel, onPress: () => { void submitBid(item, cents); } },
    ]);
  }

  /**
   * Posts the amount the golfer confirmed. Takes `cents` as an argument rather
   * than re-reading `bidAmt`: on native the dialog sits over a live field, and
   * what gets charged must be the number they were shown.
   */
  async function submitBid(item: AuctionItemDto, cents: number) {
    if (!player?.id) return;
    const isDonation = isDonationItem(item.auctionType);
    setBidding(true);
    try {
      if (isDonation) {
        await pledge(item.id, player.id, cents, session!.sessionToken);
        notify('Success', 'Pledge recorded!');
      } else {
        const res = await placeBid(item.id, player.id, cents, session!.sessionToken);
        // A proxy bid can be accepted and lose in the same breath — someone
        // else's standing max was already higher. Saying "Bid placed!" and
        // nothing else would leave that golfer thinking they were in the lead.
        notify(
          res.isWinning ? 'You\'re the high bidder' : 'Bid placed — you were outbid',
          usesProxyBidding(item.auctionType)
            ? res.isWinning
              ? `The bid is at ${fmt(res.currentHighBidCents)}. We'll bid for you up to ${fmt(cents)}.`
              : `Another golfer's maximum is higher. The bid is now ${fmt(res.currentHighBidCents)}.`
            : 'Bid placed!',
        );
      }
      setBidAmt('');
      setSelectedItem(null);
      refresh();
    } catch (e: unknown) {
      setBidError(describeBidError(e instanceof Error ? e.message : ''));
      // Someone else may have raised the item since this screen last rendered —
      // pull the current amounts in so the message and the label agree.
      refresh();
    } finally {
      setBidding(false);
      bidInFlightRef.current = false;
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

  // Extended counts as open — an item that extends on a last-30-second bid is at
  // its hottest, and dropping it here made it vanish from the golfer's list at
  // exactly that moment. Matches the server (AuctionService.GetPublicItemsAsync).
  const openItems = items.filter(i => i.status === 'Open' || i.status === 'Extended');

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

      {/* Won something. Sits above the card prompt because collecting an item
          you already won matters more than bidding on the next one. */}
      {cart && cart.lines.length > 0 && (
        <Pressable
          style={styles.wonBanner}
          onPress={() => router.push('/auction-checkout')}
          accessibilityRole="button"
        >
          <View style={styles.paymentWarningRow}>
            <Text style={styles.wonBannerText}>
              🎉 You won {cart.lines.length} item{cart.lines.length === 1 ? '' : 's'}
              {cart.outstandingCents > 0
                ? ` — ${formatCentsShort(cart.outstandingCents)} to pay`
                : ' — paid, ready to collect'}
            </Text>
            <Text style={styles.wonBannerLink}>
              {cart.outstandingCents > 0 ? 'Check Out →' : 'View →'}
            </Text>
          </View>
        </Pressable>
      )}

      {/* No payment method — and not yet checked in, so bidding is still locked */}
      {cardRequired && (
        <Pressable
          style={styles.paymentWarning}
          onPress={() => router.push('/payment-setup')}
          accessibilityRole="button"
        >
          <View style={styles.paymentWarningRow}>
            <Text style={styles.paymentWarningText}>
              Add a card to bid — or check in at the registration desk.
            </Text>
            <Text style={styles.paymentWarningLink}>Set Up →</Text>
          </View>
        </Pressable>
      )}

      {/* Checked in without a card — bidding is open, say so */}
      {bidsUnlockedByCheckIn && (
        <View style={styles.checkedInNotice}>
          <Text style={styles.checkedInNoticeText}>
            You're checked in — no card needed to bid.
          </Text>
        </View>
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
            const isDonation = isDonationItem(item.auctionType);
            // Where this golfer stands on this item: their own standing bid and
            // whether it is still in front.
            const mine = myBidsByItem.get(item.id);
            const tone = bidTone(mine);
            return (
              <Pressable
                style={[styles.card, { backgroundColor: theme.colors.surface }]}
                onPress={() => { setSelectedItem(item); setBidAmt(''); setBidError(null); }}
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
                      <>
                        {/* Pledges stack rather than compete, so this stays the
                            green "money raised" line for everyone. */}
                        <Text style={{ color: '#27ae60', fontWeight: '700', marginTop: 4 }}>
                          Raised: {fmt(item.totalRaisedCents)}
                          {item.goalCents ? ` / ${fmt(item.goalCents)}` : ''}
                        </Text>
                        {mine && (
                          <Text style={{ color: theme.mutedText, fontSize: 12, marginTop: 2 }}>
                            You Pledged: {fmt(mine.maxCents)}
                          </Text>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Green when this golfer leads, red when they have been
                            outbid, black when they have not bid. The word after
                            the amount carries the same meaning as the color —
                            colour alone is invisible to a colour-blind golfer
                            and weak in sunlight on a phone. */}
                        <Text
                          style={{ color: TONE_COLOR[tone], fontWeight: '700', marginTop: 4 }}
                          accessibilityLabel={
                            `Current bid ${fmt(item.currentHighBidCents)}`
                            + (tone === 'winning' ? ', you are winning'
                              : tone === 'outbid' ? ', you have been outbid' : '')
                          }
                        >
                          Current: {fmt(item.currentHighBidCents)}
                          {tone === 'winning' ? ' · Winning' : tone === 'outbid' ? ' · Outbid' : ''}
                        </Text>
                        {mine && (
                          <Text style={{ color: theme.mutedText, fontSize: 12, marginTop: 2 }}>
                            {/* Only a Silent bid is a ceiling; calling a called-out
                                Live bid a "maximum" would be wrong. */}
                            {usesProxyBidding(item.auctionType) ? 'Your Max Bid' : 'Your Bid'}
                            : {fmt(mine.maxCents)}
                          </Text>
                        )}
                        <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
                          min increment: {fmt(item.bidIncrementCents)}
                        </Text>
                      </>
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
              <Text style={styles.bidLabel}>
                Min bid: {fmt(minimumBidCents(currentLiveItem))}
              </Text>
              <View style={styles.bidRow}>
                <MoneyInput
                  style={[styles.bidInput, { borderColor: theme.colors.accent }]}
                  value={bidAmt}
                  onChangeText={t => { setBidAmt(t); setBidError(null); }}
                  placeholder="$0.00"
                  placeholderTextColor="#aaa"
                />
                {/* Same gate as the silent-auction modal — this button used to be
                    ungated entirely, so a cardless golfer's live bid was accepted
                    locally and then rejected by the server. */}
                <Pressable
                  style={[styles.bidBtn, { backgroundColor: cardRequired ? '#aaa' : theme.colors.primary }]}
                  onPress={() => handleBid(currentLiveItem)}
                  disabled={bidding || cardRequired}
                >
                  {bidding ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.bidBtnText}>Bid</Text>}
                </Pressable>
              </View>
              {bidError && (
                <Text style={styles.bidError} accessibilityRole="alert">{bidError}</Text>
              )}
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
          ListHeaderComponent={historyError ? (
            <View style={[styles.errorBanner, { marginBottom: 12 }]}>
              <Text style={styles.errorBannerText}>
                Could not refresh your bids. Showing the last ones we loaded.
              </Text>
            </View>
          ) : null}
          keyExtractor={i => `${i.auctionItemId}-${i.placedAt}`}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
              <Text style={[styles.itemTitle, { color: theme.colors.primary }]}>{item.itemTitle}</Text>
              <Text style={{ color: '#555', fontSize: 13 }}>
                {/* "max" matters here: on a proxy item this row is the ceiling
                    the golfer set, not what the item is going for. */}
                {usesProxyBidding(item.auctionType) ? 'max ' : ''}{fmt(item.amountCents)} · {item.status}
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
        onRequestClose={() => { setSelectedItem(null); setBidError(null); }}
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

                {isDonationItem(liveSelectedItem.auctionType) ? (
                  <>
                    {liveSelectedItem.donationDenominations ? (
                      <View style={styles.denomRow}>
                        {liveSelectedItem.donationDenominations.map(d => {
                          const denomValue = centsToMoneyValue(d);
                          return (
                            <Pressable
                              key={d}
                              onPress={() => setBidAmt(denomValue)}
                              style={[
                                styles.denomBtn,
                                bidAmt === denomValue && { backgroundColor: theme.colors.primary },
                              ]}
                            >
                              <Text style={{ color: bidAmt === denomValue ? '#fff' : theme.colors.primary, fontWeight: '700' }}>
                                {fmt(d)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                    <Text style={styles.bidLabel}>Or enter an amount:</Text>
                  </>
                ) : (
                  <Text style={styles.bidLabel}>
                    Current bid: {fmt(liveSelectedItem.currentHighBidCents)}
                    {/* Must be the shared rule, not currentHigh + increment: on
                        an item with no bids yet the server still requires the
                        starting bid, and the naive sum advertised $5 on a $50
                        item — every bid at the quoted figure was rejected. */}
                    {'\n'}Min bid: {fmt(minimumBidCents(liveSelectedItem))}
                    {/* Say it before they type, not after they've lost: on a
                        proxy item the number entered is a ceiling, and the item
                        will sit well below it until someone pushes. */}
                    {usesProxyBidding(liveSelectedItem.auctionType) && (
                      <Text style={{ color: '#888' }}>
                        {'\n'}Enter your maximum — we bid only enough to keep you
                        in front, in {fmt(liveSelectedItem.bidIncrementCents)} steps,
                        and never more than your maximum.
                      </Text>
                    )}
                  </Text>
                )}

                <View style={styles.bidRow}>
                  <MoneyInput
                    style={[styles.bidInput, { borderColor: theme.colors.accent, flex: 1 }]}
                    value={bidAmt}
                    onChangeText={t => { setBidAmt(t); setBidError(null); }}
                    placeholder="$0.00"
                    placeholderTextColor="#aaa"
                  />
                  <Pressable
                    style={[
                      styles.bidBtn,
                      { backgroundColor: cardRequired ? '#aaa' : theme.colors.primary },
                    ]}
                    onPress={() => handleBid(liveSelectedItem)}
                    disabled={bidding || cardRequired}
                  >
                    {bidding
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.bidBtnText}>
                          {isDonationItem(liveSelectedItem.auctionType) ? 'Pledge' : 'Bid'}
                        </Text>}
                  </Pressable>
                </View>

                {bidError && (
                  <Text style={styles.bidError} accessibilityRole="alert">{bidError}</Text>
                )}

                <Pressable
                  style={[styles.cancelBtn]}
                  onPress={() => { setSelectedItem(null); setBidError(null); }}
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
  bidError:    { color: '#c0392b', fontSize: 13, fontWeight: '600', marginTop: 10 },
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
  // Green, not amber: winning is good news, and it must not read as another warning.
  wonBanner:     { backgroundColor: '#ecfdf5', borderLeftWidth: 3, borderLeftColor: '#10b981', padding: 12 },
  wonBannerText: { color: '#065f46', fontSize: 13, fontWeight: '600', flex: 1 },
  wonBannerLink: { color: '#059669', fontSize: 13, fontWeight: '700' },
  checkedInNotice:     { backgroundColor: '#eafaf1', borderLeftWidth: 3, borderLeftColor: '#27ae60', padding: 12 },
  checkedInNoticeText: { color: '#1e8449', fontSize: 13 },
});
