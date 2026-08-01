import { Alert, Platform } from 'react-native';

// ── Web shim ──────────────────────────────────────────────────────────────────
// react-native-web ships Alert as a literal no-op (`class Alert { static
// alert() {} }`), so every message this app raised through it was invisible in a
// browser. That is how a rejected auction bid looked like a dead button: the
// request failed, the error dialog never appeared, and the modal just sat there.
//
// window.confirm/alert are ugly, but they are the only thing on web that is
// guaranteed to reach the golfer regardless of which screen raised it. Screens
// with somewhere better to put the message (see the bid modal's inline error)
// should still do that — this is the floor, not the ceiling.

export interface NotifyButton {
  text:     string;
  onPress?: () => void;
  style?:   'default' | 'cancel' | 'destructive';
}

/**
 * Cross-platform replacement for Alert.alert — use this instead, always.
 *
 * Native gets the real dialog. Web gets window.alert, or window.confirm when
 * there is a cancel button to honour (OK runs the non-cancel button's onPress,
 * Cancel runs the cancel one's).
 */
export function notify(title: string, message?: string, buttons?: NotifyButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const body   = message ? `${title}\n\n${message}` : title;
  const cancel = buttons?.find(b => b.style === 'cancel');
  const accept = buttons?.find(b => b.style !== 'cancel');

  if (cancel && accept) {
    if (window.confirm(body)) accept.onPress?.();
    else cancel.onPress?.();
    return;
  }

  window.alert(body);
  // A single-button dialog's onPress is the caller's "after they acknowledge"
  // hook (payment-setup navigates back from it) — window.alert already blocked
  // until they dismissed it, so running it now matches the native ordering.
  accept?.onPress?.();
}
