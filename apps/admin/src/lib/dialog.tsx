/**
 * Admin popups — the popup standard (.claude/skills/popup-format/SKILL.md).
 *
 * notify() / alertFailure() render the shared DialogFrame through a
 * <DialogHost/>. Two hosts are mounted and the innermost wins:
 *   - app/_layout.tsx        — org theme, org name in the header
 *   - events/[id]/_layout.tsx — event theme, event name, and an eventId so
 *                               "Don't show me this warning again" can be
 *                               remembered for that tournament
 * confirmAction / alertAction (lib/confirmAction.ts) call through here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { DialogFrame, type DialogButton, type DialogKind } from '@gfp/ui';
import {
  describeFailure, dismissKey, resolveDontShowAgain,
  type DontShowAgainOption, type FailureOverrides, type Highlight,
} from '@gfp/shared-types';

export type { DialogButton };

export interface NotifyOptions {
  /** Title icon/accent: 'warning' ⚠, 'error' ✕. Defaults to 'info'. */
  kind?:          DialogKind;
  /** Auction items / sponsors named in the message — set on chips. */
  highlights?:    Highlight[];
  /**
   * Offer "Don't show me this warning again" — ONLY for warnings a tournament
   * setting raises that can recur. Needs an event host (per-event memory).
   */
  dontShowAgain?: DontShowAgainOption;
  /** Verifies a payment amount: never offers "don't show again". */
  payment?:       boolean;
  /** Developer detail — set by alertFailure in dev builds. */
  detailCode?:    string | null;
}

interface DialogRequest extends NotifyOptions {
  title:    string;
  message?: string;
  buttons?: DialogButton[];
}

// Innermost-wins stack of mounted hosts.
const hosts: ((r: DialogRequest) => void)[] = [];

/** Show a popup. Buttons behave like Alert's: a 'cancel' button runs on dismissal. */
export function notify(title: string, message?: string, buttons?: DialogButton[], options?: NotifyOptions): void {
  const host = hosts[hosts.length - 1];
  if (host) { host({ title, message, buttons, ...options }); return; }

  // No host yet (very early, or tests): the unstyled platform dialog.
  const cancel = buttons?.find(b => b.style === 'cancel');
  const accept = buttons?.find(b => b.style !== 'cancel');
  const body   = message ? `${title}\n\n${message}` : title;
  if (Platform.OS === 'web') {
    if (cancel && accept) { if ((globalThis as any).window?.confirm(body)) accept.onPress?.(); else cancel.onPress?.(); return; }
    (globalThis as any).window?.alert(body);
    accept?.onPress?.();
    return;
  }
  Alert.alert(title, message, buttons?.map(b => ({ ...b, style: b.style === 'secondary' ? 'default' : b.style })));
}

/** A failure popup: plain English; the error code on a grey line in dev builds only. */
export function alertFailure(title: string, error: unknown, overrides?: FailureOverrides): void {
  const info = describeFailure(error, { dev: __DEV__, overrides });
  notify(title, info.message, undefined, { kind: 'error', detailCode: info.code });
}

// ── Dismissals (localStorage; admin is a web app) ─────────────────────────────

function isDismissed(key: string): boolean {
  try { return globalThis.localStorage?.getItem(key) === '1'; } catch { return false; }
}
function rememberDismissed(key: string): void {
  try { globalThis.localStorage?.setItem(key, '1'); } catch { /* private mode — just ask again */ }
}

/** "Show dismissed warnings again" for one event. Returns how many were cleared. */
export function clearDismissedWarnings(eventId: string): number {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return 0;
    const prefix = dismissKey(eventId, '');
    const keys = Array.from({ length: ls.length }, (_, i) => ls.key(i)).filter((k): k is string => !!k?.startsWith(prefix));
    keys.forEach(k => ls.removeItem(k));
    return keys.length;
  } catch { return 0; }
}

// ── Host ──────────────────────────────────────────────────────────────────────

export function DialogHost({ headerTitle, eventId }: { headerTitle: string; eventId?: string }) {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const current = queue[0] ?? null;
  const eventIdRef = useRef(eventId);
  eventIdRef.current = eventId;

  useEffect(() => {
    const host = (request: DialogRequest) => {
      const opt = resolveDontShowAgain(request, __DEV__);
      const id  = eventIdRef.current;
      if (opt && id && isDismissed(dismissKey(id, opt.id))) {
        // Dismissed before: run the confirm action without asking.
        request.buttons?.find(b => b.style !== 'cancel')?.onPress?.();
        return;
      }
      setQueue(q => [...q, request]);
    };
    hosts.push(host);
    return () => { hosts.splice(hosts.indexOf(host), 1); };
  }, []);

  const close = useCallback((button: DialogButton | undefined, dontShowAgain: boolean) => {
    const req = queue[0];
    setQueue(q => q.slice(1));
    // Only remember a dismissal the organizer confirmed.
    const opt = req && resolveDontShowAgain(req, __DEV__);
    if (dontShowAgain && opt && eventIdRef.current && button && button.style !== 'cancel') {
      rememberDismissed(dismissKey(eventIdRef.current, opt.id));
    }
    button?.onPress?.();
  }, [queue]);

  if (!current) return null;

  const buttons = current.buttons?.length ? current.buttons : [{ text: 'OK' }];
  const cancel  = buttons.find(b => b.style === 'cancel');

  return (
    <DialogFrame
      headerTitle={headerTitle}
      kind={current.kind}
      title={current.title}
      message={current.message}
      highlights={current.highlights}
      detailCode={current.detailCode}
      buttons={buttons}
      offerDontShowAgain={!!eventId && !!resolveDontShowAgain(current, __DEV__)}
      onButton={(b, dontShow) => close(b, dontShow)}
      onDismiss={() => close(cancel ?? (buttons.length === 1 ? buttons[0] : undefined), false)}
    />
  );
}
