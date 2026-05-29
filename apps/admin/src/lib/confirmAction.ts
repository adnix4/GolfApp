import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirmation dialog.
 *
 * On web (React Native Web), Alert.alert is non-blocking and ignores
 * the destructive-button style, so we fall back to `window.confirm`.
 * On native, uses the platform Alert with proper Cancel/Confirm buttons.
 *
 * @param title       title shown above the message
 * @param message     body copy
 * @param onConfirm   called when the user accepts
 * @param confirmText optional override for the confirm button label
 */
export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmText: string = 'Confirm',
) {
  if (Platform.OS === 'web') {
    if ((globalThis as any).window?.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmText, style: 'destructive', onPress: onConfirm },
  ]);
}
