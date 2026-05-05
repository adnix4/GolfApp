import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView,
  TextInput, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@gfp/ui';
import { emailBuilderApi, type EmailBuilderData } from '@/lib/api';

// ── SECTION TYPES ─────────────────────────────────────────────────────────────

type SectionId = 'header' | 'details' | 'mission' | 'cta' | 'qr' | 'sponsors' | 'footer';

const DEFAULT_SECTIONS: SectionId[] = ['header', 'details', 'mission', 'cta', 'qr', 'sponsors', 'footer'];

const SECTION_LABELS: Record<SectionId, string> = {
  header:   'Header Band',
  details:  'Event Details',
  mission:  'Mission Statement',
  cta:      'CTA Button',
  qr:       'QR Code',
  sponsors: 'Sponsor Grid',
  footer:   'Footer',
};

// ── EMAIL HTML BUILDER ────────────────────────────────────────────────────────
// Table-based, inline styles only — required for Outlook/Gmail compatibility.

function buildEmailHtml(data: EmailBuilderData, sections: SectionId[], subject: string): string {
  const p = data.primaryColor;

  const bodyParts = sections.map(id => {
    switch (id) {
      case 'header':
        return `
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:${p};border-radius:8px 8px 0 0;">
    <tr><td style="padding:24px 32px;text-align:center;">
      ${data.orgLogoUrl ? `<img src="${data.orgLogoUrl}" alt="${data.orgName}" height="60" style="display:block;margin:0 auto 12px;">` : ''}
      <h1 style="color:#ffffff;font-family:Arial,sans-serif;font-size:26px;margin:0;">${data.orgName}</h1>
    </td></tr>
  </table>`;

      case 'details':
        return `
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
    <tr><td style="padding:28px 32px;font-family:Arial,sans-serif;">
      <h2 style="color:${p};font-size:20px;margin:0 0 12px;">${data.eventName}</h2>
      <p style="color:#555;font-size:15px;margin:4px 0;">&#128197; ${data.eventDate}</p>
      ${data.eventLocation ? `<p style="color:#555;font-size:15px;margin:4px 0;">&#128205; ${data.eventLocation}</p>` : ''}
    </td></tr>
  </table>`;

      case 'mission':
        return data.missionStatement ? `
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;">
    <tr><td style="padding:20px 32px;font-family:Arial,sans-serif;border-left:4px solid ${p};">
      <p style="color:#555;font-size:14px;font-style:italic;margin:0;">${data.missionStatement}</p>
    </td></tr>
  </table>` : '';

      case 'cta':
        return `
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
    <tr><td style="padding:24px 32px;text-align:center;">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${data.registrationUrl}" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="25%" strokecolor="${p}" fillcolor="${p}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Register Now</center></v:roundrect><![endif]-->
      <!--[if !mso]><!--><a href="${data.registrationUrl}" style="background:${p};color:#ffffff;display:inline-block;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;padding:12px 32px;border-radius:8px;text-decoration:none;">Register Now</a><!--<![endif]-->
    </td></tr>
  </table>`;

      case 'qr':
        return `
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
    <tr><td style="padding:16px 32px 24px;text-align:center;font-family:Arial,sans-serif;">
      <p style="color:#888;font-size:12px;margin:0 0 12px;">Scan to register</p>
      <img src="${data.qrCodeUrl}" alt="Registration QR Code" width="160" height="160" style="display:block;margin:0 auto;border:1px solid #eee;">
    </td></tr>
  </table>`;

      case 'sponsors':
        return data.sponsors.length > 0 ? `
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;">
    <tr><td style="padding:20px 32px;font-family:Arial,sans-serif;text-align:center;">
      <p style="color:#888;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Our Sponsors</p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        ${data.sponsors.slice(0, 4).map(s =>
          `<td style="text-align:center;padding:8px;">${
            s.logoUrl
              ? `<img src="${s.logoUrl}" alt="${s.name}" height="40" style="display:block;margin:0 auto;">`
              : `<span style="font-size:12px;color:#555;font-weight:bold;">${s.name}</span>`
          }</td>`
        ).join('')}
      </tr></table>
    </td></tr>
  </table>` : '';

      case 'footer':
        return `
  <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#f0f0f0;border-radius:0 0 8px 8px;">
    <tr><td style="padding:16px 32px;text-align:center;font-family:Arial,sans-serif;font-size:11px;color:#888;">
      ${data.orgName} &middot; Powered by Golf Fundraiser Pro<br>
      <a href="${data.registrationUrl}" style="color:${p};text-decoration:none;">${data.registrationUrl}</a>
    </td></tr>
  </table>`;

      default: return '';
    }
  }).join('\n');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${subject}</title></head>
<body style="margin:0;padding:20px;background:#e8e8e8;font-family:Arial,sans-serif;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
${bodyParts}
</table>
</body></html>`;
}

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
        <Text style={[styles.errorText, { color: theme.colors.accent }]}>
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
          <Text style={[styles.cardSub,   { color: theme.colors.accent  }]}>
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
              <Text style={[styles.addLabel, { color: theme.colors.accent }]}>Add section:</Text>
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

          <Text style={[styles.label, { color: theme.colors.accent }]}>Subject line *</Text>
          <TextInput
            style={[styles.input, { borderColor: '#ddd', color: theme.colors.primary }]}
            value={subject}
            onChangeText={v => { setSubject(v); if (sendError) setSendError(null); }}
            placeholder="Email subject"
          />

          <Text style={[styles.label, { color: theme.colors.accent }]}>To address *</Text>
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
          <Text style={[styles.cardSub,   { color: theme.colors.accent  }]}>
            {builderData.eventName} · {builderData.eventDate}
            {builderData.eventLocation ? `\n${builderData.eventLocation}` : ''}
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
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
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
