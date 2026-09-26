/**
 * DialogHost — the in-app dialog every notify() call renders through.
 *
 * Mounted once in the root layout, inside the event ThemeProvider, so dialogs
 * carry the event's colors: a primary header naming the event, a light surface
 * body, and the subject (an auction item) bold on an action-colored chip.
 * Label colors come from the theme's derived on-colors (buttonLabel on
 * primary, ctaLabel on action), so any org palette stays readable.
 *
 * Dismissing without a button (Android back, Escape on web, tapping outside)
 * runs the cancel button's handler — callers rely on it to clear in-flight
 * guards (the auction bid ref), so a dismissed dialog never strands one.
 */
import { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@gfp/ui';
import { useSession } from '@/lib/session';
import { registerDialogHost, type DialogRequest, type NotifyButton } from '@/lib/notify';
import { splitHighlight } from '@/lib/dialogText';

const DESTRUCTIVE = '#c0392b';

export function DialogHost() {
  const theme = useTheme();
  const { session } = useSession();
  // A queue, not a single slot: a confirm's handler often raises the next
  // dialog (the bid result) while the first is still closing.
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    registerDialogHost(request => setQueue(q => [...q, request]));
    return () => registerDialogHost(null);
  }, []);

  const close = useCallback((button?: NotifyButton) => {
    setQueue(q => q.slice(1));
    button?.onPress?.();
  }, []);

  if (!current) return null;

  const buttons = current.buttons?.length ? current.buttons : [{ text: 'OK' }];
  const cancel  = buttons.find(b => b.style === 'cancel');
  // No button chosen: cancel if there is one, else the only (acknowledge) button.
  const dismiss = () => close(cancel ?? (buttons.length === 1 ? buttons[0] : undefined));

  const { parts, inline } = splitHighlight(current.message ?? '', current.highlight);
  const chip = { backgroundColor: theme.colors.action, color: theme.ctaLabel };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.overlay} onPress={dismiss} accessibilityLabel="Close dialog">
        {/* Inner Pressable swallows taps so only the backdrop dismisses. */}
        <Pressable style={[styles.card, { backgroundColor: theme.colors.surface }]} onPress={() => {}}>
          <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.eventName, { color: theme.buttonLabel }]} numberOfLines={1}>
              {session?.event.name ?? 'Golf Fundraiser Pro'}
            </Text>
          </View>

          <View style={styles.body}>
            <Text style={[styles.title, { color: theme.colors.primary }]} accessibilityRole="header">
              {current.title}
            </Text>

            {current.highlight && !inline && (
              <Text style={[styles.subject, chip]}>{current.highlight}</Text>
            )}

            {parts.length > 0 && (
              <Text style={styles.message}>
                {parts.map((p, i) => p.highlight
                  ? <Text key={i} style={[styles.inlineChip, chip]}>{` ${p.text} `}</Text>
                  : <Text key={i}>{p.text}</Text>)}
              </Text>
            )}

            <View style={styles.actions}>
              {buttons.map((b, i) => {
                const isCancel = b.style === 'cancel';
                const isDanger = b.style === 'destructive';
                return (
                  <Pressable
                    key={i}
                    onPress={() => close(b)}
                    accessibilityRole="button"
                    style={[
                      styles.btn,
                      isCancel
                        ? { borderWidth: 1.5, borderColor: theme.colors.primary }
                        : { backgroundColor: isDanger ? DESTRUCTIVE : theme.colors.primary },
                    ]}
                  >
                    <Text style={[
                      styles.btnText,
                      { color: isCancel ? theme.colors.primary : isDanger ? '#fff' : theme.buttonLabel },
                    ]}>
                      {b.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  card:      { borderRadius: 16, overflow: 'hidden', maxWidth: 440, width: '100%', alignSelf: 'center' },
  header:    { paddingVertical: 12, paddingHorizontal: 18 },
  eventName: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  body:      { padding: 20 },
  title:     { fontSize: 19, fontWeight: '800', marginBottom: 10 },
  subject:   {
    alignSelf: 'flex-start', fontSize: 15, fontWeight: '800',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginBottom: 10, overflow: 'hidden',
  },
  message:    { fontSize: 15, lineHeight: 22, color: '#333' },
  inlineChip: { fontWeight: '800', borderRadius: 4 },
  actions:    { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20, flexWrap: 'wrap' },
  btn:        { paddingVertical: 11, paddingHorizontal: 18, borderRadius: 10, minWidth: 96, alignItems: 'center' },
  btnText:    { fontSize: 15, fontWeight: '700' },
});
