import { View, Text, Pressable, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '@gfp/ui';

interface Props {
  visible:     boolean;
  title:       string;
  description: string;
  confirmLabel?: string;
  loading?:    boolean;
  onConfirm:   () => void;
  onCancel:    () => void;
}

export function TestDataWarningModal({
  visible, title, description, confirmLabel = 'Proceed', loading = false, onConfirm, onCancel,
}: Props) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.warningHeader}>
            <Text style={styles.warningIcon}>⚠</Text>
            <Text style={styles.title}>{title}</Text>
          </View>

          <Text style={[styles.description, { color: theme.colors.accent }]}>{description}</Text>

          <View style={styles.actions}>
            <Pressable
              style={[styles.cancelBtn, { borderColor: theme.colors.accent }]}
              onPress={onCancel}
              disabled={loading}
            >
              <Text style={[styles.cancelText, { color: theme.colors.accent }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmBtn, { backgroundColor: '#e67e22' }, loading && styles.disabled]}
              onPress={onConfirm}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.confirmText}>{confirmLabel}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modal:         { width: '100%', maxWidth: 440, backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  warningHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  warningIcon:   { fontSize: 24, color: '#e67e22' },
  title:         { fontSize: 18, fontWeight: '800', color: '#2c3e50', flex: 1 },
  description:   { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  actions:       { flexDirection: 'row', gap: 12 },
  cancelBtn:     { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  cancelText:    { fontSize: 15, fontWeight: '600' },
  confirmBtn:    { flex: 2, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  confirmText:   { fontSize: 15, fontWeight: '700', color: '#fff' },
  disabled:      { opacity: 0.6 },
});
