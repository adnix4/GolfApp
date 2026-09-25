/**
 * DateTimeField (web) — the browser's native <input type="date|time"> picker.
 * @react-native-community/datetimepicker has no web implementation, so this
 * is the web half of the same component; native builds use DateTimeField.tsx.
 */
import type { CSSProperties } from 'react';
import type { DateTimeFieldProps } from './DateTimeField.types';

export function DateTimeField({
  mode, value, onChange, min, max, disabled, borderColor, accessibilityLabel,
}: DateTimeFieldProps) {
  const style: CSSProperties = {
    width: '100%',
    height: 40,
    boxSizing: 'border-box',
    border: `1px solid ${borderColor}`,
    borderRadius: 8,
    padding: '0 12px',
    fontSize: 14,
    // react-native-web's system font stack; a bare <input> doesn't inherit it.
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    color: value ? '#222' : '#aaa',
    backgroundColor: '#fafafa',
  };
  return (
    <input
      type={mode}
      value={value}
      min={mode === 'date' ? min : undefined}
      max={mode === 'date' ? max : undefined}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      aria-label={accessibilityLabel}
      style={style}
    />
  );
}
