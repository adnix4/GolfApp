import { StyleSheet } from 'react-native';
import { neutral, fontSize, radius, spacing } from '@gfp/theme';

// Layout private to the Teams tab's form modals.  The shared form classes
// (input, fieldLabel, buttons, error box…) come from useClasses() in @gfp/ui.


export const formStyles = StyleSheet.create({
  modalScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: spacing[5] },
  modal: { width: '100%', maxWidth: 500, backgroundColor: neutral.panel, borderRadius: radius.xl, padding: spacing[8] },
  nameRow: { flexDirection: 'row', gap: spacing[2] },
  // minWidth 0: a web <input> won't shrink below its default ~20ch otherwise,
  // so two side by side overflow a narrow modal.
  halfInput: { flex: 1, minWidth: 0 },
  fieldOptional: { fontSize: fontSize.xs, fontWeight: '400' },
});
