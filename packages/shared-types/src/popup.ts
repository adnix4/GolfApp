/**
 * Popup rules shared by admin and mobile — the pure half of the popup
 * standard (see .claude/skills/popup-format/SKILL.md). The frame itself is
 * `DialogFrame` in @gfp/ui; each app's dialog host applies these rules.
 *
 *  - splitHighlights    — items and sponsors named in a message → chips
 *  - describeFailure    — one plain-English failure message; codes in dev only
 *  - dismissKey         — per-tournament storage key for "don't show again"
 *  - resolveDontShowAgain — never offer "don't show again" on a payment check
 */

// ── Highlights ────────────────────────────────────────────────────────────────

/** An auction item, or a sponsor — sponsors get their own chip style. */
export type HighlightKind = 'item' | 'sponsor';

export interface Highlight { text: string; kind: HighlightKind }

/** A run of message text; `kind` is set for a highlighted run. */
export interface TextPart { text: string; kind: HighlightKind | null }

/**
 * Split a message around the items/sponsors it names so each can be drawn
 * bold on a chip. A quoted occurrence ("Title") loses its quotes — the chip
 * already sets it apart. Longer names win where two overlap.
 *
 * `standalone` lists highlights the message never mentions; the dialog shows
 * those on their own line above the message instead.
 */
export function splitHighlights(
  message: string,
  highlights: Highlight[] = [],
): { parts: TextPart[]; standalone: Highlight[] } {
  const hs = highlights.filter(h => h.text.trim().length > 0);
  // Every match, quoted form first so its quotes are consumed with it.
  const matches: { start: number; end: number; h: Highlight }[] = [];
  for (const h of [...hs].sort((a, b) => b.text.length - a.text.length)) {
    for (const needle of [`"${h.text}"`, h.text]) {
      let from = 0;
      for (;;) {
        const at = message.indexOf(needle, from);
        if (at < 0) break;
        const end = at + needle.length;
        if (!matches.some(m => at < m.end && end > m.start)) matches.push({ start: at, end, h });
        from = end;
      }
    }
  }
  matches.sort((a, b) => a.start - b.start);

  const parts: TextPart[] = [];
  let pos = 0;
  for (const m of matches) {
    if (m.start > pos) parts.push({ text: message.slice(pos, m.start), kind: null });
    parts.push({ text: m.h.text, kind: m.h.kind });
    pos = m.end;
  }
  if (pos < message.length) parts.push({ text: message.slice(pos), kind: null });

  const found = new Set(matches.map(m => m.h));
  return { parts, standalone: hs.filter(h => !found.has(h)) };
}

// ── Failure copy ──────────────────────────────────────────────────────────────

export interface FailureOverrides {
  /** Replace the default copy for a specific status code. */
  byStatus?: Record<number, string>;
  /** Replace the default 409 copy. */
  conflict?: string;
}

export interface FailureInfo {
  /** Plain English: what went wrong and what to do. Safe for production. */
  message: string;
  /** `CODE · HTTP 400` for developers; always null outside dev builds. */
  code: string | null;
}

const STATUS_COPY: Record<number, string> = {
  400: 'Some entries are invalid. Check the form and try again.',
  401: 'Your session has expired. Please log in again.',
  403: "You don't have permission to perform that action.",
  404: "We couldn't find what you were looking for.",
  409: 'An event with that name already exists for your organization.',
};

const NETWORK_COPY = "Couldn't reach the server. Check your internet connection and try again.";

/** fetch() rejects with a TypeError offline: "Failed to fetch" (web), "Network request failed" (RN). */
function isNetworkError(e: unknown): boolean {
  if (!(e instanceof TypeError)) return false;
  const m = String(e.message).toLowerCase();
  return m.includes('fetch') || m.includes('network request failed');
}

/**
 * The single source of failure-popup copy. Production gets plain English with
 * no status numbers or codes; dev builds also get `code` for the grey detail
 * line. Pass the app's `__DEV__`.
 *
 * Validation errors keep the server's own sentence — the API writes those for
 * people ("Walk-up registration must be enabled…") — over the generic 400.
 */
export function describeFailure(
  e: unknown,
  opts: { dev: boolean; overrides?: FailureOverrides },
): FailureInfo {
  const { dev, overrides } = opts;
  const withCode = (message: string, code: string): FailureInfo => ({ message, code: dev ? code : null });

  if (isNetworkError(e)) return withCode(NETWORK_COPY, 'NETWORK_ERROR');

  if (e && typeof e === 'object') {
    const err = e as { status?: number; code?: string; message?: string };
    const code = `${err.code ?? 'ERROR'}${err.status ? ` · HTTP ${err.status}` : ''}`;

    if (err.status) {
      const custom = overrides?.byStatus?.[err.status];
      if (custom) return withCode(custom, code);
      if (err.status === 409 && overrides?.conflict) return withCode(overrides.conflict, code);
      if (err.status === 400 && err.code === 'VALIDATION_ERROR' && err.message) return withCode(err.message, code);

      const def = STATUS_COPY[err.status];
      if (def) return withCode(def, code);
      if (err.status >= 500) return withCode('The server ran into a problem. Please try again in a moment.', code);
    }

    if (err.message) return withCode(err.message, code);
  }

  return withCode('Something went wrong. Please try again.', 'UNKNOWN_ERROR');
}

// ── "Don't show me this warning again" ────────────────────────────────────────

/**
 * Storage key for a dismissed warning. Scoped to the tournament, so the same
 * warning shows again at the next event.
 */
export function dismissKey(eventId: string, warningId: string): string {
  return `gfp:dismissed:${eventId}:${warningId}`;
}

export interface DontShowAgainOption {
  /** Stable id for the warning, e.g. 'cardless-checkin'. */
  id: string;
}

/**
 * A payment check must always ask. Returns the option to honour: in dev a
 * payment popup that asks for "don't show again" throws so the mistake is
 * caught at once; in production the option is quietly dropped.
 */
export function resolveDontShowAgain(
  opts: { dontShowAgain?: DontShowAgainOption; payment?: boolean },
  dev: boolean,
): DontShowAgainOption | undefined {
  if (!opts.dontShowAgain) return undefined;
  if (opts.payment) {
    if (dev) {
      throw new Error(
        `Popup "${opts.dontShowAgain.id}" verifies a payment and can't offer "Don't show me this warning again".`,
      );
    }
    return undefined;
  }
  return opts.dontShowAgain;
}
