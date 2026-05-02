import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, TextInput,
  Modal, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { auctionApi, AuctionItem, CreateAuctionItemPayload } from '@/lib/api';

const AUCTION_TYPES = ['Silent', 'Live', 'DonationSilent', 'DonationLive'];

const emptyForm = (): CreateAuctionItemPayload => ({
  title: '',
  description: '',
  auctionType: 'Silent',
  startingBidCents: 0,
  bidIncrementCents: 500,
  fairMarketValueCents: 0,
  displayOrder: 0,
});

export default function AuctionScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  const [items, setItems]       = useState<AuctionItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem]   = useState<AuctionItem | null>(null);
  const [form, setForm]           = useState<CreateAuctionItemPayload>(emptyForm());
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await auctionApi.getItems(eventId);
      setItems(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load auction items');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditItem(null);
    setForm(emptyForm());
    setShowModal(true);
  }

  function openEdit(item: AuctionItem) {
    setEditItem(item);
    setForm({
      title:               item.title,
      description:         item.description,
      photoUrls:           item.photoUrls,
      auctionType:         item.auctionType,
      startingBidCents:    item.startingBidCents,
      bidIncrementCents:   item.bidIncrementCents,
      buyNowPriceCents:    item.buyNowPriceCents ?? undefined,
      closesAt:            item.closesAt ?? undefined,
      maxExtensionMin:     item.maxExtensionMin,
      displayOrder:        item.displayOrder,
      fairMarketValueCents: item.fairMarketValueCents,
      goalCents:           item.goalCents ?? undefined,
    });
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editItem) {
        await auctionApi.updateItem(eventId, editItem.id, form);
      } else {
        await auctionApi.createItem(eventId, form);
      }
      setShowModal(false);
      await load();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: AuctionItem) {
    Alert.alert(
      'Cancel Item',
      `Cancel "${item.title}"? This cannot be undone.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Item', style: 'destructive',
          onPress: async () => {
            try {
              await auctionApi.deleteItem(eventId, item.id);
              await load();
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Delete failed');
            }
          },
        },
      ],
    );
  }

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );

  if (error) return (
    <View style={styles.center}>
      <Text style={{ color: '#c0392b' }}>{error}</Text>
      <Pressable onPress={load} style={[styles.btn, { backgroundColor: theme.colors.primary }]}>
        <Text style={styles.btnText}>Retry</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.primary }]}>
          Auction Items ({items.length})
        </Text>
        <Pressable
          style={[styles.btn, { backgroundColor: theme.colors.primary }]}
          onPress={openCreate}
        >
          <Text style={styles.btnText}>+ Add Item</Text>
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: '#fff' }]}>
            <View style={styles.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: theme.colors.primary }]}>{item.title}</Text>
                <Text style={{ color: theme.colors.accent, fontSize: 12 }}>
                  {item.auctionType} · {item.status}
                </Text>
                <Text style={{ color: '#555', fontSize: 13, marginTop: 4 }}>
                  Start: {fmt(item.startingBidCents)} · Current: {fmt(item.currentHighBidCents)}
                  {item.closesAt ? `  · Closes: ${new Date(item.closesAt).toLocaleString()}` : ''}
                </Text>
              </View>
              <View style={styles.cardActions}>
                <Pressable onPress={() => openEdit(item)} style={[styles.smallBtn, { borderColor: theme.colors.primary }]}>
                  <Text style={{ color: theme.colors.primary, fontSize: 13 }}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(item)} style={[styles.smallBtn, { borderColor: '#e74c3c', marginTop: 6 }]}>
                  <Text style={{ color: '#e74c3c', fontSize: 13 }}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: '#999', marginTop: 40 }}>
            No auction items yet. Tap "+ Add Item" to create one.
          </Text>
        }
      />

      <Modal visible={showModal} animationType="slide" onRequestClose={() => setShowModal(false)}>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>
            {editItem ? 'Edit Item' : 'New Auction Item'}
          </Text>

          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            value={form.title}
            onChangeText={v => setForm(f => ({ ...f, title: v }))}
            placeholder="Item title"
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, { height: 80 }]}
            value={form.description}
            onChangeText={v => setForm(f => ({ ...f, description: v }))}
            placeholder="Item description"
            multiline
          />

          <Text style={styles.label}>Auction Type *</Text>
          <View style={styles.typeRow}>
            {AUCTION_TYPES.map(t => (
              <Pressable
                key={t}
                onPress={() => setForm(f => ({ ...f, auctionType: t }))}
                style={[
                  styles.typeChip,
                  form.auctionType === t && { backgroundColor: theme.colors.primary },
                ]}
              >
                <Text style={{ color: form.auctionType === t ? '#fff' : theme.colors.accent, fontSize: 12 }}>
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Starting Bid (cents) *</Text>
          <TextInput
            style={styles.input}
            value={String(form.startingBidCents ?? 0)}
            onChangeText={v => setForm(f => ({ ...f, startingBidCents: parseInt(v) || 0 }))}
            keyboardType="number-pad"
          />

          <Text style={styles.label}>Bid Increment (cents)</Text>
          <TextInput
            style={styles.input}
            value={String(form.bidIncrementCents ?? 500)}
            onChangeText={v => setForm(f => ({ ...f, bidIncrementCents: parseInt(v) || 500 }))}
            keyboardType="number-pad"
          />

          <Text style={styles.label}>Buy-Now Price (cents, optional)</Text>
          <TextInput
            style={styles.input}
            value={form.buyNowPriceCents ? String(form.buyNowPriceCents) : ''}
            onChangeText={v => setForm(f => ({ ...f, buyNowPriceCents: v ? parseInt(v) : undefined }))}
            keyboardType="number-pad"
            placeholder="Leave blank for no buy-now"
          />

          <Text style={styles.label}>Closes At (ISO string, silent items)</Text>
          <TextInput
            style={styles.input}
            value={form.closesAt ?? ''}
            onChangeText={v => setForm(f => ({ ...f, closesAt: v || undefined }))}
            placeholder="2026-06-01T18:00:00Z"
          />

          <Text style={styles.label}>Fair Market Value (cents)</Text>
          <TextInput
            style={styles.input}
            value={String(form.fairMarketValueCents ?? 0)}
            onChangeText={v => setForm(f => ({ ...f, fairMarketValueCents: parseInt(v) || 0 }))}
            keyboardType="number-pad"
          />

          <Text style={styles.label}>Goal (cents, donation items)</Text>
          <TextInput
            style={styles.input}
            value={form.goalCents ? String(form.goalCents) : ''}
            onChangeText={v => setForm(f => ({ ...f, goalCents: v ? parseInt(v) : undefined }))}
            keyboardType="number-pad"
            placeholder="Leave blank if no goal"
          />

          <Text style={styles.label}>Display Order</Text>
          <TextInput
            style={styles.input}
            value={String(form.displayOrder ?? 0)}
            onChangeText={v => setForm(f => ({ ...f, displayOrder: parseInt(v) || 0 }))}
            keyboardType="number-pad"
          />

          <View style={styles.modalBtnRow}>
            <Pressable
              onPress={() => setShowModal(false)}
              style={[styles.btn, { backgroundColor: '#999', flex: 1, marginRight: 8 }]}
            >
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={[styles.btn, { backgroundColor: theme.colors.primary, flex: 1 }]}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page:    { flex: 1, backgroundColor: '#f5f5f5' },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title:   { fontSize: 18, fontWeight: '800' },
  list:    { paddingHorizontal: 16, paddingBottom: 40 },
  card:    { borderRadius: 12, padding: 14, marginBottom: 10, elevation: 2 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cardActions: { flexDirection: 'column', marginLeft: 12 },
  itemTitle: { fontSize: 15, fontWeight: '700' },
  btn:     { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  label:   { fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 4 },
  input:   { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#fafafa' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#ddd' },
  modalContent: { padding: 24, paddingBottom: 60 },
  modalTitle:   { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  modalBtnRow:  { flexDirection: 'row', marginTop: 28 },
});
