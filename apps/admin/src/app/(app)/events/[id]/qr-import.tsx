import { useState, useRef } from 'react';
import {
  View, Text, Pressable, TextInput,
  StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { scoresApi, type QrCollectResult } from '@/lib/api';
import { decodeQrPayload, type DecodedQrPayload as DecodedPreview } from '@/lib/qrUtils';

export default function QrImportScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const theme    = useTheme();

  const [payload,  setPayload]  = useState('');
  const [preview,  setPreview]  = useState<DecodedPreview | null>(null);
  const [decodeErr, setDecodeErr] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<QrCollectResult | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  function handlePayloadChange(text: string) {
    setPayload(text);
    setResult(null);
    setError(null);
    if (!text.trim()) { setPreview(null); setDecodeErr(false); return; }
    const decoded = decodeQrPayload(text.trim());
    setPreview(decoded);
    setDecodeErr(!decoded);
  }

  function handleReset() {
    setPayload(''); setPreview(null); setDecodeErr(false);
    setResult(null); setError(null);
    inputRef.current?.focus();
  }

  async function handleImport() {
    if (!payload.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await scoresApi.qrCollect(id, payload.trim());
      setResult(res);
      setPayload(''); setPreview(null); setDecodeErr(false);
    } catch (e: any) {
      setError(e.message ?? 'Import failed.');
    } finally {
      setLoading(false);
    }
  }

  const canImport = !!payload.trim() && !decodeErr && !loading;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { color: theme.colors.primary }]}>QR Score Import</Text>
      <Text style={[styles.subtitle, { color: theme.colors.accent }]}>
        Use a USB barcode scanner or paste the QR payload from a player's mobile scorecard.
        The scanner acts as a keyboard — focus the field and scan.
      </Text>

      {/* Input field */}
      <View style={[styles.inputCard, { borderColor: decodeErr ? '#e74c3c' : preview ? '#27ae60' : '#e0e0e0' }]}>
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.colors.primary }]}
          value={payload}
          onChangeText={handlePayloadChange}
          placeholder="Scan QR code or paste payload here…"
          placeholderTextColor="#aaa"
          multiline
          numberOfLines={4}
          autoFocus
          editable={!loading}
          accessibilityLabel="QR payload input"
        />
        {payload.length > 0 && (
          <Pressable onPress={handleReset} style={styles.clearBtn} accessibilityLabel="Clear">
            <Text style={styles.clearText}>✕ Clear</Text>
          </Pressable>
        )}
      </View>

      {/* Decode preview */}
      {preview && !decodeErr && (
        <View style={[styles.previewCard, { backgroundColor: '#f0faf4', borderColor: '#b7e4c7' }]}>
          <Text style={[styles.previewTitle, { color: '#1a6b3c' }]}>✓ Payload decoded</Text>
          <PreviewRow label="Team"       value={preview.teamName} />
          <PreviewRow label="Event Code" value={preview.eventCode} />
          <PreviewRow label="Holes"      value={`${preview.holeCount} score${preview.holeCount !== 1 ? 's' : ''}`} />
          {preview.part != null && (
            <PreviewRow label="Part"     value={`${preview.part} of ${preview.total}`} />
          )}
          <PreviewRow
            label="Captured"
            value={preview.ts ? new Date(preview.ts * 1000).toLocaleTimeString() : 'Unknown'}
          />
        </View>
      )}

      {decodeErr && (
        <View style={styles.decodeError}>
          <Text style={styles.decodeErrorText}>⚠ Could not decode payload — check the QR code and try again.</Text>
        </View>
      )}

      {/* Import button */}
      <Pressable
        onPress={handleImport}
        disabled={!canImport}
        style={[
          styles.importBtn,
          { backgroundColor: theme.colors.primary },
          !canImport && { opacity: 0.4 },
        ]}
        accessibilityRole="button"
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.importBtnText}>Import Scores</Text>}
      </Pressable>

      {/* Result */}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {result && (
        <View style={[styles.resultCard, { borderColor: result.conflicts > 0 ? '#f39c12' : '#27ae60' }]}>
          <Text style={[styles.resultTitle, { color: result.conflicts > 0 ? '#d68910' : '#1a6b3c' }]}>
            {result.conflicts > 0 ? '⚠ Import completed with conflicts' : '✓ Import successful'}
          </Text>
          <PreviewRow label="Team"            value={result.teamName} />
          <PreviewRow label="Scores Imported" value={String(result.scoresImported)} />
          {result.conflicts > 0 && (
            <>
              <PreviewRow label="Conflicts" value={String(result.conflicts)} />
              {result.conflictDetails.map((c, i) => (
                <Text key={i} style={[styles.conflictLine, { color: '#c0392b' }]}>
                  Hole {c.holeNumber}: existing {c.existingScore} vs QR {c.qrScore}
                </Text>
              ))}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.previewRow}>
      <Text style={styles.previewLabel}>{label}</Text>
      <Text style={styles.previewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page:    { flex: 1, backgroundColor: '#f7f8fa' },
  content: { padding: 28, gap: 16, maxWidth: 680, width: '100%', alignSelf: 'center' },

  title:    { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 4 },

  inputCard: { backgroundColor: '#fff', borderWidth: 2, borderRadius: 12, padding: 4, minHeight: 100 },
  input:     { fontSize: 14, padding: 12, minHeight: 88, textAlignVertical: 'top', fontFamily: 'monospace' },
  clearBtn:  { alignSelf: 'flex-end', paddingHorizontal: 12, paddingBottom: 8 },
  clearText: { fontSize: 12, color: '#999', fontWeight: '600' },

  previewCard:  { borderWidth: 1.5, borderRadius: 10, padding: 14, gap: 6 },
  previewTitle: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  previewRow:   { flexDirection: 'row', gap: 8 },
  previewLabel: { fontSize: 13, fontWeight: '600', color: '#555', width: 100 },
  previewValue: { fontSize: 13, color: '#222', flex: 1 },

  decodeError:     { backgroundColor: '#fff8e1', borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: '#f39c12' },
  decodeErrorText: { color: '#7d6608', fontSize: 13, fontWeight: '600' },

  importBtn:     { borderRadius: 10, paddingVertical: 15, alignItems: 'center' },
  importBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },

  errorBox:  { backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
  errorText: { color: '#c0392b', fontSize: 14 },

  resultCard:    { borderWidth: 1.5, borderRadius: 10, padding: 14, gap: 6, backgroundColor: '#fff' },
  resultTitle:   { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  conflictLine:  { fontSize: 12, paddingLeft: 8 },
});
