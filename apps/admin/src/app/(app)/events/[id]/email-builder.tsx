import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView,
  TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { emailBuilderApi, type EmailBuilderData } from '@/lib/api';
import {
  buildEmailHtml, formatFee,
  DEFAULT_SECTIONS, SECTION_LABELS, type SectionId,
} from '@/lib/emailHtml';

// ── SCREEN ────────────────────────────────────────────────────────────────────

export default function EmailBuilderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme  = useTheme();
  const eventId = id as string;

  const [builderData, setBuilderData] = useState<EmailBuilderData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [sections,    setSections]    = useState<SectionId[]>(DEFAULT_SECTIONS);
  const [subject,     setSubject]     = useState('');
  const [toAddress,   setToAddress]   = useState('');
  const [sending,     setSending]     = useState(false);
  const [sendStatus,  setSendStatus]  = useState<'idle' | 'sent' | 'error'>('idle');
  const [sendError,   setSendError]   = useState<string | null>(null);

  useEffect(() => {
    emailBuilderApi.getData(eventId)
      .then(d => {
        setBuilderData(d);
        setSubject(`You're invited: ${d.eventName}`);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [eventId]);

  const moveSection = useCallback((index: number, direction: 'up' | 'down') => {
    setSections(prev => {
      const next   = [...prev];
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const removeSection = useCallback((id: SectionId) =>
    setSections(prev => prev.filter(s => s !== id)), []);

  const addSection = useCallback((id: SectionId) =>
    setSections(prev => prev.includes(id) ? prev : [...prev, id]), []);

  const handleSend = async () => {
    if (!builderData) return;
    setSendError(null);
    if (!subject.trim()) { setSendError('Subject line is required.'); return; }
    if (!toAddress.trim()) { setSendError('To address is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toAddress.trim())) {
      setSendError('Enter a valid email address.');
      return;
    }
    setSending(true);
    setSendStatus('idle');
    try {
      const html = buildEmailHtml(builderData, sections, subject);
      await emailBuilderApi.send(eventId, { toAddress: toAddress.trim(), subject, html });
      setSendStatus('sent');
    } catch {
      setSendStatus('error');
    } finally {
      setSending(false);
    }
  };

  const handlePreviewPdf = () => {
    if (!builderData || Platform.OS !== 'web') return;
    const html = buildEmailHtml(builderData, sections, subject || `${builderData.eventName} — Email Preview`);
    const w = (window as any).open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  const handleExport = async () => {
    if (!builderData) return;
    try {
      const html = buildEmailHtml(builderData, sections, subject);
      const blob = await emailBuilderApi.export(eventId, html);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'gfp-email.html';
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent — user sees no download */ }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!builderData) {
    return (
      <View style={styles.center}>
        <Text style={[styles.errorText, { color: theme.mutedText }]}>
          Failed to load builder data.
        </Text>
      </View>
    );
  }

  const availableToAdd = DEFAULT_SECTIONS.filter(s => !sections.includes(s));

  return (
    <ScrollView style={[styles.page, { backgroundColor: theme.pageBackground }]}>
      <View style={styles.container}>

        {/* ── SECTION ORDER ── */}
        <View style={[styles.card, { backgroundColor: '#fff' }]}>
          <Text style={[styles.cardTitle, { color: theme.colors.primary }]}>Email Sections</Text>
          <Text style={[styles.cardSub,   { color: theme.mutedText  }]}>
            Use arrows to reorder sections. Remove sections you don't need.
          </Text>

          {sections.map((sId, i) => (
            <View key={sId} style={[styles.sectionRow, { borderColor: '#e0e0e0' }]}>
              <Text style={[styles.sectionLabel, { color: theme.colors.primary }]}>
                {SECTION_LABELS[sId]}
              </Text>
              <View style={styles.sectionActions}>
                <Pressable
                  onPress={() => moveSection(i, 'up')}
                  disabled={i === 0}
                  style={[styles.arrowBtn, i === 0 && styles.arrowDisabled]}
                >
                  <Text style={styles.arrowText}>↑</Text>
                </Pressable>
                <Pressable
                  onPress={() => moveSection(i, 'down')}
                  disabled={i === sections.length - 1}
                  style={[styles.arrowBtn, i === sections.length - 1 && styles.arrowDisabled]}
                >
                  <Text style={styles.arrowText}>↓</Text>
                </Pressable>
                <Pressable onPress={() => removeSection(sId)} style={styles.removeBtn}>
                  <Text style={styles.removeText}>✕</Text>
                </Pressable>
              </View>
            </View>
          ))}

          {availableToAdd.length > 0 && (
            <View style={styles.addRow}>
              <Text style={[styles.addLabel, { color: theme.mutedText }]}>Add section:</Text>
              {availableToAdd.map(sId => (
                <Pressable
                  key={sId}
                  onPress={() => addSection(sId)}
                  style={[styles.addBtn, { borderColor: theme.colors.primary }]}
                >
                  <Text style={[styles.addBtnText, { color: theme.colors.primary }]}>
                    + {SECTION_LABELS[sId]}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* ── SEND ── */}
        <View style={[styles.card, { backgroundColor: '#fff' }]}>
          <Text style={[styles.cardTitle, { color: theme.colors.primary }]}>Send Email</Text>

          <Text style={[styles.label, { color: theme.mutedText }]}>Subject line *</Text>
          <TextInput
            style={[styles.input, { borderColor: '#ddd', color: theme.colors.primary }]}
            value={subject}
            onChangeText={v => { setSubject(v); if (sendError) setSendError(null); }}
            placeholder="Email subject"
          />

          <Text style={[styles.label, { color: theme.mutedText }]}>To address *</Text>
          <TextInput
            style={[styles.input, { borderColor: '#ddd', color: theme.colors.primary }]}
            value={toAddress}
            onChangeText={v => { setToAddress(v); if (sendError) setSendError(null); }}
            placeholder="recipient@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          {sendError && (
            <View style={styles.sendErrorBox}>
              <Text style={styles.errorMsg}>{sendError}</Text>
            </View>
          )}

          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.btn, { backgroundColor: theme.colors.primary }, sending && styles.btnDisabled]}
              onPress={handleSend}
              disabled={sending}
            >
              {sending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.btnText}>Send via SendGrid</Text>}
            </Pressable>

            {Platform.OS === 'web' && (
              <Pressable
                style={[styles.btn, styles.btnOutline, { borderColor: '#27ae60' }]}
                onPress={handlePreviewPdf}
              >
                <Text style={[styles.btnText, { color: '#27ae60' }]}>Preview / Print PDF</Text>
              </Pressable>
            )}

            <Pressable
              style={[styles.btn, styles.btnOutline, { borderColor: theme.colors.primary }]}
              onPress={handleExport}
            >
              <Text style={[styles.btnText, { color: theme.colors.primary }]}>Export HTML</Text>
            </Pressable>
          </View>

          {sendStatus === 'sent' && (
            <Text style={styles.successMsg}>Email sent successfully!</Text>
          )}
          {sendStatus === 'error' && (
            <Text style={styles.errorMsg}>Send failed. Check SENDGRID_API_KEY.</Text>
          )}
        </View>

        {/* ── PREVIEW INFO ── */}
        <View style={[styles.card, { backgroundColor: '#f9fafb' }]}>
          <Text style={[styles.cardTitle, { color: theme.colors.primary }]}>Event Info</Text>
          <Text style={[styles.cardSub,   { color: theme.mutedText  }]}>
            {builderData.eventName} · {builderData.eventDate}
            {builderData.eventTime ? ` · ${builderData.eventTime}` : ''}
            {builderData.courseName ? `\n⛳ ${builderData.courseName}` : ''}
            {builderData.courseAddress
              ? `\n${builderData.courseAddress}`
              : builderData.eventLocation ? `\n${builderData.eventLocation}` : ''}
            {formatFee(builderData.entryFeeCents) ? `\n💵 ${formatFee(builderData.entryFeeCents)} per golfer` : ''}
            {`\n${builderData.sponsors.length} sponsor(s)`}
            {`\n${builderData.registrationUrl}`}
          </Text>
        </View>

      </View>
    </ScrollView>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page:       { flex: 1 },
  container:  { padding: 16, gap: 16, maxWidth: 800, alignSelf: 'center', width: '100%' },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText:  { fontSize: 14 },

  card:       {
    borderRadius: 12, padding: 20, gap: 12,
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.06)', elevation: 2,
  },
  cardTitle:  { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  cardSub:    { fontSize: 13, lineHeight: 20 },

  sectionRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionLabel:   { fontSize: 14, fontWeight: '600', flex: 1 },
  sectionActions: { flexDirection: 'row', gap: 4 },
  arrowBtn:       { padding: 6, borderRadius: 6, backgroundColor: '#f0f0f0' },
  arrowDisabled:  { opacity: 0.3 },
  arrowText:      { fontSize: 14, fontWeight: '700' },
  removeBtn:      { padding: 6, borderRadius: 6, backgroundColor: '#fdf2f2' },
  removeText:     { fontSize: 13, color: '#e74c3c', fontWeight: '700' },

  addRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  addLabel:  { fontSize: 12, fontWeight: '600', alignSelf: 'center' },
  addBtn:    { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  addBtnText:{ fontSize: 12, fontWeight: '600' },

  label: { fontSize: 12, fontWeight: '600', marginBottom: -4 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14 },

  buttonRow:   { flexDirection: 'row', gap: 12, marginTop: 4 },
  btn:         { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, padding: 12, minHeight: 44 },
  btnOutline:  { backgroundColor: 'transparent', borderWidth: 1.5 },
  btnDisabled: { opacity: 0.5 },
  btnText:     { color: '#fff', fontSize: 14, fontWeight: '700' },

  sendErrorBox: { backgroundColor: '#fdf2f2', borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: '#e74c3c' },
  successMsg: { color: '#27ae60', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  errorMsg:   { color: '#c0392b', fontSize: 13, fontWeight: '600' },
});
