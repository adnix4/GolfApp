import { useState, useEffect } from 'react';
import {
  View, Text, Pressable, FlatList, Modal, TextInput,
  StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useEventDetail } from '@/lib/eventContext';
import { useTheme, MoneyInput, useClasses } from '@gfp/ui';
import { dollarsToCents, formatCentsShort, centsToMoneyValue } from '@gfp/shared-types';
import { challengesApi, type HoleChallenge } from '@/lib/api';
import { useChallengeList } from '@/lib/queries';
import { fontSize, radius, spacing, status } from '@gfp/theme';

const COMMON_CHALLENGES = [
  'Closest to Pin',
  'Longest Drive',
  'Longest Putt',
  'KP (Hole in One)',
  'Closest to Line',
  'Beat the Pro',
];

export default function ChallengesScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();
  const c        = useClasses();

  const challengeList = useChallengeList(id);
  const { items: challenges, setItems: setChallenges, loading } = challengeList;
  const holeCount = useEventDetail().event.holes;
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError
    ?? (challengeList.error ? (challengeList.error.message || 'Failed to load challenges.') : null);
  const [editing,    setEditing]    = useState<HoleChallenge | null>(null);  // null = add new
  const [showForm,   setShowForm]   = useState(false);

  async function handleDelete(holeNumber: number) {
    try {
      await challengesApi.remove(id, holeNumber);
      setChallenges(prev => prev.filter(c => c.holeNumber !== holeNumber));
    } catch (e: any) {
      setError(e.message ?? 'Failed to delete.');
    }
  }

  function openAdd() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(challenge: HoleChallenge) {
    setEditing(challenge);
    setShowForm(true);
  }

  function handleSaved(updated: HoleChallenge) {
    setChallenges(prev => {
      const idx = prev.findIndex(c => c.holeNumber === updated.holeNumber);
      return idx >= 0
        ? prev.map((c, i) => i === idx ? updated : c)
        : [...prev, updated].sort((a, b) => a.holeNumber - b.holeNumber);
    });
    setShowForm(false);
  }

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={c.title}>
          Hole Challenges ({challenges.length})
        </Text>
        <Pressable
          style={[styles.addBtn, { backgroundColor: theme.colors.primary }]}
          onPress={openAdd}
          accessibilityRole="button"
        >
          <Text style={[styles.addBtnText, { color: '#fff' }]}>+ Add Challenge</Text>
        </Pressable>
      </View>

      {error && (
        <View style={[c.errorBox, styles.errorBox]}>
          <Text style={c.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : challenges.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.mutedText }]}>
            No hole challenges configured.
          </Text>
          <Text style={[styles.emptyHint, { color: theme.mutedText }]}>
            Add closest-to-pin, longest drive, and other contests.
          </Text>
        </View>
      ) : (
        <FlatList
          data={challenges}
          keyExtractor={c => String(c.holeNumber)}
          contentContainerStyle={styles.list}
          renderItem={({ item: ch }) => (
            <View style={[styles.card, { borderColor: '#e8e8e8' }]}>
              <View style={[styles.holeTag, { backgroundColor: theme.colors.primary }]}>
                <Text style={styles.holeTagText}>Hole {ch.holeNumber}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.challengeName, { color: theme.colors.primary }]}>
                  {ch.description}
                </Text>
                {ch.sponsorName && (
                  <Text style={[styles.sponsorLine, { color: theme.mutedText }]}>
                    Sponsored by {ch.sponsorName}
                  </Text>
                )}
                {ch.sponsorLogoUrl && (
                  <Image
                    source={{ uri: ch.sponsorLogoUrl }}
                    style={styles.sponsorLogo}
                    resizeMode="contain"
                    accessibilityLabel={ch.sponsorName ? `${ch.sponsorName} logo` : 'Sponsor logo'}
                  />
                )}
                {ch.donationAmountCents != null && ch.donationAmountCents > 0 && (
                  <Text style={[styles.donationLine, { color: '#16a085' }]}>
                    {formatCentsShort(ch.donationAmountCents)} donation
                  </Text>
                )}
                {ch.winnerName && (
                  <Text style={[styles.winnerLine, { color: status.success }]}>
                    🏆 Winner: {ch.winnerName}
                  </Text>
                )}
              </View>
              <View style={styles.cardActions}>
                <Pressable onPress={() => openEdit(ch)} style={styles.editBtn}>
                  <Text style={[styles.editText, { color: theme.colors.action }]}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(ch.holeNumber)} style={styles.deleteBtn}>
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <ChallengeFormModal
        visible={showForm}
        eventId={id}
        holeCount={holeCount}
        initial={editing}
        existingHoles={challenges.map(c => c.holeNumber)}
        onClose={() => setShowForm(false)}
        onSaved={handleSaved}
      />
    </View>
  );
}

