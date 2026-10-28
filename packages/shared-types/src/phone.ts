/**
 * US 10-digit phone helpers shared across mobile + admin.
 *
 * All functions are pure: pass digits in, formatted/cleaned strings out.
 */

/**
 * Strip everything that isn't a digit and cap at 10 digits. A leading US
 * country code is dropped once the number runs past 10 digits, so a pasted
 * '+1 (555) 867-5309' keeps the right ten.
 * '(555) 867-5309 ext.4' → '5558675309'
 */
export function digitsOnly(v: string): string {
  const d = v.replace(/\D/g, '');
  return (d.length > 10 && d[0] === '1' ? d.slice(1) : d).slice(0, 10);
}

/** What a phone field says when the number isn't one. Same text as the API. */
export const PHONE_INVALID = 'Enter a 10-digit US phone number, like (555) 867-5309.';

/**
 * A complete US (NANP) number: 10 digits, and neither the area code nor the
 * exchange starts with 0 or 1. Mirrors PhoneNumber.Normalize in the API.
 */
export function isValidPhone(raw: string | null | undefined): boolean {
  const d = digitsOnly(raw ?? '');
  return d.length === 10 && d[0] >= '2' && d[3] >= '2';
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
