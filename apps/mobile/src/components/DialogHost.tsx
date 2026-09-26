/**
 * DialogHost — renders every notify() call as the shared DialogFrame.
 *
 * Mounted once in the root layout, inside the event ThemeProvider, so popups
 * wear the event's colors with its name in the header.
 *
 *  - Queue, not a single slot: a confirm's handler often raises the next
 *    dialog (the bid result) while the first is still closing.
 *  - Dismissing without a button (Android back, Escape, backdrop) runs the
 *    cancel handler, or the lone acknowledge button — callers rely on it to
 *    clear in-flight guards (the auction bid ref).
 *  - "Don't show me this warning again" is remembered per event; a dismissed
 *    warning runs its confirm action without showing. Payment checks never
 *    offer it (resolveDontShowAgain throws in dev if one asks).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { DialogFrame, type DialogButton } from '@gfp/ui';
import { dismissKey, resolveDontShowAgain } from '@gfp/shared-types';
import { useSession } from '@/lib/session';
import { registerDialogHost, type DialogRequest, type NotifyButton } from '@/lib/notify';
import { getFlag, setFlag } from '@/lib/store';

/** The button a suppressed warning stands in for: its confirm action. */
function acceptButton(buttons: NotifyButton[] = []): NotifyButton | undefined {
  return buttons.find(b => b.style !== 'cancel');
}

export function DialogHost() {
  const { session } = useSession();
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const current = queue[0] ?? null;

  // The host callback outlives renders; read the event id through a ref.
  const eventId = useRef<string | undefined>(undefined);
  eventId.current = session?.event.id;

  useEffect(() => {
    registerDialogHost(request => {
      const opt = resolveDontShowAgain(request, __DEV__);
      const id  = eventId.current;
      if (!opt || !id) { setQueue(q => [...q, request]); return; }
      getFlag(dismissKey(id, opt.id))
        .catch(() => false)
        .then(dismissed => {
          if (dismissed) acceptButton(request.buttons)?.onPress?.();
          else setQueue(q => [...q, request]);
        });
    });
    return () => registerDialogHost(null);
  }, []);

  const close = useCallback((button: NotifyButton | undefined, dontShowAgain: boolean) => {
    const req = queue[0];
    setQueue(q => q.slice(1));
    // Only remember a dismissal the golfer confirmed — ticking the box and
    // then backing out means "not this time", not "never again".
    const opt = req && resolveDontShowAgain(req, __DEV__);
    if (dontShowAgain && opt && eventId.current && button && button.style !== 'cancel') {
      void setFlag(dismissKey(eventId.current, opt.id)).catch(() => {});
    }
    button?.onPress?.();
  }, [queue]);

  if (!current) return null;

  const buttons: NotifyButton[] = current.buttons?.length ? current.buttons : [{ text: 'OK' }];
  const cancel = buttons.find(b => b.style === 'cancel');

  return (
    <DialogFrame
      headerTitle={session?.event.name ?? 'Golf Fundraiser Pro'}
      kind={current.kind}
      title={current.title}
      message={current.message}
      highlights={current.highlights}
      detailCode={current.detailCode}
      buttons={buttons as DialogButton[]}
      offerDontShowAgain={!!resolveDontShowAgain(current, __DEV__)}
      onButton={(b, dontShow) => close(b, dontShow)}
      onDismiss={() => close(cancel ?? (buttons.length === 1 ? buttons[0] : undefined), false)}
    />
  );
}
