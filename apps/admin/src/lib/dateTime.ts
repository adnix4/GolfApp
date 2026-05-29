/**
 * Date/time field helpers for the admin UI.
 *
 * The admin event/auction forms type dates as US `MM/DD/YYYY` and times as
 * 12-hour `HH:MM` + AM/PM toggle. These helpers handle live-input formatting,
 * validation, and the round-trip to ISO-8601 UTC strings the API expects.
 *
 * All functions are pure and parametric on the field name — pass the displayed
 * label (e.g. "Start" or "Closes") if you want it included in error copy.
 */

export type AmPm = 'AM' | 'PM';

/** MM/DD/YYYY auto-format while a user types digits. */
export function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** HH:MM auto-format while a user types digits. */
export function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/**
 * Validate a `MM/DD/YYYY` string and return a human-readable error or undefined.
 * Empty input is treated as "not entered" (no error) so callers can mark the
 * field optional by skipping a required-check.
 */
export function validateDateField(date: string): string | undefined {
  if (!date) return undefined;
  if (date.length < 10) return 'Enter a complete date (MM/DD/YYYY)';
  const [mStr, dStr, yStr] = date.split('/');
  const m = Number(mStr), d = Number(dStr), y = Number(yStr);
  if (!m || !d || !y) return 'Enter date as MM/DD/YYYY';
  if (m < 1 || m > 12) return 'Month must be between 01 and 12';
  if (d < 1 || d > 31) return 'Day must be between 01 and 31';
  if (y < 2025) return 'Year must be 2025 or later';
  return undefined;
}

/** Validate a 12-hour `HH:MM` string and return error or undefined. */
export function validateTimeField(time: string): string | undefined {
  if (!time) return undefined;
  if (time.length < 5) return 'Enter a complete time (HH:MM)';
  const [hStr, mStr] = time.split(':');
  const h = Number(hStr), m = Number(mStr);
  if (isNaN(h) || isNaN(m)) return 'Enter time as HH:MM';
  if (h < 1 || h > 12) return 'Hour must be between 1 and 12';
  if (m < 0 || m > 59) return 'Minutes must be between 00 and 59';
  return undefined;
}

/**
 * Combine the date/time/ampm fields into an ISO-8601 UTC string.
 * Uses the user's local timezone for the conversion — what they see in the
 * form is what they meant, regardless of where the server runs.
 *
 * Returns undefined when the date is missing or incomplete.
 */
export function buildIsoDateTime(
  date: string,
  time: string,
  ampm: AmPm,
): string | undefined {
  if (!date || date.length < 10) return undefined;
  const [mStr, dStr, yStr] = date.split('/');
  const m = Number(mStr), d = Number(dStr), y = Number(yStr);
  if (!m || !d || !y) return undefined;

  let h = 0, min = 0;
  if (time && time.length >= 5) {
    const [hStr, mStr2] = time.split(':');
    h = Number(hStr) || 0;
    min = Number(mStr2) || 0;
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
  }

  return new Date(y, m - 1, d, h, min, 0).toISOString();
}

/**
 * Split an ISO-8601 string back into the date/time/ampm form fields.
 * Returns empty fields for null/undefined input so screens can spread the
 * result into state regardless of whether the entity has a value yet.
 */
export function parseIsoToFields(
  iso: string | null | undefined,
): { date: string; time: string; ampm: AmPm } {
  if (!iso) return { date: '', time: '', ampm: 'AM' };
  const dt  = new Date(iso);
  const mo  = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  const yr  = dt.getFullYear();
  let h     = dt.getHours();
  const min = String(dt.getMinutes()).padStart(2, '0');
  const ampm: AmPm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return { date: `${mo}/${day}/${yr}`, time: `${String(h).padStart(2, '0')}:${min}`, ampm };
}
