/**
 * FormModal — bottom-anchored form modal with title, content, and action row.
 *
 * Wraps the overlay + ScrollView + card + footer pattern that's hand-rolled
 * in ~16 admin screens. Each one currently maintains its own 80+ LOC of
 * matching style. Use this when the form has a clear submit/cancel pair.
 *
 *   <FormModal
 *     visible={showEdit}
 *     title="Edit Team"
 *     onClose={() => setShowEdit(false)}
 *     onSubmit={handleSave}
 *     submitLabel="Save"
 *     loading={saving}
 *   >
 *     {/* form fields *\/}
 *   </FormModal>
 */

import React, { type ReactNode } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { useTheme } from './ThemeProvider';
import { fontSize, radius, spacing } from '@gfp/theme';

export interface FormModalProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Called when the user taps the submit button. */
  onSubmit: () => void;
  /** Label on the submit button. */
  submitLabel: string;
  /** Override the cancel label (default 'Cancel'). */
  cancelLabel?: string;
  /** Disables submit + shows a spinner inside it. */
  loading?: boolean;
  /** Renders the submit button in a destructive red color. */
  destructive?: boolean;
  /** Hide the submit button (useful for read-only/info modals). */
  hideSubmit?: boolean;
  /** Max card width. Default 480. */
  maxWidth?: number;
  children: ReactNode;
}

export function FormModal({
  visible,
  title,
  onClose,
  onSubmit,
  submitLabel,
  cancelLabel = 'Cancel',
  loading = false,
  destructive = false,
  hideSubmit = false,
  maxWidth = 480,
  children,
}: FormModalProps) {
  const theme = useTheme();
  const submitBg = destructive ? '#e74c3c' : theme.colors.primary;
  // Label derived per-fill: a custom brand may pick a light primary where
  // hardcoded white would vanish. Danger red always takes white.
  const submitFg = destructive ? '#fff' : theme.buttonLabel;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <ScrollView
          contentContainerStyle={styles.overlayScroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.modal, { maxWidth }]}>
            <Text style={[styles.title, { color: theme.colors.primary }]}>{title}</Text>

            {children}

            <View style={styles.actions}>
              <Pressable
                style={[styles.cancelBtn, { borderColor: theme.colors.accent }]}
                onPress={onClose}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={cancelLabel}
              >
                <Text style={[styles.cancelText, { color: theme.colors.primary }]}>
                  {cancelLabel}
                </Text>
              </Pressable>

              {hideSubmit ? null : (
                <Pressable
                  style={[
                    styles.submitBtn,
                    { backgroundColor: submitBg },
                    loading && styles.disabled,
                  ]}
                  onPress={onSubmit}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel={submitLabel}
                >
                  {loading
                    ? <ActivityIndicator color={submitFg} />
                    : <Text style={[styles.submitText, { color: submitFg }]}>{submitLabel}</Text>}
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  modal: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    padding: spacing[8],
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.15)',
    elevation: 12,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    marginBottom: spacing[4],
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[6],
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 2,
    borderRadius: radius.lg,
    paddingVertical: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.6,
  },
});
