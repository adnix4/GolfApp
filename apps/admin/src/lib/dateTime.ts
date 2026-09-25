/**
 * Date/time helpers for the admin UI.
 *
 * Every date/time entry in admin goes through DateTimeField (Expo's native
 * picker / the browser's <input type="date|time">), which speaks the HTML input
 * value formats: dates as `YYYY-MM-DD`, times as 24-hour `HH:mm`, both in the
 * organizer's local time. These helpers convert between those values, the
 * ISO-8601 UTC timestamps the API stores for event starts and auction closes,
 * and the display strings shown in error copy. League season/round dates are
 * API `DateOnly` values, already `YYYY-MM-DD`, so they need no conversion.
 *
 * All functions are pure; validators take `now` so tests can pin the clock.
 */

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Local Date → `YYYY-MM-DD`. */
export function toPickerDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local Date → 24-hour `HH:mm`. */
export function toPickerTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Picker values → local Date. A missing time means midnight; a missing or
 * malformed date returns undefined.
 */
export function pickerValuesToDate(date: string, time: string): Date | undefined {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!dm) return undefined;
  const y = Number(dm[1]), m = Number(dm[2]), d = Number(dm[3]);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  const dt = new Date(y, m - 1, d, tm ? Number(tm[1]) : 0, tm ? Number(tm[2]) : 0, 0);
  // Reject roll-overs like 2026-02-31 → Mar 3.
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return undefined;
  return dt;
}

/** Picker values → ISO-8601 UTC for the API; undefined when no date is set. */
export function pickerValuesToIso(date: string, time: string): string | undefined {
  return pickerValuesToDate(date, time)?.toISOString();
}

/**
 * ISO-8601 timestamp → local picker values. Null/undefined gives empty fields
 * so screens can seed state whether or not the entity has a value yet.
 */
export function isoToPickerValues(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return { date: '', time: '' };
  return { date: toPickerDate(dt), time: toPickerTime(dt) };
}

/** `YYYY-MM-DD` → `MM/DD/YYYY` for display; '' when unset. */
export function formatPickerDate(date: string): string {
  const d = pickerValuesToDate(date, '');
  return d ? `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}` : '';
}

/** `HH:mm` → `h:mm AM/PM` for display; '' when unset. */
export function formatPickerTime(time: string): string {
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!tm) return '';
  const h = Number(tm[1]);
  return `${h % 12 || 12}:${tm[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

export interface PickerErrors { date?: string; time?: string }

export interface DateTimeRules {
  /** Word used in error copy, e.g. "Start" → "Start date can't be in the past". */
  label: string;
  /** Require the combined date + time to be after `now`. */
  future?: boolean;
  /** Earliest / latest allowed date, `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  /** What the min–max range is, for error copy: "the season". */
  rangeName?: string;
  now?: Date;
}

/**
 * Validate an optional date + optional time pair. A time needs a date; the
 * date must be real and inside min/max; with `future`, the moment they
 * describe must not have passed (a date of today with no time is midnight,
 * which has). The browser's min/max attributes are hints only — a typed-in
 * date can still land outside them — so callers always validate.
 */
export function validatePickerDateTime(date: string, time: string, rules: DateTimeRules): PickerErrors {
  const { label, future, min, max, rangeName = 'the allowed range', now = new Date() } = rules;
  if (!date) return time ? { time: `Pick a date for this ${label.toLowerCase()} time` } : {};
  const when = pickerValuesToDate(date, time);
  if (!when) return { date: 'Pick a valid date' };

  if ((min && date < min) || (max && date > max)) {
    if (min && max) return { date: `Pick a date within ${rangeName} (${formatPickerDate(min)} – ${formatPickerDate(max)})` };
    if (min) return { date: `Pick a date on or after ${formatPickerDate(min)}` };
    return { date: `Pick a date on or before ${formatPickerDate(max!)}` };
  }

  if (future && when <= now) {
    if (date < toPickerDate(now)) return { date: `${label} date can’t be in the past` };
    return time
      ? { time: `${label} time has already passed` }
      : { time: `Pick a ${label.toLowerCase()} time later today` };
  }
  return {};
}

/** Validate a required `YYYY-MM-DD` start/end pair (league seasons). */
export function validateDateRange(start: string, end: string): { start?: string; end?: string } {
  const errs: { start?: string; end?: string } = {};
  if (!start) errs.start = 'Pick a start date';
  else if (!pickerValuesToDate(start, '')) errs.start = 'Pick a valid date';
  if (!end) errs.end = 'Pick an end date';
  else if (!pickerValuesToDate(end, '')) errs.end = 'Pick a valid date';
  if (!errs.start && !errs.end && end < start) errs.end = 'End date can’t be before the start date';
  return errs;
}
