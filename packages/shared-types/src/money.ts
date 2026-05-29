/**
 * Money helpers — single source of truth for cents/dollars conversion.
 *
 * Cents are the canonical storage/transport unit (DB columns, API, Stripe).
 * Dollars are display-only. Never store dollars or pass them across APIs.
 */

/**
 * Format a cents value as a localized currency string.
 * Default: USD with grouping separators, e.g. 12345 → "$123.45".
 *
 * @param cents       integer cents (may be 0 or negative)
 * @param locale      defaults to 'en-US'
 * @param currency    defaults to 'USD'
 */
export function formatCents(
  cents: number,
  locale: string = 'en-US',
  currency: string = 'USD',
): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency })
    .format(cents / 100);
}

/**
 * Plain "$N.NN" formatter — no thousands separator, no locale awareness.
 * Use for compact inline displays where Intl is overkill.
 * 12345 → "$123.45"
 */
export function formatCentsShort(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Convert cents → dollars as a fixed-2 string for editable text inputs.
 * Empty/nullish input returns ''.
 * 12345 → "123.45", 0 → "0.00", undefined → ''
 */
export function centsToDollarsInput(cents: number | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

/**
 * Convert a user-typed dollar string back to integer cents.
 * Strips non-numeric characters except '.' so '$1,234.56' parses to 123456.
 * Returns 0 for empty/invalid input.
 */
export function dollarsToCents(input: string): number {
  const cleaned = input.replace(/[^0-9.]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : Math.round(n * 100);
}
