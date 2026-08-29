/**
 * Score-relative-to-par formatting, shared by the hole score chip and the round
 * total chip so both read the same way.
 *
 * Pure and out of the components so the edge cases (even par is "E", not "0";
 * no score yet is a dash, not "+0") are testable — same reasoning as holeUtils.
 */

/** "E" at even par, a signed number otherwise, "—" when there's nothing to compare. */
export function formatToPar(rel: number | null): string {
  if (rel === null) return '—';
  if (rel === 0)    return 'E';
  return rel > 0 ? `+${rel}` : `${rel}`;
}

/**
 * Under par green, over par red, even/unknown muted.
 *
 * These two are fixed semantic colors the theming contract keeps hardcoded
 * rather than deriving from the brand palette — an org's primary must never
 * make "under par" read as a warning.
 */
export function toParColor(rel: number | null, mutedText: string): string {
  if (rel === null || rel === 0) return mutedText;
  return rel < 0 ? '#27ae60' : '#e74c3c';
}
