/**
 * DateTimePairField — the standard "date + time" row used wherever admin
 * collects a moment in time (event start, auction close): two DateTimeFields
 * side by side, per-field errors, and an optional "Clear" link.
 * Values are picker strings (`YYYY-MM-DD`, `HH:mm`); convert with
 * pickerValuesToIso / isoToPickerValues from lib/dateTime.
 */
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@gfp/ui';
import { DateTimeField } from './DateTimeField';
import type { PickerErrors } from '@/lib/dateTime';
import { fontSize, spacing } from '@gfp/theme';

const ERROR_RED = '#e74c3c';

export interface DateTimePairFieldProps {
  date: string;
  time: string;
  onChange: (next: { date: string; time: string }) => void;
  errors?: PickerErrors;
  /** Earliest selectable date (`YYYY-MM-DD`). */
  min?: string;
  disabled?: boolean;
  /** Show a link that empties both fields once either is set. */
  clearable?: boolean;
  /** Prefix for the accessibility labels: "Start" → "Start date", "Start time". */
  label: string;
}

export function DateTimePairField({
  date, time, onChange, errors = {}, min, disabled, clearable, label,
}: DateTimePairFieldProps) {
  const theme = useTheme();
  return (
    <View>
      <View style={styles.row}>
        <View style={styles.dateCol}>
          <Text style={styles.subLabel}>Date</Text>
          <DateTimeField
            mode="date"
            value={date}
            onChange={v => onChange({ date: v, time })}
            min={min}
            placeholder="Pick a date"
            disabled={disabled}
            borderColor={errors.date ? ERROR_RED : theme.colors.accent}
            accessibilityLabel={`${label} date`}
          />
          {!!errors.date && <Text style={styles.error}>{errors.date}</Text>}
        </View>
        <View style={styles.timeCol}>
          <Text style={styles.subLabel}>Time</Text>
          <DateTimeField
            mode="time"
            value={time}
            onChange={v => onChange({ date, time: v })}
            placeholder="Pick a time"
            disabled={disabled}
            borderColor={errors.time ? ERROR_RED : theme.colors.accent}
            accessibilityLabel={`${label} time`}
          />
          {!!errors.time && <Text style={styles.error}>{errors.time}</Text>}
        </View>
      </View>
      {clearable && !!(date || time) && !disabled && (
        <Pressable
          onPress={() => onChange({ date: '', time: '' })}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${label.toLowerCase()} date and time`}
        >
          <Text style={[styles.clear, { color: theme.colors.primary }]}>Clear date & time</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row:     { flexDirection: 'row', gap: spacing[3], marginBottom: spacing[1] },
  dateCol: { flex: 3 },
  timeCol: { flex: 2 },
  subLabel: {
    fontSize: fontSize.xxs,
    fontWeight: '600',
    color: '#888',
    marginBottom: spacing[1],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  error: { fontSize: fontSize.xs, color: ERROR_RED, marginTop: spacing[1], marginLeft: spacing[0.5] },
  clear: { fontSize: fontSize.xs, fontWeight: '600', marginTop: spacing[2], textDecorationLine: 'underline' },
});
