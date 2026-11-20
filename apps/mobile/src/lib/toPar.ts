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

/** What a screen reader says for a to-par figure: "even par", "2 under par", "1 over par". */
export function spokenToPar(rel: number): string {
  if (rel === 0) return 'even par';
  return `${Math.abs(rel)} ${rel < 0 ? 'under' : 'over'} par`;
}

/**
 * One scorecard chip as a single spoken phrase. Read piece by piece, TalkBack
 * said "SCORE", "4", "-1", "HCP", "2", "WHITE", "500y" as seven separate stops
 * (its speech log, Android 16 emulator) — "HCP" spelled out, "500y" as
 * "five hundred y", and the to-par sign easy to miss.
 */
export function chipSpeech(label: string, value: string, toPar?: number | null): string {
  if (value === '' || value === '—') return `${label}: none yet`;
  const yards = /^(\d+)y$/.exec(value);
  if (yards) return `${label} tees, ${yards[1]} yards`;
  const name = label === 'HCP' ? 'Hole handicap' : label;
  return toPar == null ? `${name} ${value}` : `${name} ${value}, ${spokenToPar(toPar)}`;
}
