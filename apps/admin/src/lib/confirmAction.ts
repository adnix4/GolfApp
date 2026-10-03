import { notify, type NotifyOptions } from './dialog';

/**
 * Confirmation popup in the shared DialogFrame (see lib/dialog.tsx).
 *
 * @param title       title shown above the message
 * @param message     body copy
 * @param onConfirm   called when the user accepts — with the text field's
 *                    value when `options.input` adds one (else '')
 * @param confirmText optional override for the confirm button label
 * @param options     highlights (items / sponsors), kind, dontShowAgain,
 *                    payment, input; `destructive` turns the confirm button
 *                    red for removals and other irreversible actions
 */
export function confirmAction(
  title: string,
  message: string,
  onConfirm: (inputValue: string) => void,
  confirmText: string = 'Confirm',
  options?: NotifyOptions & { destructive?: boolean },
) {
  const { destructive, input, ...rest } = options ?? {};
  let inputValue = '';
  notify(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => onConfirm(inputValue) },
  ], {
    ...rest,
    ...(input && { input: { ...input, onChangeText: (v: string) => { inputValue = v; input.onChangeText?.(v); } } }),
  });
}

/** Informational / warning popup with a single OK button. */
export function alertAction(title: string, message: string, options?: NotifyOptions) {
  notify(title, message, undefined, options);
}
