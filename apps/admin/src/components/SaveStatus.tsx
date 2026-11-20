import { View, Text, StyleSheet } from 'react-native';
import { useClasses, LiveRegion } from '@gfp/ui';
import { spacing, radius, fontSize, status } from '@gfp/theme';

/**
 * The result of a save, shown right under its Save button — where the
 * organizer is looking, not at the top of a long page — and read out by
 * screen readers as it appears (MCAG 1.3.2). The success note clears itself
 * after 6 s (useTimedMessage); an error stays until the next save or edit.
 */
export function SaveStatus({ saved, error }: { saved: string | null; error: string | null }) {
  const c = useClasses();
  return (
    <LiveRegion message={error ?? saved}>
      {error
        ? <View style={[c.errorBox, s.box]}><Text style={c.errorText}>{error}</Text></View>
        : saved
          ? <View style={[s.successBox, s.box]}><Text style={s.successText}>✓ {saved}</Text></View>
          : null}
    </LiveRegion>
  );
}

const s = StyleSheet.create({
  box:         { marginTop: spacing[3], marginBottom: 0 },
  successBox:  {
    backgroundColor: '#f0fdf4', borderRadius: radius.md, padding: spacing[3],
    borderLeftWidth: 3, borderLeftColor: status.success,
  },
  successText: { color: status.successText, fontSize: fontSize.md, fontWeight: '600' },
});
