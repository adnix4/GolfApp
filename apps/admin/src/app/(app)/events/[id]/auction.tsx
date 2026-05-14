import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, TextInput,
  Modal, ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { auctionApi, resolveUrl, type AuctionItem, type CreateAuctionItemPayload } from '@/lib/api';

const AUCTION_TYPES = ['Silent', 'Live', 'DonationSilent', 'DonationLive'] as const;
const TYPE_LABELS: Record<string, string> = {
  Silent: 'Silent', Live: 'Live', DonationSilent: 'Donation (Silent)', DonationLive: 'Donation (Live)',
};

// ── Money helpers ─────────────────────────────────────────────────────────────

function centsToDollars(cents: number | undefined): string {
  if (!cents && cents !== 0) return '';
  return (cents / 100).toFixed(2);
}

function dollarsToCents(val: string): number {
  const n = parseFloat(val.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

// ── Date helpers (for "Closes At") ───────────────────────────────────────────

function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function buildClosesAt(date: string, time: string, ampm: 'AM' | 'PM'): string | undefined {
  if (!date || date.length < 10) return undefined;
  const [mStr, dStr, yStr] = date.split('/');
  const m = Number(mStr), d = Number(dStr), y = Number(yStr);
  if (!m || !d || !y) return undefined;
  let h = 0, min = 0;
  if (time && time.length >= 5) {
    const [hStr, minStr] = time.split(':');
    h   = Number(hStr) || 0;
    min = Number(minStr) || 0;
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
  }
  return new Date(y, m - 1, d, h, min).toISOString();
}

function parseClosesAt(iso: string | null | undefined): { date: string; time: string; ampm: 'AM' | 'PM' } {
  if (!iso) return { date: '', time: '', ampm: 'AM' };
  const dt  = new Date(iso);
  const mo  = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  const yr  = dt.getFullYear();
  let h     = dt.getHours();
  const min = String(dt.getMinutes()).padStart(2, '0');
  const ampm: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return { date: `${mo}/${day}/${yr}`, time: `${String(h).padStart(2, '0')}:${min}`, ampm };
}

// ── Form state shape ──────────────────────────────────────────────────────────

interface AuctionForm {
  title:           string;
  description:     string;
  auctionType:     string;
  startingBid:     string;   // dollars
  bidIncrement:    string;   // dollars
  buyNowPrice:     string;   // dollars, empty = none
  closeDate:       string;   // MM/DD/YYYY
  closeTime:       string;   // HH:MM
  closeAmpm:       'AM' | 'PM';
  fairMarketValue: string;   // dollars
  goal:            string;   // dollars, only for donation types
  displayOrder:    string;
}

function emptyForm(): AuctionForm {
  return {
    title: '', description: '', auctionType: 'Silent',
    startingBid: '', bidIncrement: '5.00', buyNowPrice: '',
    closeDate: '', closeTime: '', closeAmpm: 'AM',
    fairMarketValue: '', goal: '', displayOrder: '0',
  };
}

function itemToForm(item: AuctionItem): AuctionForm {
  const c = parseClosesAt(item.closesAt);
  return {
    title:           item.title,
    description:     item.description,
    auctionType:     item.auctionType,
    startingBid:     centsToDollars(item.startingBidCents),
    bidIncrement:    centsToDollars(item.bidIncrementCents),
    buyNowPrice:     item.buyNowPriceCents ? centsToDollars(item.buyNowPriceCents) : '',
    closeDate:       c.date,
    closeTime:       c.time,
    closeAmpm:       c.ampm,
    fairMarketValue: centsToDollars(item.fairMarketValueCents),
    goal:            item.goalCents ? centsToDollars(item.goalCents) : '',
    displayOrder:    String(item.displayOrder),
  };
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AuctionScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  const [items,     setItems]     = useState<AuctionItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editItem,  setEditItem]  = useState<AuctionItem | null>(null);
  const [form,      setForm]      = useState<AuctionForm>(emptyForm());
  const [saving,       setSaving]       = useState(false);
  const [modalError,   setModalError]   = useState<string | null>(null);
  const [fieldErrors,  setFieldErrors]  = useState<Record<string, string>>({});
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await auctionApi.getItems(eventId));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load auction items.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditItem(null);
    setForm(emptyForm());
    setModalError(null);
    setFieldErrors({});
    setPendingPhotos([]);
    setShowModal(true);
  }

  function openEdit(item: AuctionItem) {
    setEditItem(item);
    setForm(itemToForm(item));
    setModalError(null);
    setFieldErrors({});
    setPendingPhotos([]);
    setShowModal(true);
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = 'Title is required.';
    const bid = dollarsToCents(form.startingBid);
    if (!form.startingBid.trim()) errs.startingBid = 'Starting bid is required.';
    else if (bid <= 0) errs.startingBid = 'Starting bid must be greater than $0.00.';
    if (form.closeDate && form.closeDate.length > 0 && form.closeDate.length < 10)
      errs.closeDate = 'Enter a complete date (MM/DD/YYYY).';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setModalError(null);
    try {
      const payload: CreateAuctionItemPayload = {
        title:               form.title.trim(),
        description:         form.description.trim(),
        auctionType:         form.auctionType,
        startingBidCents:    dollarsToCents(form.startingBid),
        bidIncrementCents:   dollarsToCents(form.bidIncrement) || 500,
        fairMarketValueCents: dollarsToCents(form.fairMarketValue),
        displayOrder:        parseInt(form.displayOrder) || 0,
        ...(form.buyNowPrice.trim()  ? { buyNowPriceCents:  dollarsToCents(form.buyNowPrice)  } : {}),
        ...(form.goal.trim()         ? { goalCents:         dollarsToCents(form.goal)          } : {}),
        ...(form.closeDate.length >= 10
          ? { closesAt: buildClosesAt(form.closeDate, form.closeTime, form.closeAmpm) }
          : {}),
      };
      let saved: AuctionItem;
      if (editItem) {
        saved = await auctionApi.updateItem(eventId, editItem.id, payload);
      } else {
        saved = await auctionApi.createItem(eventId, payload);
      }
      for (const file of pendingPhotos) {
        saved = await auctionApi.uploadPhoto(eventId, saved.id, file);
      }
      setPendingPhotos([]);
      setShowModal(false);
      await load();
    } catch (e: any) {
      setModalError(e.message ?? 'Failed to save. Check the details and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: AuctionItem) {
    Alert.alert(
      'Cancel Auction Item',
      `Cancel "${item.title}"? This cannot be undone.`,
      [
        { text: 'Keep Item', style: 'cancel' },
        {
          text: 'Cancel Item', style: 'destructive',
          onPress: async () => {
            try {
              await auctionApi.deleteItem(eventId, item.id);
              await load();
            } catch (e: any) {
              setError(e.message ?? 'Failed to cancel item. Please try again.');
            }
          },
        },
      ],
    );
  }

  async function handlePhotoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (editItem) {
      setUploadingPhoto(true);
      setModalError(null);
      try {
        const updated = await auctionApi.uploadPhoto(eventId, editItem.id, file);
        setEditItem(updated);
      } catch (err: any) {
        setModalError(err.message ?? 'Failed to upload photo.');
      } finally {
        setUploadingPhoto(false);
      }
    } else {
      setPendingPhotos(prev => [...prev, file]);
    }
  }

  async function handlePhotoRemove(url: string) {
    if (!editItem) {
      // For new items, remove from pending local previews (not yet uploaded)
      return;
    }
    const updated = await auctionApi.updateItem(eventId, editItem.id, {
      photoUrls: editItem.photoUrls.filter(u => u !== url),
    });
    setEditItem(updated);
  }

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  function field(key: keyof AuctionForm, value: string) {
    setForm(f => ({ ...f, [key]: value }));
    if (fieldErrors[key]) setFieldErrors(p => { const n = { ...p }; delete n[key]; return n; });
  }

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.primary }]}>
          Auction Items ({items.length})
        </Text>
        <Pressable style={[styles.btn, { backgroundColor: theme.colors.primary }]} onPress={openCreate}>
          <Text style={styles.btnText}>+ Add Item</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={load} style={{ marginTop: 8 }}>
            <Text style={{ color: theme.colors.action, fontSize: 13 }}>Retry</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: '#fff' }]}>
            <View style={styles.cardRow}>
              {item.photoUrls.length > 0 ? (
                <Image
                  source={{ uri: resolveUrl(item.photoUrls[0]) }}
                  style={styles.listThumb}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.listThumbPlaceholder}>
                  <Text style={styles.listThumbIcon}>🖼</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: theme.colors.primary }]}>{item.title}</Text>
                <Text style={{ color: theme.colors.accent, fontSize: 12, marginTop: 2 }}>
                  {TYPE_LABELS[item.auctionType] ?? item.auctionType} · {item.status}
                </Text>
                <Text style={{ color: '#555', fontSize: 13, marginTop: 4 }}>
                  Starting: {fmt(item.startingBidCents)} · High bid: {fmt(item.currentHighBidCents)}
                </Text>
                {item.closesAt && (
                  <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
                    Closes: {new Date(item.closesAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}
              </View>
              <View style={styles.cardActions}>
                <Pressable onPress={() => openEdit(item)} style={[styles.smallBtn, { borderColor: theme.colors.primary }]}>
                  <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '600' }}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(item)} style={[styles.smallBtn, { borderColor: '#e74c3c', marginTop: 6 }]}>
                  <Text style={{ color: '#e74c3c', fontSize: 13, fontWeight: '600' }}>Cancel</Text>
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

      {/* ── Create / Edit Modal ── */}
      <Modal visible={showModal} animationType="slide" onRequestClose={() => setShowModal(false)}>
        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <Text style={[styles.modalTitle, { color: theme.colors.primary }]}>
            {editItem ? 'Edit Auction Item' : 'New Auction Item'}
          </Text>

          {modalError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{modalError}</Text>
            </View>
          )}

          {/* Title */}
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={[styles.input, fieldErrors.title && styles.inputError]}
            value={form.title}
            onChangeText={v => field('title', v)}
            placeholder="Signed golf bag, spa package, etc."
            placeholderTextColor="#999"
          />
          {fieldErrors.title && <Text style={styles.fieldError}>{fieldErrors.title}</Text>}

          {/* Description */}
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, { minHeight: 80 }]}
            value={form.description}
            onChangeText={v => field('description', v)}
            placeholder="Describe the item, donor, or condition..."
            placeholderTextColor="#999"
            multiline
          />

          {/* Auction Type */}
          <Text style={styles.label}>Auction Type *</Text>
          <View style={styles.typeRow}>
            {AUCTION_TYPES.map(t => (
              <Pressable
                key={t}
                onPress={() => field('auctionType', t)}
                style={[styles.typeChip, form.auctionType === t && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
              >
                <Text style={{ color: form.auctionType === t ? '#fff' : theme.colors.accent, fontSize: 12, fontWeight: '600' }}>
                  {TYPE_LABELS[t]}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Starting Bid */}
          <Text style={styles.label}>Starting Bid ($) *</Text>
          <View style={styles.dollarRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={[styles.input, styles.dollarInput, fieldErrors.startingBid && styles.inputError]}
              value={form.startingBid}
              onChangeText={v => field('startingBid', v)}
              keyboardType="decimal-pad"
              placeholder="25.00"
              placeholderTextColor="#999"
            />
          </View>
          {fieldErrors.startingBid && <Text style={styles.fieldError}>{fieldErrors.startingBid}</Text>}

          {/* Bid Increment (silent/live only) */}
          {(form.auctionType === 'Silent' || form.auctionType === 'Live') && (
            <>
              <Text style={styles.label}>Bid Increment ($)</Text>
              <View style={styles.dollarRow}>
                <Text style={styles.dollarSign}>$</Text>
                <TextInput
                  style={[styles.input, styles.dollarInput]}
                  value={form.bidIncrement}
                  onChangeText={v => field('bidIncrement', v)}
                  keyboardType="decimal-pad"
                  placeholder="5.00"
                  placeholderTextColor="#999"
                />
              </View>
            </>
          )}

          {/* Buy-Now Price */}
          <Text style={styles.label}>Buy-Now Price ($) — optional</Text>
          <View style={styles.dollarRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={[styles.input, styles.dollarInput]}
              value={form.buyNowPrice}
              onChangeText={v => field('buyNowPrice', v)}
              keyboardType="decimal-pad"
              placeholder="Leave blank for no buy-now option"
              placeholderTextColor="#999"
            />
          </View>

          {/* Closes At — only for silent types */}
          {(form.auctionType === 'Silent' || form.auctionType === 'DonationSilent') && (
            <>
              <Text style={styles.label}>Closes At — optional</Text>
              <View style={styles.dateTimeRow}>
                <TextInput
                  style={[styles.input, styles.dateInput, fieldErrors.closeDate && styles.inputError]}
                  value={form.closeDate}
                  onChangeText={v => field('closeDate', formatDateInput(v))}
                  placeholder="MM/DD/YYYY"
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.input, styles.timeInput]}
                  value={form.closeTime}
                  onChangeText={v => field('closeTime', formatTimeInput(v))}
                  placeholder="HH:MM"
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                />
                <Pressable
                  style={[styles.ampmBtn, { borderColor: theme.colors.primary }]}
                  onPress={() => setForm(f => ({ ...f, closeAmpm: f.closeAmpm === 'AM' ? 'PM' : 'AM' }))}
                >
                  <Text style={[styles.ampmText, { color: theme.colors.primary }]}>{form.closeAmpm}</Text>
                </Pressable>
              </View>
              {fieldErrors.closeDate && <Text style={styles.fieldError}>{fieldErrors.closeDate}</Text>}
            </>
          )}

          {/* Goal — for donation types */}
          {(form.auctionType === 'DonationSilent' || form.auctionType === 'DonationLive') && (
            <>
              <Text style={styles.label}>Donation Goal ($) — optional</Text>
              <View style={styles.dollarRow}>
                <Text style={styles.dollarSign}>$</Text>
                <TextInput
                  style={[styles.input, styles.dollarInput]}
                  value={form.goal}
                  onChangeText={v => field('goal', v)}
                  keyboardType="decimal-pad"
                  placeholder="Leave blank if no target goal"
                  placeholderTextColor="#999"
                />
              </View>
            </>
          )}

          {/* Fair Market Value */}
          <Text style={styles.label}>Fair Market Value ($)</Text>
          <View style={styles.dollarRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={[styles.input, styles.dollarInput]}
              value={form.fairMarketValue}
              onChangeText={v => field('fairMarketValue', v)}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#999"
            />
          </View>

          {/* Display Order */}
          <Text style={styles.label}>Display Order</Text>
          <TextInput
            style={styles.input}
            value={form.displayOrder}
            onChangeText={v => field('displayOrder', v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="0 = first"
            placeholderTextColor="#999"
          />

          {/* Photos */}
          <Text style={styles.label}>Photos</Text>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            style={{ display: 'none' }}
            ref={photoInputRef as any}
            onChange={handlePhotoFileChange as any}
          />
          <View style={styles.photoGrid}>
            {(editItem?.photoUrls ?? []).map(url => (
              <View key={url} style={styles.photoThumbWrap}>
                <Image source={{ uri: resolveUrl(url) }} style={styles.photoThumb} resizeMode="cover" />
                <Pressable
                  style={styles.photoRemoveBtn}
                  onPress={() => handlePhotoRemove(url)}
                >
                  <Text style={styles.photoRemoveText}>✕</Text>
                </Pressable>
              </View>
            ))}
            {pendingPhotos.map((f, i) => (
              <View key={i} style={[styles.photoThumbWrap, styles.photoPending]}>
                <Text style={styles.photoPendingText} numberOfLines={2}>{f.name}</Text>
                <Pressable
                  style={styles.photoRemoveBtn}
                  onPress={() => setPendingPhotos(prev => prev.filter((_, j) => j !== i))}
                >
                  <Text style={styles.photoRemoveText}>✕</Text>
                </Pressable>
              </View>
            ))}
            <Pressable
              style={[styles.photoAddBtn, { borderColor: theme.colors.accent }]}
              onPress={() => (photoInputRef.current as any)?.click()}
              disabled={uploadingPhoto || saving}
            >
              {uploadingPhoto
                ? <ActivityIndicator size="small" color={theme.colors.accent} />
                : <Text style={[styles.photoAddText, { color: theme.colors.accent }]}>+ Add Photo</Text>}
            </Pressable>
          </View>

          <View style={styles.modalBtnRow}>
            <Pressable
              onPress={() => setShowModal(false)}
              style={[styles.btn, { backgroundColor: '#888', flex: 1, marginRight: 8 }]}
            >
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={[styles.btn, { backgroundColor: theme.colors.primary, flex: 1 }, saving && { opacity: 0.6 }]}
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
  card:    { borderRadius: 12, padding: 14, marginBottom: 10, elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  listThumb: { width: 64, height: 64, borderRadius: 8 },
  listThumbPlaceholder: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  listThumbIcon: { fontSize: 24 },
  cardActions: { flexDirection: 'column', marginLeft: 12, alignItems: 'flex-end' },
  itemTitle: { fontSize: 15, fontWeight: '700' },
  btn:     { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  label:   { fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 4, color: '#333' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
    backgroundColor: '#fafafa',
  },
  inputError: { borderColor: '#e74c3c', backgroundColor: '#fdf2f2' },
  fieldError: { color: '#e74c3c', fontSize: 12, marginTop: 3 },
  errorBox: {
    backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, marginBottom: 12,
    borderLeftWidth: 3, borderLeftColor: '#e74c3c',
  },
  errorText: { color: '#c0392b', fontSize: 14 },
  typeRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fafafa' },
  dollarRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dollarSign:   { fontSize: 18, fontWeight: '700', color: '#555', paddingBottom: 2 },
  dollarInput:  { flex: 1 },
  dateTimeRow:  { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dateInput:    { flex: 2 },
  timeInput:    { flex: 1 },
  ampmBtn:      { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5 },
  ampmText:     { fontSize: 14, fontWeight: '700' },
  modalContent: { padding: 24, paddingBottom: 60 },
  modalTitle:   { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  modalBtnRow:  { flexDirection: 'row', marginTop: 28 },
  photoGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  photoThumbWrap: { width: 72, height: 72, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  photoThumb:    { width: 72, height: 72 },
  photoPending:  { backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', padding: 4 },
  photoPendingText: { fontSize: 10, color: '#555', textAlign: 'center' },
  photoRemoveBtn: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10,
    width: 18, height: 18, justifyContent: 'center', alignItems: 'center',
  },
  photoRemoveText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  photoAddBtn:  {
    width: 72, height: 72, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center',
  },
  photoAddText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
