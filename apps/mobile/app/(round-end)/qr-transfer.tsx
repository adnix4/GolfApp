import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Brightness from 'expo-brightness';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '@gfp/ui';
import { useSession } from '@/lib/session';
import { buildQrPayloads, type QrScore } from '@/lib/qrPayload';

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────

export default function QrTransferScreen() {
  const theme               = useTheme();
  const router              = useRouter();
  const { session, pendingScores, deviceId } = useSession();

  const [qrValues,    setQrValues]    = useState<string[]>([]);
  const [activePart,  setActivePart]  = useState(0);
  const [building,    setBuilding]    = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  const savedBrightness = useRef<number | null>(null);

  // Maximize screen brightness while QR is shown, restore on leave
  useEffect(() => {
    let restored = false;
    Brightness.getBrightnessAsync()
      .then(b => {
        savedBrightness.current = b;
        return Brightness.setBrightnessAsync(1.0);
      })
      .catch(() => { /* ignore — not critical */ });

    return () => {
      if (!restored && savedBrightness.current !== null) {
        restored = true;
        Brightness.setBrightnessAsync(savedBrightness.current).catch(() => {});
      }
    };
  }, []);

  // Build QR payload(s) on mount
  const build = useCallback(async () => {
    if (!session?.team) return;
    setBuilding(true);
    setError(null);
    try {
      const { event, team } = session;
      const scores: QrScore[] = pendingScores.map(s => ({
        h: s.holeNumber,
        g: s.grossScore,
        p: s.putts,
      }));
      // One QR, or two when the card is long (see lib/qrPayload.ts, D22).
      setQrValues(buildQrPayloads({
        eventCode: event.eventCode, teamId: team.id, teamName: team.name,
        deviceId, scores, ts: Math.floor(Date.now() / 1000),
      }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate QR code.');
    } finally {
      setBuilding(false);
    }
  }, [session, pendingScores, deviceId]);

  useEffect(() => { build(); }, [build]);

  if (!session?.team) return null;

  const isSplit  = qrValues.length === 2;
  const qrValue  = qrValues[activePart] ?? '';

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: '#111' }]}>
      {/* ── HEADER ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Scorecard QR</Text>
        <Text style={styles.headerSub} numberOfLines={1}>{session.team.name}</Text>
      </View>

      {/* ── QR AREA ── */}
      <View style={styles.qrContainer}>
        {building ? (
          <View style={styles.qrPlaceholder}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.qrPlaceholderText}>Generating…</Text>
          </View>
        ) : error ? (
          <View style={styles.qrPlaceholder}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={build} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.qrWrapper}>
            <QRCode
              value={qrValue || ' '}
              size={280}
              ecl="M"
              backgroundColor="#ffffff"
              color="#000000"
            />
          </View>
        )}
      </View>

      {/* ── SPLIT SELECTOR ── */}
      {isSplit && !building && !error && (
        <View style={styles.partRow}>
          <Pressable
            onPress={() => setActivePart(0)}
            style={[styles.partBtn, activePart === 0 && styles.partBtnActive]}
          >
            <Text style={[styles.partBtnText, activePart === 0 && styles.partBtnTextActive]}>
              Part 1 of 2
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActivePart(1)}
            style={[styles.partBtn, activePart === 1 && styles.partBtnActive]}
          >
            <Text style={[styles.partBtnText, activePart === 1 && styles.partBtnTextActive]}>
              Part 2 of 2
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── INFO ── */}
      {!building && !error && (
        <View style={styles.info}>
          <Text style={styles.infoText}>
            {isSplit
              ? `Show Part ${activePart + 1} of 2 to the organizer, then switch to Part ${activePart === 0 ? 2 : 1}.`
              : 'Show this QR to the organizer to transfer your scorecard.'}
          </Text>
          <Text style={styles.infoSub}>
            {pendingScores.length} hole{pendingScores.length !== 1 ? 's' : ''} · Keep screen bright
          </Text>
        </View>
      )}

      {/* ── BOTTOM ACTIONS ── */}
      <View style={styles.actions}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.doneBtn,
            { backgroundColor: theme.colors.action, opacity: pressed ? 0.8 : 1 },
          ]}
          accessibilityRole="button"
        >
          <Text style={[styles.doneBtnText, { color: theme.ctaLabel }]}>Admin Has Scanned ✓</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page:    { flex: 1 },

  header: {
    paddingTop:        Platform.OS === 'android' ? 12 : 0,
    paddingBottom:     12,
    paddingHorizontal: 20,
    alignItems:        'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  headerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 },

  qrContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  qrWrapper:   { backgroundColor: '#fff', padding: 20, borderRadius: 16 },
  qrPlaceholder: { alignItems: 'center', gap: 16 },
  qrPlaceholderText: { color: '#fff', fontSize: 14 },

  errorText: { color: '#e74c3c', textAlign: 'center', fontSize: 14, paddingHorizontal: 32 },
  retryBtn:  { marginTop: 12, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8, borderWidth: 1, borderColor: '#fff' },
  retryText: { color: '#fff', fontWeight: '700' },

  partRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 12, paddingHorizontal: 24 },
  partBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center' },
  partBtnActive: { backgroundColor: '#fff', borderColor: '#fff' },
  partBtnText:   { color: 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: 14 },
  partBtnTextActive: { color: '#111' },

  info:     { alignItems: 'center', paddingHorizontal: 32, marginBottom: 8 },
  infoText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  infoSub:  { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 6 },

  actions: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingTop: 12,
  },
  doneBtn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  doneBtnText: { fontSize: 16, fontWeight: '700' },
});
