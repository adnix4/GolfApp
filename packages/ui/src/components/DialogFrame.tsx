/**
 * DialogFrame — the one popup frame for admin and mobile (the popup standard;
 * see .claude/skills/popup-format/SKILL.md). Each app's dialog host renders
 * it; screens never draw their own dialog chrome.
 *
 *   ┌──────────────────────────────┐
 *   │ Event name          (primary) │  header band, buttonLabel text
 *   ├──────────────────────────────┤
 *   │ ⚠ Title             (primary) │  kind icon: warning / error
 *   │ [★ Sponsor]  [Item]           │  chips not mentioned in the message
 *   │ Message with [Item] inline…   │
 *   │ CODE · HTTP 400        (dev)  │  grey, only when detailCode is set
 *   │ ☐ Don't show me this warning… │  only when offered
 *   │              [Cancel] [OK]    │
 *   └──────────────────────────────┘
 *
 * Colors follow the theming contract: labels on fills use the derived
 * on-colors (buttonLabel on primary, ctaLabel on action), never literals.
 * Items sit on an action chip; sponsors on a highlight chip with a star, so
 * the two read differently at a glance.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { splitHighlights, type Highlight } from '@gfp/shared-types';
import { useTheme } from './ThemeProvider';

export type DialogKind = 'confirm' | 'warning' | 'error' | 'info';

export interface DialogButton {
  text:     string;
  onPress?: () => void;
  /** 'secondary' is outlined like cancel but isn't one (e.g. "Visit website"). */
  style?:   'default' | 'secondary' | 'cancel' | 'destructive';
}

export interface DialogFrameProps {
  /** Event (or org) name for the header band. */
  headerTitle: string;
  kind?:        DialogKind;
  title:        string;
  message?:     string;
  highlights?:  Highlight[];
  /** Developer detail (error code); render only in dev builds. */
  detailCode?:  string | null;
  buttons:      DialogButton[];
  /** Offer "Don't show me this warning again". */
  offerDontShowAgain?: boolean;
  /** A button was pressed; `dontShowAgain` is the checkbox state. */
  onButton:     (button: DialogButton, dontShowAgain: boolean) => void;
  /** Closed without a button (back, Escape, backdrop). */
  onDismiss:    () => void;
  /** Extra content under the message: a sponsor logo, a prize box, stat rows. */
  children?:    ReactNode;
  /** An action is running: buttons disabled, spinner on the confirm button. */
  busy?:        boolean;
}

const DESTRUCTIVE = '#c0392b';
const KIND_ICON: Partial<Record<DialogKind, { glyph: string; color: string }>> = {
  warning: { glyph: '⚠', color: '#b9770e' },
  error:   { glyph: '✕', color: DESTRUCTIVE },
};

