export interface TextPart { text: string; highlight: boolean }

/**
 * Split a dialog message around the highlighted subject (an auction item's
 * title) so it can be drawn bold on a contrasting chip. A quoted occurrence
 * ("Title") loses its quotes — the chip already sets it apart.
 *
 * `inline` is false when the message never mentions the subject; the dialog
 * then shows the subject on its own line above the message instead.
 */
export function splitHighlight(message: string, highlight?: string): { parts: TextPart[]; inline: boolean } {
  if (!highlight || !message.includes(highlight)) {
    return { parts: message ? [{ text: message, highlight: false }] : [], inline: false };
  }
  const quoted = `"${highlight}"`;
  const needle = message.includes(quoted) ? quoted : highlight;
  const parts: TextPart[] = [];
  message.split(needle).forEach((chunk, i) => {
    if (i > 0) parts.push({ text: highlight, highlight: true });
    if (chunk) parts.push({ text: chunk, highlight: false });
  });
  return { parts, inline: true };
}
