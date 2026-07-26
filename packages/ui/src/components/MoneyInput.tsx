import { TextInput, type TextInputProps } from 'react-native';
import { formatMoneyInput } from '@gfp/shared-types';

export type MoneyInputProps = Omit<
  TextInputProps,
  'value' | 'onChangeText' | 'keyboardType' | 'inputMode' | 'defaultValue'
> & {
  /** Stored value: a formatted string ("$1,234.56") or '' when empty. */
  value: string;
  /** Emits the reformatted string ("$1,234.56"), or '' when cleared. */
  onChangeText: (value: string) => void;
};

/**
 * Dollar-amount input. Accepts digits only and live-formats them as US currency
 * with two decimals, cash-register style: typed digits fill in from the cents
 * up (type "5000" -> "$50.00"). Stores/emits the formatted string, so existing
 * `dollarsToCents(value)` save logic keeps working unchanged. Initialise the
 * value from cents with `centsToMoneyValue` (in @gfp/shared-types).
 */
export function MoneyInput({ value, onChangeText, ...rest }: MoneyInputProps) {
  return (
    <TextInput
      {...rest}
      value={value}
      onChangeText={text => onChangeText(formatMoneyInput(text))}
      keyboardType="number-pad"
      inputMode="numeric"
    />
  );
}
