import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, TextInput,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { auctionApi, AuctionItem, AuctionSession } from '@/lib/api';

export default function LiveAuctionScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  const [items, setItems]         = useState<AuctionItem[]>([]);
  const [session, setSession]     = useState<AuctionSession | null>(null);
  const [loading, setLoading]     = useState(true);
  const [calledAmt, setCalledAmt] = useState('');
  const [working, setWorking]     = useState(false);

  const currentItem = session?.currentItemId
    ? items.find(i => i.id === session.currentItemId) ?? null
    : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [itemData, sessionData] = await Promise.all([
        auctionApi.getItems(eventId),
        auctionApi.getActiveSession(eventId).catch(() => null),
      ]);
      setItems(itemData.filter(i => i.auctionType === 'Live' || i.auctionType === 'DonationLive'));
      setSession(sessionData);
      if (sessionData) {
        setCalledAmt(String(sessionData.currentCalledAmountCents));
      }
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  async function startSession() {
    setWorking(true);
    try {
      const s = await auctionApi.startSession(eventId);
      setSession(s);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to start');
    } finally {
      setWorking(false);
    }
  }

  async function advanceItem() {
    setWorking(true);
    try {
      const s = await auctionApi.nextItem(eventId);
      setSession(s);
      setCalledAmt(String(s.currentCalledAmountCents));
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to advance');
    } finally {
      setWorking(false);
    }
  }

  async function updateCalledAmount() {
    if (!session) return;
    const cents = parseInt(calledAmt) || 0;
    setWorking(true);
    try {
      const s = await auctionApi.updateCalledAmount(eventId, cents);
      setSession(s);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to update amount');
    } finally {
      setWorking(false);
    }
  }

  async function awardItem(item: AuctionItem, winnerId: string) {
    const cents = parseInt(calledAmt) || item.currentHighBidCents;
    setWorking(true);
    try {
      await auctionApi.awardItem(item.id, winnerId, cents);
      Alert.alert('Awarded', `"${item.title}" awarded successfully. Charge initiated.`);
      await load();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to award');
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
    <ScrollView style={styles.page} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
      <Text style={[styles.heading, { color: theme.colors.primary }]}>Live Auction Host Control</Text>

      {/* Session status */}
      {!session ? (
        <View style={styles.card}>
          <Text style={{ fontSize: 15, color: '#555', marginBottom: 16 }}>
            No live auction session is active.
          </Text>
          <Pressable
            style={[styles.bigBtn, { backgroundColor: theme.colors.primary }]}
            onPress={startSession}
            disabled={working}
          >
            {working
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.bigBtnText}>▶  Start Live Auction</Text>}
          </Pressable>
        </View>
      ) : (
        <>
          {/* Session active banner */}
          <View style={[styles.banner, { backgroundColor: '#27ae60' }]}>
            <Text style={styles.bannerText}>🔴 LIVE AUCTION IN PROGRESS</Text>
          </View>

          {/* Current item display */}
          {currentItem ? (
            <View style={styles.card}>
              <Text style={[styles.itemTitle, { color: theme.colors.primary }]}>
                {currentItem.title}
              </Text>
              <Text style={{ color: '#555', fontSize: 14, marginBottom: 12 }}>
                {currentItem.description}
              </Text>
              <Text style={{ color: '#555' }}>
                Starting: {fmt(currentItem.startingBidCents)}
              </Text>

              {/* Called amount input */}
              <Text style={[styles.label, { marginTop: 16 }]}>Currently Called Amount</Text>
              <View style={styles.amountRow}>
                <TextInput
                  style={[styles.amtInput, { borderColor: theme.colors.primary }]}
                  value={calledAmt}
                  onChangeText={setCalledAmt}
                  keyboardType="number-pad"
                  placeholder="cents"
                />
                <Text style={styles.amtDisplay}>
                  = {fmt(parseInt(calledAmt) || 0)}
                </Text>
                <Pressable
                  style={[styles.btn, { backgroundColor: theme.colors.primary }]}
                  onPress={updateCalledAmount}
                  disabled={working}
                >
                  <Text style={styles.btnText}>Update</Text>
                </Pressable>
              </View>

              {/* Award item */}
              <Text style={[styles.label, { marginTop: 20 }]}>Award Item</Text>
              <Text style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>
                Enter winner player ID to award at the current called amount.
              </Text>
              <AwardWinnerInput
                item={currentItem}
                calledCents={parseInt(calledAmt) || 0}
                onAward={(winnerId) => awardItem(currentItem, winnerId)}
                disabled={working}
                theme={theme}
              />
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={{ color: '#888', fontSize: 15 }}>
                No item selected. Tap "Next Item" to begin.
              </Text>
            </View>
          )}

          {/* Controls */}
          <View style={styles.controlRow}>
            <Pressable
              style={[styles.bigBtn, { backgroundColor: theme.colors.accent, flex: 1, marginRight: 8 }]}
              onPress={advanceItem}
              disabled={working}
            >
              <Text style={styles.bigBtnText}>Next Item →</Text>
            </Pressable>
          </View>

          {/* Upcoming items list */}
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>
            Remaining Items ({items.filter(i => i.status === 'Open').length})
          </Text>
          {items.filter(i => i.status === 'Open').map(item => (
            <View key={item.id} style={[styles.miniCard, { opacity: item.id === session.currentItemId ? 1 : 0.7 }]}>
              <Text style={{ fontWeight: '700', color: theme.colors.primary }}>{item.title}</Text>
              <Text style={{ color: '#555', fontSize: 12 }}>
                Start: {fmt(item.startingBidCents)}
                {item.id === session.currentItemId ? '  ← Current' : ''}
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function AwardWinnerInput({
  item, calledCents, onAward, disabled, theme,
}: {
  item: AuctionItem;
  calledCents: number;
  onAward: (winnerId: string) => void;
  disabled: boolean;
  theme: ReturnType<typeof import('@gfp/ui').useTheme>;
}) {
  const [winnerId, setWinnerId] = useState('');

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <TextInput
        style={[styles.amtInput, { flex: 1, borderColor: '#ddd' }]}
        value={winnerId}
        onChangeText={setWinnerId}
        placeholder="Winner player ID (UUID)"
      />
      <Pressable
        style={[styles.btn, { backgroundColor: '#27ae60' }]}
        disabled={disabled || !winnerId.trim()}
        onPress={() => {
          if (winnerId.trim()) {
            onAward(winnerId.trim());
            setWinnerId('');
          }
        }}
      >
        <Text style={styles.btnText}>Award</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page:        { flex: 1, backgroundColor: '#f5f5f5' },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heading:     { fontSize: 22, fontWeight: '800', marginBottom: 16 },
  card:        { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, elevation: 2 },
  banner:      { borderRadius: 10, padding: 14, marginBottom: 16, alignItems: 'center' },
  bannerText:  { color: '#fff', fontWeight: '800', fontSize: 16 },
  itemTitle:   { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  label:       { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  amountRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amtInput:    { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, minWidth: 100 },
  amtDisplay:  { fontSize: 20, fontWeight: '800', color: '#27ae60', flex: 1 },
  btn:         { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  btnText:     { color: '#fff', fontWeight: '700', fontSize: 14 },
  bigBtn:      { paddingVertical: 16, borderRadius: 10, alignItems: 'center' },
  bigBtnText:  { color: '#fff', fontWeight: '800', fontSize: 16 },
  controlRow:  { flexDirection: 'row', marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  miniCard:    { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8 },
});
