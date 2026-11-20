import { Text, View, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { useTheme, LiveRegion } from '@gfp/ui';
import { MIN_MESSAGE_MS, useTimedMessage, type TimedMessage } from '@gfp/shared-types';
import { fontSize, spacing } from '@gfp/theme';
import { autoDismissMs, useScreenReaderEnabled } from '@/lib/a11y';

/**
 * The scorecard tables abbreviate their column headers (#, Yds, Scr, +/−);
 * tapping one shows its full name under the header row. The tip stays 6 s
 * (MCAG 1.3.2) and is read out; while VoiceOver/TalkBack runs it stays until
 * the next tap, since the header cells already announce the full name.
 */
export function useColumnTip(): TimedMessage<string> {
  const screenReaderOn = useScreenReaderEnabled();
  return useTimedMessage<string>(autoDismissMs(screenReaderOn, MIN_MESSAGE_MS));
}

/** One abbreviated header cell. Screen readers hear the full name. */
export function ColumnHeader({ abbr, name, style, onTip }: {
  abbr:  string;
  name:  string;
  style: StyleProp<TextStyle>;
  onTip: (name: string) => void;
}) {
  return (
    <Text
      style={style}
      numberOfLines={1}
      onPress={() => onTip(name)}
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityHint="Shows the full column name"
    >
      {abbr}
    </Text>
  );
}

/** The tip line under the header row — a live region, mounted even when empty. */
export function ColumnTip({ tip }: { tip: string | null }) {
  const theme = useTheme();
  return (
    <LiveRegion message={tip}>
      {tip !== null && (
        <View style={[s.tip, { backgroundColor: theme.colors.primary }]}>
          <Text style={[s.tipText, { color: theme.buttonLabel }]}>{tip}</Text>
        </View>
      )}
    </LiveRegion>
  );
}

const s = StyleSheet.create({
  tip:     { alignItems: 'center', paddingVertical: spacing[1], marginBottom: spacing[0.5] },
  tipText: { fontSize: fontSize.xs, fontWeight: '600', letterSpacing: 0.3 },
});