export function DialogFrame({
  headerTitle, kind = 'info', title, message, highlights, detailCode,
  buttons, offerDontShowAgain, onButton, onDismiss, children, busy,
}: DialogFrameProps) {
  const theme = useTheme();
  const [dontShow, setDontShow] = useState(false);
  // A new dialog starts unticked.
  useEffect(() => { setDontShow(false); }, [title, message]);

  const { parts, standalone } = splitHighlights(message ?? '', highlights);
  const chip = (k: Highlight['kind']) => k === 'sponsor'
    ? { backgroundColor: theme.colors.highlight, color: theme.colors.primary }
    : { backgroundColor: theme.colors.action,    color: theme.ctaLabel };
  const chipText = (h: { text: string; kind: Highlight['kind'] }) => h.kind === 'sponsor' ? `★ ${h.text}` : h.text;
  const icon = KIND_ICON[kind];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={busy ? () => {} : onDismiss}>
      <View style={styles.overlay}>
        {/* Backdrop is a sibling behind the card, not its parent: RN-web
            renders Pressable as <button>, and buttons can't nest. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} disabled={busy} accessibilityLabel="Close dialog" />
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]} accessibilityViewIsModal>
          <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.headerTitle, { color: theme.buttonLabel }]} numberOfLines={1}>
              {headerTitle}
            </Text>
          </View>

          <View style={styles.body}>
            <View style={styles.titleRow}>
              {icon && <Text style={[styles.icon, { color: icon.color }]}>{icon.glyph}</Text>}
              <Text style={[styles.title, { color: theme.colors.primary }]} accessibilityRole="header">
                {title}
              </Text>
            </View>

            {standalone.length > 0 && (
              <View style={styles.chipRow}>
                {standalone.map((h, i) => (
                  <Text key={i} style={[styles.chip, chip(h.kind)]}>{chipText(h)}</Text>
                ))}
              </View>
            )}

            {parts.length > 0 && (
              <Text style={styles.message}>
                {parts.map((p, i) => p.kind
                  ? <Text key={i} style={[styles.inlineChip, chip(p.kind)]}>{` ${chipText({ text: p.text, kind: p.kind })} `}</Text>
                  : <Text key={i}>{p.text}</Text>)}
              </Text>
            )}

            {children}

            {!!detailCode && <Text style={styles.code} accessibilityLabel={`Error code ${detailCode}`}>{detailCode}</Text>}

            {offerDontShowAgain && (
              <Pressable
                style={styles.checkRow}
                onPress={() => setDontShow(v => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: dontShow }}
              >
                <View style={[
                  styles.box, { borderColor: theme.colors.primary },
                  dontShow && { backgroundColor: theme.colors.primary },
                ]}>
                  {dontShow && <Text style={[styles.tick, { color: theme.buttonLabel }]}>✓</Text>}
                </View>
                <Text style={styles.checkLabel}>Don't show me this warning again</Text>
              </Pressable>
            )}

            <View style={styles.actions}>
              {buttons.map((b, i) => {
                const isCancel = b.style === 'cancel' || b.style === 'secondary';
                const isDanger = b.style === 'destructive';
                return (
                  <Pressable
                    key={i}
                    onPress={() => onButton(b, dontShow)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !!busy, busy: !!busy && !isCancel }}
                    style={[
                      busy && { opacity: 0.6 },
                      styles.btn,
                      isCancel
                        ? { borderWidth: 1.5, borderColor: theme.colors.primary }
                        : { backgroundColor: isDanger ? DESTRUCTIVE : theme.colors.primary },
                    ]}
                  >
                    {busy && !isCancel
                      ? <ActivityIndicator size="small" color={isDanger ? '#fff' : theme.buttonLabel} />
                      : (
                        <Text style={[
                          styles.btnText,
                          { color: isCancel ? theme.colors.primary : isDanger ? '#fff' : theme.buttonLabel },
                        ]}>
                          {b.text}
                        </Text>
                      )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  card:        { borderRadius: 16, overflow: 'hidden', maxWidth: 460, width: '100%', alignSelf: 'center' },
  header:      { paddingVertical: 12, paddingHorizontal: 18 },
  headerTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  body:        { padding: 20 },
  titleRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  icon:        { fontSize: 18, fontWeight: '800' },
  title:       { flex: 1, fontSize: 19, fontWeight: '800' },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip:        { fontSize: 15, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, overflow: 'hidden' },
  message:     { fontSize: 15, lineHeight: 22, color: '#333' },
  inlineChip:  { fontWeight: '800', borderRadius: 4 },
  code:        { marginTop: 10, fontSize: 12, color: '#6b7280', fontFamily: 'monospace' },
  checkRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  box:         { width: 20, height: 20, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tick:        { fontSize: 13, fontWeight: '900', lineHeight: 16 },
  checkLabel:  { fontSize: 14, color: '#333' },
  actions:     { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' },
  btn:         { paddingVertical: 11, paddingHorizontal: 18, borderRadius: 10, minWidth: 96, alignItems: 'center' },
  btnText:     { fontSize: 15, fontWeight: '700' },
});
