export interface DateTimeFieldProps {
  mode: 'date' | 'time';
  /** `YYYY-MM-DD` for date mode, 24-hour `HH:mm` for time mode; '' when unset. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest / latest selectable date (`YYYY-MM-DD`), date mode only. */
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  borderColor: string;
  accessibilityLabel: string;
}
