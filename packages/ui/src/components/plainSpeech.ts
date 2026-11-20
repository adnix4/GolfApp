/**
 * What a screen reader should say for a line of text that carries decorative
 * glyphs: "🎉 You won 2 items" read aloud is "party popper, You won 2 items",
 * "Set Up →" is "Set Up, right arrow", "Tap ↻ above" is "Tap clockwise open
 * circle arrow above" (all heard in TalkBack on Android 16).
 *
 * Emoji and arrows are decoration on these screens — the words beside them
 * already say what they mean — so they are dropped. Two carry meaning and are
 * said as words instead: ↻ is the Refresh button, and → between two numbers
 * ("12.4 → 11.9") reads "to".
 *
 * Pure (no react-native) so it is unit-testable; GlyphText applies it.
 */

/**
 * Explicit code-point ranges, not \p{Extended_Pictographic}: Hermes (the phone
 * JS engine) parsed that property escape but matched nothing with it, so the
 * glyphs stayed in what TalkBack read. Node matched fine — a unit test alone
 * would not have caught it. No `u` flag either, for the same reason.
 *
 * - Emoji outside the BMP: a surrogate pair from U+1F000 up (🎉 📧 🏆 🔴).
 * - Symbol blocks: arrows ← → ↻ (2190–21FF), technical ⏸ (2300–23FF),
 *   shapes ▲ (25A0–25FF), miscellaneous symbols and dingbats ⚠ ⛳ ★ ✓ ✎ ✕
 *   (2600–27BF), supplemental arrows (2900–297F, 2B00–2BFF), and the › chevron.
 * - Each may carry a variation selector (FE0F) and join others with ZWJ (200D).
 */
const ONE = String.raw`(?:[\uD83C-\uD83E][\uDC00-\uDFFF]|[←-⇿⌀-⏿■-◿☀-➿⤀-⥿⬀-⯿›])️?`;
const GLYPH_SOURCE = `${ONE}(?:\\u200D${ONE})*`;

/** One glyph at a time, captured — for splitting text into words and glyphs. */
export const GLYPH_SPLIT = new RegExp(`(${GLYPH_SOURCE})`);

const GLYPHS = new RegExp(GLYPH_SOURCE, 'g');

export function hasGlyph(text: string): boolean {
  return GLYPH_SPLIT.test(text);
}

export function plainSpeech(text: string): string {
  return text
    .replace(/(\d)\s*→\s*(-?\d)/g, '$1 to $2')
    .replace(/↻/g, 'Refresh')
    .replace(GLYPHS, '')
    .replace(/\s+([.,!?:;])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
