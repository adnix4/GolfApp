import { useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, TextInput,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme, MoneyInput } from '@gfp/ui';
import { dollarsToCents, formatCentsShort, centsToMoneyValue } from '@gfp/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import { auctionApi, type AuctionItem, type AuctionSession } from '@/lib/api';
import { eventKeys, useAuctionItemList, useAuctionSession } from '@/lib/queries';
import { confirmAction } from '@/lib/confirmAction';
import { fontSize, radius, spacing } from '@gfp/theme';

export default function LiveAuctionScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  // Lots come from the same cache as the Auction Items tab, so switching
  // between the two is one request, not two.
  const itemList    = useAuctionItemList(eventId);
  const sessionData = useAuctionSession(eventId);
  const client      = useQueryClient();
  const items   = itemList.items.filter(i => i.auctionType === 'Live' || i.auctionType === 'DonationLive');
  const session = sessionData.data ?? null;
  const loading = itemList.loading || sessionData.isPending;
  const setSession = (s: AuctionSession | null) =>
    client.setQueryData(eventKeys.auctionSession(eventId), s);

  const [working,   setWorking]   = useState(false);
  const [actionError, setError]   = useState<string | null>(null);
  const error = actionError
    ?? (itemList.error ? (itemList.error.message || 'Failed to load live auction data.') : null);
  const [success,   setSuccess]   = useState<string | null>(null);
  const [calledAmt, setCalledAmt] = useState('');

  const currentItem = session?.currentItemId
    ? items.find(i => i.id === session.currentItemId) ?? null
    : null;

  // Seed the called amount once per visit, from the first session we have
  // (cached or fetched). A background refresh must not overwrite what the
  // host is typing; the host's own actions set it explicitly below.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || sessionData.isPending) return;
    seeded.current = true;
    if (session) setCalledAmt(centsToMoneyValue(session.currentCalledAmountCents));
  }, [session, sessionData.isPending]);

  async function load() {
    const [, fresh] = await Promise.all([itemList.refetch(), sessionData.refetch()]);
    const s = fresh.data ?? null;
    if (s) setCalledAmt(centsToMoneyValue(s.currentCalledAmountCents));
  }

  function clearFeedback() { setError(null); setSuccess(null); }

  async function startSession() {
    clearFeedback();
    setWorking(true);
    try {
      const s = await auctionApi.startSession(eventId);
      setSession(s);
      setSuccess('Live auction session started.');
    } catch (e: any) {
      setError(e.message ?? 'Could not start the session. Ensure there are live auction items configured.');
    } finally {
      setWorking(false);
    }
  }

  async function endSession() {
    clearFeedback();
    setWorking(true);
    try {
      await auctionApi.endSession(eventId);
      setSession(null);
      setCalledAmt('');
      setSuccess('Live auction ended.');
    } catch (e: any) {
      setError(e.message ?? 'Could not end the session.');
    } finally {
      setWorking(false);
    }
  }

  async function advanceItem() {
    clearFeedback();
    setWorking(true);
    try {
      const s = await auctionApi.nextItem(eventId);
      setSession(s);
      setCalledAmt(centsToMoneyValue(s.currentCalledAmountCents));
      if (!s.currentItemId) setSuccess('All items have been presented.');
    } catch (e: any) {
      setError(e.message ?? 'Could not advance to the next item.');
    } finally {
      setWorking(false);
    }
  }

  async function updateCalledAmount() {
    if (!session) return;
    clearFeedback();
    const cents = dollarsToCents(calledAmt);
    setWorking(true);
    try {
      const s = await auctionApi.updateCalledAmount(eventId, cents);
      setSession(s);
      setSuccess(`Called amount updated to ${fmt(cents)}.`);
    } catch (e: any) {
      setError(e.message ?? 'Could not update the called amount.');
    } finally {
      setWorking(false);
    }
  }

  async function awardItem(item: AuctionItem, winnerId: string) {
    clearFeedback();
    const cents = dollarsToCents(calledAmt) || item.currentHighBidCents;
    setWorking(true);
    try {
      await auctionApi.awardItem(item.id, winnerId, cents);
      setSuccess(`"${item.title}" awarded for ${fmt(cents)}. Charge initiated.`);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Could not award the item. Verify the player ID and try again.');
    } finally {
      setWorking(false);
    }
  }

  const fmt = formatCentsShort;

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={[styles.heading, { color: theme.colors.primary }]}>Live Auction Host Control</Text>

      {/* Feedback banners */}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => setError(null)} style={{ marginTop: spacing[2] }}>
            <Text style={{ color: '#c0392b', fontSize: fontSize.xs }}>Dismiss</Text>
          </Pressable>
        </View>
      )}
      {success && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>✓ {success}</Text>
          <Pressable onPress={() => setSuccess(null)} style={{ marginTop: spacing[2] }}>
            <Text style={{ color: '#1a6b3c', fontSize: fontSize.xs }}>Dismiss</Text>
          </Pressable>
        </View>
      )}

      {/* Pre-session state */}
      {!session ? (
        <View style={styles.card}>
          <Text style={styles.infoText}>No live auction session is active.</Text>
          {items.length === 0 ? (
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>
                No live auction items found. Add items with type "Live" or "Donation (Live)" from the Auction Items tab first.
              </Text>
            </View>
          ) : (
            <Text style={[styles.infoText, { marginBottom: spacing[4], color: '#555' }]}>
              {items.length} live item{items.length !== 1 ? 's' : ''} ready.
            </Text>
          )}
          <Pressable
            style={[styles.bigBtn, { backgroundColor: items.length === 0 ? '#aaa' : theme.colors.primary }]}
            onPress={startSession}
            disabled={working || items.length === 0}
          >
            {working
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.bigBtnText}>▶  Start Live Auction</Text>}
          </Pressable>
        </View>
      ) : (
        <>
          {/* Session active banner */}
          <View style={[styles.banner, { backgroundColor: '#e74c3c' }]}>
            <Text style={styles.bannerText}>🔴  LIVE SESSION IN PROGRESS</Text>
          </View>

          {/* Bidder count */}
          <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3] }]}>
            <Text style={{ fontSize: 32 }}>🙋</Text>
            <View>
              <Text style={{ fontSize: fontSize.display, fontWeight: '800', color: theme.colors.primary }}>
                {session.currentBidderCount}
              </Text>
              <Text style={{ fontSize: fontSize.xs, color: '#666' }}>
                {session.currentBidderCount === 1 ? 'attendee is bidding' : 'attendees are bidding'}
              </Text>
            </View>
          </View>

          {/* Current item */}
          {currentItem ? (
            <View style={styles.card}>
              <Text style={[styles.itemTitle, { color: theme.colors.primary }]}>
                {currentItem.title}
              </Text>
              {currentItem.description ? (
                <Text style={styles.itemDesc}>{currentItem.description}</Text>
              ) : null}
              <Text style={styles.itemMeta}>
                Starting bid: {fmt(currentItem.startingBidCents)}
                {currentItem.currentHighBidCents > 0
                  ? `  ·  Current high bid: ${fmt(currentItem.currentHighBidCents)}`
                  : ''}
              </Text>

              {/* Called amount */}
              <Text style={[styles.label, { marginTop: spacing[4] }]}>Called Amount ($)</Text>
              <View style={styles.amountRow}>
                <MoneyInput
                  style={[styles.amtInput, { borderColor: theme.colors.primary }]}
                  value={calledAmt}
                  onChangeText={setCalledAmt}
                  placeholder="$0.00"
                  placeholderTextColor="#aaa"
                />
                <Pressable
                  style={[styles.btn, { backgroundColor: theme.colors.primary }]}
                  onPress={updateCalledAmount}
                  disabled={working}
                >
                  <Text style={styles.btnText}>Update</Text>
                </Pressable>
              </View>

              {/* Award item */}
              <Text style={[styles.label, { marginTop: spacing[5] }]}>Award Item to Winner</Text>
              <AwardWinnerInput
                item={currentItem}
                onAward={(winnerId) => awardItem(currentItem, winnerId)}
                disabled={working}
                theme={theme}
              />
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.infoText}>No item selected. Tap "Next Item" to begin.</Text>
            </View>
          )}

          {/* Controls */}
          <Pressable
            style={[styles.bigBtn, { backgroundColor: theme.colors.accent }]}
            onPress={advanceItem}
            disabled={working}
          >
            {working
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.bigBtnText}>Next Item →</Text>}
          </Pressable>

          {/* Ends the auction independently of the event's own status — the
              round finishing and the auction finishing are different moments. */}
          <Pressable
            style={[styles.bigBtn, { backgroundColor: '#7f8c8d', marginTop: spacing[3] }]}
            onPress={() => confirmAction(
              'End the live auction?',
              'Attendee screens will stop showing a live auction. Silent items keep '
                + 'running on their own timers, and winners can still be charged.',
              endSession,
              'End Auction',
            )}
            disabled={working}
          >
            {working
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.bigBtnText}>End Auction</Text>}
          </Pressable>

          {/* Queue */}
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>
            Remaining Items ({items.filter(i => i.status === 'Open' || i.status === 'Extended').length})
          </Text>
          {items.filter(i => i.status === 'Open' || i.status === 'Extended').map(item => (
            <View
              key={item.id}
              style={[
                styles.miniCard,
                item.id === session.currentItemId && { borderLeftWidth: 3, borderLeftColor: theme.colors.primary },
              ]}
            >
              <Text style={{ fontWeight: '700', color: theme.colors.primary }}>{item.title}</Text>
              <Text style={{ color: '#555', fontSize: fontSize.xs }}>
                Starting: {fmt(item.startingBidCents)}
                {item.id === session.currentItemId ? '  ← On stage now' : ''}
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

// ── Award Winner Input ────────────────────────────────────────────────────────

function AwardWinnerInput({
  onAward, disabled,
}: {
  item:     AuctionItem;
  onAward:  (winnerId: string) => void;
  disabled: boolean;
  theme:    ReturnType<typeof import('@gfp/ui').useTheme>;
}) {
  const [winnerId, setWinnerId] = useState('');
  const [idError,  setIdError]  = useState<string | null>(null);

  function handleAward() {
    const id = winnerId.trim();
    if (!id) { setIdError('Enter the winner\'s player ID.'); return; }
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(id)) { setIdError('Enter a valid player ID (UUID format, e.g. from the Teams screen).'); return; }
    setIdError(null);
    onAward(id);
    setWinnerId('');
  }

  return (
    <View>
      <Text style={{ color: '#666', fontSize: fontSize.sm, marginBottom: spacing[2] }}>
        Find the player ID on the Teams or Registration screen.
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <TextInput
          style={[
            styles.amtInput,
            { flex: 1, borderColor: idError ? '#e74c3c' : '#ddd', fontSize: fontSize.md },
          ]}
          value={winnerId}
          onChangeText={v => { setWinnerId(v); if (idError) setIdError(null); }}
          placeholder="Player ID (UUID)"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          style={[styles.btn, { backgroundColor: '#27ae60' }, (disabled || !winnerId.trim()) && { opacity: 0.5 }]}
          disabled={disabled || !winnerId.trim()}
          onPress={handleAward}
        >
          <Text style={styles.btnText}>Award</Text>
        </Pressable>
      </View>
      {idError && <Text style={{ color: '#e74c3c', fontSize: fontSize.xs, marginTop: spacing[1] }}>{idError}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  page:        { flex: 1, backgroundColor: '#f5f5f5' },
  content:     { padding: spacing[5], paddingBottom: 60, gap: spacing[3] },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heading:     { fontSize: fontSize.title, fontWeight: '800' },
  card:        { backgroundColor: '#fff', borderRadius: radius.lg, padding: spacing[4], boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.06)', elevation: 1 },
  banner:      { borderRadius: radius.lg, padding: spacing[4], alignItems: 'center' },
  bannerText:  { color: '#fff', fontWeight: '800', fontSize: fontSize.xl, letterSpacing: 0.5 },
  infoText:    { fontSize: fontSize.md, color: '#555', marginBottom: spacing[3] },
  itemTitle:   { fontSize: fontSize.xl, fontWeight: '800', marginBottom: spacing[2] },
  itemDesc:    { color: '#555', fontSize: fontSize.md, marginBottom: spacing[2] },
  itemMeta:    { color: '#777', fontSize: fontSize.sm },
  label:       { fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing[2], color: '#333' },
  amountRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  dollarSign:  { fontSize: fontSize.xxl, fontWeight: '800', color: '#27ae60' },
  amtInput:    { borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: spacing[3], paddingVertical: spacing[3], fontSize: fontSize.xl, fontWeight: '700', minWidth: 100, backgroundColor: '#fafafa' },
  btn:         { paddingHorizontal: spacing[4], paddingVertical: spacing[3], borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnText:     { color: '#fff', fontWeight: '700', fontSize: fontSize.md },
  bigBtn:      { paddingVertical: spacing[4], borderRadius: radius.lg, alignItems: 'center' },
  bigBtnText:  { color: '#fff', fontWeight: '800', fontSize: fontSize.xl },
  sectionTitle: { fontSize: fontSize.xl, fontWeight: '700' },
  miniCard:    { backgroundColor: '#fff', borderRadius: radius.md, padding: spacing[3] },
  errorBox:    { backgroundColor: '#fdf2f2', borderRadius: radius.md, padding: spacing[3], borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
  errorText:   { color: '#c0392b', fontSize: fontSize.md, fontWeight: '600' },
  successBox:  { backgroundColor: '#f0faf4', borderRadius: radius.md, padding: spacing[3], borderLeftWidth: 3, borderLeftColor: '#27ae60' },
  successText: { color: '#1a6b3c', fontSize: fontSize.md, fontWeight: '600' },
  warnBox:     { backgroundColor: '#fff8e1', borderRadius: radius.md, padding: spacing[3], marginBottom: spacing[3], borderLeftWidth: 3, borderLeftColor: '#f39c12' },
  warnText:    { color: '#7d5a00', fontSize: fontSize.sm },
});
