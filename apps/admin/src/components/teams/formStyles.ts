import { StyleSheet } from 'react-native';
import { fontSize, radius, spacing } from '@gfp/theme';

// Styles shared by the Teams tab's form modals (and its error banner).


export const formStyles = StyleSheet.create({
  errorBox: {
    backgroundColor: '#fdf2f2', borderRadius: radius.md, padding: spacing[3], marginBottom: spacing[3],
    borderLeftWidth: 3, borderLeftColor: '#e74c3c',
  },
  errorText: { color: '#c0392b', fontSize: fontSize.md },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: spacing[5] },
  modal: { width: '100%', maxWidth: 500, backgroundColor: '#fff', borderRadius: radius.xl, padding: spacing[8] },
  modalTitle: { fontSize: fontSize.xxl, fontWeight: '800', marginBottom: spacing[4] },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing[2], marginTop: spacing[3] },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing[3], paddingVertical: spacing[3], fontSize: fontSize.lg, backgroundColor: '#fafafa' },
  nameRow: { flexDirection: 'row', gap: spacing[2] },
  // minWidth 0: a web <input> won't shrink below its default ~20ch otherwise,
  // so two side by side overflow a narrow modal.
  halfInput: { flex: 1, minWidth: 0 },
  modalActions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[5] },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing[3], alignItems: 'center' },
  cancelText: { fontSize: fontSize.lg, fontWeight: '600' },
  submitBtn: { flex: 2, borderRadius: radius.md, paddingVertical: spacing[3], alignItems: 'center' },
  submitText: { fontSize: fontSize.lg, fontWeight: '700', color: '#fff' },
  fieldDesc:     { fontSize: fontSize.xs, marginTop: -4, marginBottom: spacing[2], lineHeight: 17 },
  fieldOptional: { fontSize: fontSize.xs, fontWeight: '400' },
});
