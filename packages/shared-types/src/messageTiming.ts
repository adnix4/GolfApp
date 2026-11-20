'use client';

/**
 * Short-lived status messages ("Saved", "Copied", a column tip) — MCAG 1.3.2.
 *
 * A message that clears itself must stay up long enough to read: 5 s plus
 * 1 s per 120 words. Everything the apps flash is a few words, so 6 s covers
 * it. It must also be announced as it appears (an aria-live region, or
 * LiveRegion from @gfp/ui) — the timing alone doesn't reach a screen reader.
 */

import { useCallback, useEffect, useState } from 'react';

/** The shortest time a self-clearing message stays on screen. */
export const MIN_MESSAGE_MS = 6_000;

export interface MessageTimer<T> {
  /** Show a message for `holdMs` (at least MIN_MESSAGE_MS), or until cleared when null. Restarts the clock. */
  show(value: T, holdMs: number | null): void;
  /** Take the message down now. */
  clear(): void;
  /** Cancel the clock without changing the message (unmount). */
  dispose(): void;
}

/** The clock behind useTimedMessage, kept free of React so it can be tested alone. */
export function createMessageTimer<T>(onChange: (message: T | null) => void): MessageTimer<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return {
    show(value, holdMs) {
      stop();
      onChange(value);
      if (holdMs === null) return;
      timer = setTimeout(() => { timer = null; onChange(null); }, Math.max(holdMs, MIN_MESSAGE_MS));
    },
    clear() { stop(); onChange(null); },
    dispose: stop,
  };
}

export interface TimedMessage<T> {
  /** The message showing now, or null. */
  message: T | null;
  /** Show a message; showing another restarts the clock. */
  show: (value: T) => void;
  /** Take the message down now. */
  clear: () => void;
}

/**
 * A message that clears itself after `holdMs`, never sooner than
 * MIN_MESSAGE_MS. Pass null to keep it until it's replaced or cleared — the
 * mobile app does that while VoiceOver/TalkBack runs (autoDismissMs). The
 * clock stops on unmount.
 */
export function useTimedMessage<T>(holdMs: number | null = MIN_MESSAGE_MS): TimedMessage<T> {
  const [message, setMessage] = useState<T | null>(null);
  const [timer] = useState(() => createMessageTimer<T>(setMessage));

  useEffect(() => () => timer.dispose(), [timer]);

  const show = useCallback((value: T) => timer.show(value, holdMs), [timer, holdMs]);
  const clear = useCallback(() => timer.clear(), [timer]);

  return { message, show, clear };
}
