/**
 * Date display helpers: the single source of display formats for admin,
 * mobile and web, so a date reads the same on every screen that shows it.
 *
 * Two kinds of value come from the API:
 *
 *  - Timestamps (event startAt, auction closesAt, tee times, createdAt…):
 *    ISO-8601 strings stored in UTC. They are shown in the viewer's local
 *    time zone, the zone the organizer entered them in, since nothing
 *    stores an event time zone yet. Server-rendered output (Next.js server
 *    components, API emails) runs in the server's zone, usually UTC, so
 *    format timestamps on the client or pass `timeZone` explicitly.
 *
 *  - Date-only values (league season start/end, round dates): `YYYY-MM-DD`
 *    with no zone. Never pass these to `new Date(str)`: that reads them as
 *    UTC midnight, which is the previous evening anywhere west of Greenwich.
 *    Use formatDateOnly / parseDateOnly.
 *
 * Formats (en-US): date "Dec 12, 2026", time "7:45 AM" (no leading zero),
 * date-time "Dec 12, 2026, 7:45 AM". Pass Intl options to add a weekday or
 * spell out the month; pass `year: undefined` to drop the year.
 */

const LOCALE = 'en-US';
const DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

type Stamp = string | Date | null | undefined;

function toDate(v: Stamp): Date | undefined {
  if (v == null || v === '') return undefined;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

/** `YYYY-MM-DD` → local-midnight Date, or undefined when malformed. */
export function parseDateOnly(value: string | null | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!m) return undefined;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? dt : undefined;
}

/** Date-only `YYYY-MM-DD` → "Jun 15, 2027"; '' when unset or malformed. */
export function formatDateOnly(value: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  const d = parseDateOnly(value);
  return d ? d.toLocaleDateString(LOCALE, { ...DATE, ...opts }) : '';
}

/** Timestamp → local date, "Dec 12, 2026"; '' when unset. */
export function formatDate(value: Stamp, opts?: Intl.DateTimeFormatOptions): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString(LOCALE, { ...DATE, ...opts }) : '';
}

/** Timestamp → local time, "7:45 AM"; '' when unset. */
export function formatTime(value: Stamp, opts?: Intl.DateTimeFormatOptions): string {
  const d = toDate(value);
  return d ? d.toLocaleTimeString(LOCALE, { ...TIME, ...opts }) : '';
}

/** Timestamp → local date and time, "Dec 12, 2026, 7:45 AM"; '' when unset. */
export function formatDateTime(value: Stamp, opts?: Intl.DateTimeFormatOptions): string {
  const d = toDate(value);
  return d ? d.toLocaleString(LOCALE, { ...DATE, ...TIME, ...opts }) : '';
}
