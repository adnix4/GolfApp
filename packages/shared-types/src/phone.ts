/**
 * US 10-digit phone helpers shared across mobile + admin.
 *
 * All functions are pure: pass digits in, formatted/cleaned strings out.
 */

/**
 * Strip everything that isn't a digit and cap at 10 digits.
 * '(555) 867-5309 ext.4' → '5558675309'
 */
export function digitsOnly(v: string): string {
  return v.replace(/\D/g, '').slice(0, 10);
}

/**
 * Format a (partial) digit string for live text-input display.
 *   ''         → ''
 *   '555'      → '555'
 *   '5558675'  → '(555) 8675'
 *   '5558675309' → '(555) 867-5309'
 */
export function fmtPhoneInput(digits: string): string {
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Format a stored phone string for display.
 * Returns null for null/empty input so callers can use `&&` rendering.
 * Falls back to the raw value when the input isn't a clean 10-digit number.
 */
export function fmtPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}
