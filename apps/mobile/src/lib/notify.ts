import { Alert, Platform } from 'react-native';
import {
  describeFailure,
  type DontShowAgainOption, type FailureOverrides, type Highlight,
} from '@gfp/shared-types';
import type { DialogButton, DialogKind } from '@gfp/ui';

// Every popup goes through notify() and renders as the shared DialogFrame (the
// popup standard — .claude/skills/popup-format/SKILL.md): event name in the
// header, items and sponsors on chips, "don't show again" for recurring
// setting-driven warnings, plain-English failures with codes in dev only.

/** A dialog button; 'secondary' is outlined like cancel but isn't one. */
export type NotifyButton = DialogButton;

export interface NotifyOptions {
  /** Title icon/accent: 'warning' ⚠, 'error' ✕. Defaults to 'info'. */
  kind?:        DialogKind;
  /** Auction item or sponsor names to set on chips. */
  highlights?:  Highlight[];
  /** Shorthand for one item highlight (an auction item's title). */
  highlight?:   string;
  /**
   * Offer "Don't show me this warning again" — ONLY for warnings a tournament
   * setting raises that can recur. Remembered per event; a dismissed warning
   * runs its confirm action without showing.
   */
  dontShowAgain?: DontShowAgainOption;
  /** This popup verifies a payment amount: never offers "don't show again". */
  payment?:     boolean;
  /** Developer detail (error code) — set by notifyFailure in dev builds. */
  detailCode?:  string | null;
}

export interface DialogRequest extends Omit<NotifyOptions, 'highlight'> {
  title:    string;
  message?: string;
  buttons?: NotifyButton[];
}

// ── Themed dialog host ────────────────────────────────────────────────────────
// <DialogHost/> (src/components/DialogHost.tsx), mounted inside the event
// ThemeProvider, registers here. The platform fallback below only runs with no
// host mounted (tests, or before the root layout mounts) — and it can't style
// anything, which is why the host exists.
//
// Fallback notes, kept from before the host: react-native-web ships Alert as a
// literal no-op, so web falls back to window.alert/confirm (OK runs the
// non-cancel button's onPress, Cancel runs the cancel one's).
let host: ((request: DialogRequest) => void) | null = null;

export function registerDialogHost(fn: ((request: DialogRequest) => void) | null): void {
  host = fn;
}

/**
 * Cross-platform popup — use this instead of Alert.alert / window.confirm,
 * always. Buttons behave like Alert's: a 'cancel' button runs on dismissal.
 */
export function notify(
  title:    string,
  message?: string,
  buttons?: NotifyButton[],
  options?: NotifyOptions,
): void {
  if (host) {
    const { highlight, highlights, ...rest } = options ?? {};
    host({
      title, message, buttons, ...rest,
      highlights: [...(highlights ?? []), ...(highlight ? [{ text: highlight, kind: 'item' as const }] : [])],
    });
    return;
  }

  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons?.map(b => ({ ...b, style: b.style === 'secondary' ? 'default' : b.style })));
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

/**
 * A failure popup: plain English from describeFailure (no codes or status
 * numbers in production), plus the error code on a grey line in dev builds.
 */
export function notifyFailure(
  title:    string,
  error:    unknown,
  options?: NotifyOptions & { overrides?: FailureOverrides },
): void {
  const { overrides, ...rest } = options ?? {};
  const info = describeFailure(error, { dev: __DEV__, overrides });
  notify(title, info.message, undefined, { ...rest, kind: 'error', detailCode: info.code });
}