// ── Challenge Form Modal ──────────────────────────────────────────────────────

interface FormProps {
  visible:       boolean;
  eventId:       string;
  holeCount:     number;
  initial:       HoleChallenge | null;
  existingHoles: number[];
  onClose:       () => void;
  onSaved:       (c: HoleChallenge) => void;
}

function ChallengeFormModal({ visible, eventId, holeCount, initial, existingHoles, onClose, onSaved }: FormProps) {
  const theme = useTheme();
  const c     = useClasses();

  const [holeNumber,    setHoleNumber]    = useState('');
  const [description,   setDescription]   = useState('');
  const [sponsorName,   setSponsorName]   = useState('');
  const [sponsorLogoUrl, setSponsorLogoUrl] = useState('');
  const [donationAmt,   setDonationAmt]   = useState('');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setHoleNumber(initial ? String(initial.holeNumber) : '');
      setDescription(initial?.description ?? '');
      setSponsorName(initial?.sponsorName ?? '');
      setSponsorLogoUrl(initial?.sponsorLogoUrl ?? '');
      setDonationAmt(centsToMoneyValue(initial?.donationAmountCents));
      setError(null);
    }
  }, [visible, initial]);

  async function handleSave() {
    const num = parseInt(holeNumber, 10);
    if (!holeNumber || isNaN(num) || num < 1 || num > holeCount) {
      setError(`Hole number must be between 1 and ${holeCount}.`);
      return;
    }
    if (!description.trim()) { setError('Description is required.'); return; }
    if (!initial && existingHoles.includes(num)) {
      setError(`Hole ${num} already has a challenge. Edit it instead.`);
      return;
    }
    setError(null); setLoading(true);
    try {
      const donationCents = donationAmt.trim()
        ? dollarsToCents(donationAmt)
        : undefined;
      const result = await challengesApi.upsert(eventId, num, {
        description: description.trim(),
        sponsorName: sponsorName.trim() || undefined,
        sponsorLogoUrl: sponsorLogoUrl.trim() || undefined,
        ...(donationCents !== undefined ? { donationAmountCents: donationCents } : {}),
      });
      onSaved(result);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={c.overlay}>
        <View style={styles.modal}>
          <Text style={[c.modalTitle, styles.modalTitle]}>
            {initial ? `Edit — Hole ${initial.holeNumber}` : 'Add Challenge'}
          </Text>

          {error && <View style={[c.errorBox, styles.errorBox]}><Text style={c.errorText}>{error}</Text></View>}

          {/* Hole selector */}
          {!initial && (
            <>
              <Text style={c.fieldLabel}>Hole Number *</Text>
              <TextInput
                style={c.input}
                value={holeNumber}
                onChangeText={setHoleNumber}
                placeholder={`1–${holeCount}`}
                placeholderTextColor="#999"
                keyboardType="numeric"
                editable={!loading}
              />
            </>
          )}

          {/* Quick-pick challenge types */}
          <Text style={c.fieldLabel}>Challenge Type *</Text>
          <View style={styles.quickPicks}>
            {COMMON_CHALLENGES.map(c => (
              <Pressable
                key={c}
                onPress={() => setDescription(c)}
                style={[
                  styles.quickChip,
                  description === c && { backgroundColor: theme.colors.primary },
                ]}
              >
                <Text style={[
                  styles.quickChipText,
                  { color: description === c ? '#fff' : theme.colors.primary },
                ]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={[c.input, { marginTop: spacing[2] }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Custom description…"
            placeholderTextColor="#999"
            editable={!loading}
          />

          <Text style={c.fieldLabel}>Sponsor (optional)</Text>
          <TextInput
            style={c.input}
            value={sponsorName}
            onChangeText={setSponsorName}
            placeholder="ACME Corp"
            placeholderTextColor="#999"
            editable={!loading}
          />

          <Text style={c.fieldLabel}>Sponsor Logo URL (optional)</Text>
          <TextInput
            style={c.input}
            value={sponsorLogoUrl}
            onChangeText={setSponsorLogoUrl}
            placeholder="https://example.com/logo.png"
            placeholderTextColor="#999"
            autoCapitalize="none"
            keyboardType="url"
            editable={!loading}
          />
          {sponsorLogoUrl.trim().length > 0 && (
            <Image
              source={{ uri: sponsorLogoUrl.trim() }}
              style={styles.logoPreview}
              resizeMode="contain"
              accessibilityLabel="Sponsor logo preview"
            />
          )}

          <Text style={c.fieldLabel}>Donation Amount (optional)</Text>
          <MoneyInput
            style={c.input}
            value={donationAmt}
            onChangeText={setDonationAmt}
            placeholder="$0.00"
            placeholderTextColor="#999"
            editable={!loading}
          />

          <View style={[c.formActions, styles.modalActions]}>
            <Pressable style={c.cancelBtn} onPress={onClose}>
              <Text style={c.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[c.submitBtn, loading && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={c.submitText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page:   { flex: 1, backgroundColor: '#f7f8fa' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing[6], paddingBottom: spacing[4] },
  addBtn: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.md },
  addBtnText: { fontSize: fontSize.md, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing[8] },
  emptyText: { fontSize: fontSize.xl, fontWeight: '600', marginBottom: spacing[2], textAlign: 'center' },
  emptyHint: { fontSize: fontSize.sm, textAlign: 'center', opacity: 0.8 },

  errorBox: { margin: spacing[4], marginBottom: spacing[4] },   // over c.errorBox

  list: { padding: spacing[4], gap: spacing[3] },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], backgroundColor: '#fff', borderWidth: 1, borderRadius: radius.lg, padding: spacing[4] },
  holeTag: { paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.md, alignItems: 'center', minWidth: 58 },
  holeTagText: { fontSize: fontSize.xs, fontWeight: '800', color: '#fff', textAlign: 'center' },
  challengeName: { fontSize: fontSize.lg, fontWeight: '700' },
  sponsorLine: { fontSize: fontSize.sm, marginTop: spacing[0.5] },
  sponsorLogo: { width: 80, height: 32, marginTop: spacing[2] },
  logoPreview: { width: 120, height: 48, marginTop: spacing[2], borderRadius: radius.xs, backgroundColor: '#f0f0f0' },
  donationLine: { fontSize: fontSize.sm, marginTop: spacing[0.5] },
  winnerLine: { fontSize: fontSize.sm, fontWeight: '600', marginTop: spacing[1] },
  cardActions: { gap: spacing[2] },
  editBtn: { paddingVertical: spacing[1], paddingHorizontal: spacing[3], borderRadius: radius.sm, borderWidth: 1, borderColor: '#3498db' },
  editText: { fontSize: fontSize.xs, fontWeight: '700' },
  deleteBtn: { paddingVertical: spacing[1], paddingHorizontal: spacing[3], borderRadius: radius.sm, borderWidth: 1, borderColor: status.danger },
  deleteText: { fontSize: fontSize.xs, fontWeight: '700', color: status.danger },

  modal: { width: '90%', maxWidth: 460, backgroundColor: '#fff', borderRadius: radius.xl, padding: spacing[6], gap: spacing[1] },
  modalTitle: { marginBottom: spacing[2] },     // over c.modalTitle
  quickPicks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  quickChip: { borderWidth: 1, borderColor: '#ccc', borderRadius: radius.xl, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  quickChipText: { fontSize: fontSize.sm, fontWeight: '600' },
  modalActions: { marginTop: spacing[4] },      // over c.formActions
});
