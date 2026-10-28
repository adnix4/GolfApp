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
import { useClasses } from '../styles/useClasses';
import { neutral, radius, spacing, status } from '@gfp/theme';

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
  /** Disables submit without a spinner (e.g. nothing selected yet). */
  submitDisabled?: boolean;
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
  submitDisabled = false,
  destructive = false,
  hideSubmit = false,
  maxWidth = 480,
  children,
}: FormModalProps) {
  const theme = useTheme();
  const c = useClasses();
  const submitBg = destructive ? status.danger : theme.buttonBackground;
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
      <View style={c.overlay}>
        <ScrollView
          contentContainerStyle={styles.overlayScroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.modal, { maxWidth }]}>
            <Text style={c.modalTitle}>{title}</Text>

            {children}

            <View style={c.formActions}>
              <Pressable
                style={c.cancelBtn}
                onPress={onClose}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={cancelLabel}
              >
                <Text style={c.cancelText}>
                  {cancelLabel}
                </Text>
              </Pressable>

              {hideSubmit ? null : (
                <Pressable
                  style={[
                    c.submitBtn,
                    { backgroundColor: submitBg },
                    (loading || submitDisabled) && styles.disabled,
                  ]}
                  onPress={onSubmit}
                  disabled={loading || submitDisabled}
                  accessibilityRole="button"
                  accessibilityLabel={submitLabel}
                  accessibilityState={{ disabled: loading || submitDisabled, busy: loading }}
                >
                  {loading
                    ? <ActivityIndicator color={submitFg} />
                    : <Text style={[c.submitText, { color: submitFg }]}>{submitLabel}</Text>}
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
  overlayScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[4],
  },
  modal: {
    width: '100%',
    backgroundColor: neutral.panel,
    borderRadius: radius.xl,
    padding: spacing[8],
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.15)',
    elevation: 12,
  },
  disabled: {
    opacity: 0.6,
  },
});
