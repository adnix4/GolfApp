import { StyleSheet } from 'react-native';

// Styles shared by the Teams tab's form modals (and its error banner).


export const formStyles = StyleSheet.create({
  errorBox: {
    backgroundColor: '#fdf2f2', borderRadius: 8, padding: 12, marginBottom: 12,
    borderLeftWidth: 3, borderLeftColor: '#e74c3c',
  },
  errorText: { color: '#c0392b', fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: { width: '100%', maxWidth: 500, backgroundColor: '#fff', borderRadius: 16, padding: 28 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#fafafa' },
  nameRow: { flexDirection: 'row', gap: 8 },
  // minWidth 0: a web <input> won't shrink below its default ~20ch otherwise,
  // so two side by side overflow a narrow modal.
  halfInput: { flex: 1, minWidth: 0 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  submitBtn: { flex: 2, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  submitText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  fieldDesc:     { fontSize: 12, marginTop: -4, marginBottom: 6, lineHeight: 17 },
  fieldOptional: { fontSize: 12, fontWeight: '400' },
});
