/**
 * DateTimeField (iOS / Android) — Expo's standard picker,
 * @react-native-community/datetimepicker. Android opens the system dialog;
 * iOS shows a spinner under the field with a Done button.
 * The web build resolves DateTimeField.web.tsx instead (the picker has no web
 * implementation).
 */
import { useState } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  formatPickerDate, formatPickerTime,
  pickerValuesToDate, toPickerDate, toPickerTime,
} from '@/lib/dateTime';
import type { DateTimeFieldProps } from './DateTimeField.types';

export function DateTimeField({
  mode, value, onChange, min, max, placeholder, disabled, borderColor, accessibilityLabel,
}: DateTimeFieldProps) {
  const [open, setOpen] = useState(false);

  const pickerValue =
    (mode === 'date'
      ? pickerValuesToDate(value, '')
      : pickerValuesToDate(toPickerDate(new Date()), value || '09:00'))
    ?? new Date();
  const display = mode === 'date' ? formatPickerDate(value) : formatPickerTime(value);

  function handleChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type !== 'set' || !selected) return;
    onChange(mode === 'date' ? toPickerDate(selected) : toPickerTime(selected));
  }

  return (
    <View>
      <Pressable
        style={[styles.field, { borderColor }]}
        onPress={() => setOpen(o => !o)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Text style={[styles.text, !display && styles.placeholder]}>
          {display || placeholder}
        </Text>
      </Pressable>
      {open && (
        <>
          <DateTimePicker
            mode={mode}
            value={pickerValue}
            minimumDate={mode === 'date' && min ? pickerValuesToDate(min, '') : undefined}
            maximumDate={mode === 'date' && max ? pickerValuesToDate(max, '') : undefined}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleChange}
          />
          {Platform.OS === 'ios' && (
            <Pressable
              style={styles.done}
              onPress={() => {
                // The spinner only fires onChange on movement; accept the
                // initial value if the user taps Done without scrolling.
                if (!value) onChange(mode === 'date' ? toPickerDate(pickerValue) : toPickerTime(pickerValue));
                setOpen(false);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#fafafa',
  },
  text:        { fontSize: 14, color: '#222' },
  placeholder: { color: '#aaa' },
  done:        { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 12 },
  doneText:    { fontSize: 15, fontWeight: '700', color: '#007aff' },
});
