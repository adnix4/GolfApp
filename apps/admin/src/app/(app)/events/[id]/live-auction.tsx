import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, TextInput,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { auctionApi, type AuctionItem, type AuctionSession } from '@/lib/api';

export default function LiveAuctionScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  const [items,     setItems]     = useState<AuctionItem[]>([]);
  const [session,   setSession]   = useState<AuctionSession | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [working,   setWorking]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [success,   setSuccess]   = useState<string | null>(null);
  const [calledAmt, setCalledAmt] = useState('');

  const currentItem = session?.currentItemId
    ? items.find(i => i.id === session.currentItemId) ?? null
    : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemData, sessionData] = await Promise.all([
        auctionApi.getItems(eventId),
        auctionApi.getActiveSession(eventId).catch(() => null),
      ]);
      setItems(itemData.filter(i => i.auctionType === 'Live' || i.auctionType === 'DonationLive'));
      setSession(sessionData);
      if (sessionData) {
        setCalledAmt(centsToDollars(sessionData.currentCalledAmountCents));
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to load live auction data.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

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

  async function advanceItem() {
    clearFeedback();
    setWorking(true);
    try {
      const s = await auctionApi.nextItem(eventId);
      setSession(s);
      setCalledAmt(centsToDollars(s.currentCalledAmountCents));
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

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

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
          <Pressable onPress={() => setError(null)} style={{ marginTop: 6 }}>
            <Text style={{ color: '#c0392b', fontSize: 12 }}>Dismiss</Text>
          </Pressable>
        </View>
      )}
      {success && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>✓ {success}</Text>
          <Pressable onPress={() => setSuccess(null)} style={{ marginTop: 6 }}>
            <Text style={{ color: '#1a6b3c', fontSize: 12 }}>Dismiss</Text>
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
            <Text style={[styles.infoText, { marginBottom: 16, color: '#555' }]}>
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
              <Text style={[styles.label, { marginTop: 16 }]}>Called Amount ($)</Text>
              <View style={styles.amountRow}>
                <Text style={styles.dollarSign}>$</Text>
                <TextInput
                  style={[styles.amtInput, { borderColor: theme.colors.primary }]}
                  value={calledAmt}
                  onChangeText={setCalledAmt}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
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
              <Text style={[styles.label, { marginTop: 20 }]}>Award Item to Winner</Text>
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

          {/* Queue */}
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>
            Remaining Items ({items.filter(i => i.status === 'Open').length})
          </Text>
          {items.filter(i => i.status === 'Open').map(item => (
            <View
              key={item.id}
              style={[
                styles.miniCard,
                item.id === session.currentItemId && { borderLeftWidth: 3, borderLeftColor: theme.colors.primary },
              ]}
            >
              <Text style={{ fontWeight: '700', color: theme.colors.primary }}>{item.title}</Text>
              <Text style={{ color: '#555', fontSize: 12 }}>
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(val: string): number {
  const n = parseFloat(val.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

// ── Award Winner Input ────────────────────────────────────────────────────────

function AwardWinnerInput({
  item, onAward, disabled, theme,
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
      <Text style={{ color: '#666', fontSize: 13, marginBottom: 8 }}>
        Find the player ID on the Teams or Registration screen.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          style={[
            styles.amtInput,
            { flex: 1, borderColor: idError ? '#e74c3c' : '#ddd', fontSize: 14 },
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
      {idError && <Text style={{ color: '#e74c3c', fontSize: 12, marginTop: 4 }}>{idError}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  page:        { flex: 1, backgroundColor: '#f5f5f5' },
  content:     { padding: 20, paddingBottom: 60, gap: 12 },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heading:     { fontSize: 22, fontWeight: '800' },
  card:        { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  banner:      { borderRadius: 10, padding: 14, alignItems: 'center' },
  bannerText:  { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
  infoText:    { fontSize: 14, color: '#555', marginBottom: 12 },
  itemTitle:   { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  itemDesc:    { color: '#555', fontSize: 14, marginBottom: 8 },
  itemMeta:    { color: '#777', fontSize: 13 },
  label:       { fontSize: 13, fontWeight: '600', marginBottom: 6, color: '#333' },
  amountRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dollarSign:  { fontSize: 20, fontWeight: '800', color: '#27ae60' },
  amtInput:    { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 18, fontWeight: '700', minWidth: 100, backgroundColor: '#fafafa' },
  btn:         { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnText:     { color: '#fff', fontWeight: '700', fontSize: 14 },
  bigBtn:      { paddingVertical: 16, borderRadius: 10, alignItems: 'center' },
  bigBtnText:  { color: '#fff', fontWeight: '800', fontSize: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  miniCard:    { backgroundColor: '#fff', borderRadius: 8, padding: 12 },
  errorBox:    { backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
  errorText:   { color: '#c0392b', fontSize: 14, fontWeight: '600' },
  successBox:  { backgroundColor: '#f0faf4', borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: '#27ae60' },
  successText: { color: '#1a6b3c', fontSize: 14, fontWeight: '600' },
  warnBox:     { backgroundColor: '#fff8e1', borderRadius: 8, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#f39c12' },
  warnText:    { color: '#7d5a00', fontSize: 13 },
});
