import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@gfp/ui';
import { fontSize, radius, spacing } from '@gfp/theme';

/**
 * Determinate upload progress bar with a Cancel action, driven by the
 * fractional progress from uploadWithProgress (see lib/upload.ts).
 */
export function UploadProgress({
  progress,
  onCancel,
  label = 'Uploading',
}: {
  progress: number;          // 0..1
  onCancel: () => void;
  label?: string;
}) {
  const theme = useTheme();
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: theme.mutedText }]}>
          {label}… {pct}%
        </Text>
        <Pressable
          onPress={onCancel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Cancel upload"
        >
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
      <View style={styles.track}>
        <View
          style={[styles.fill, { width: `${pct}%`, backgroundColor: theme.colors.primary }]}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: pct }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:      { marginVertical: spacing[2], gap: spacing[2] },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label:     { fontSize: fontSize.sm, fontWeight: '600' },
  cancel:    { fontSize: fontSize.sm, fontWeight: '700', color: '#c0392b' },
  track:     { height: 8, borderRadius: radius.full, backgroundColor: 'rgba(0,0,0,0.08)', overflow: 'hidden' },
  fill:      { height: '100%', borderRadius: radius.full },
});
