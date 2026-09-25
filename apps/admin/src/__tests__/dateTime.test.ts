import { describe, it, expect } from 'vitest';
import {
  toPickerDate, toPickerTime, pickerValuesToDate, pickerValuesToIso,
  isoToPickerValues, formatPickerDate, formatPickerTime,
  validatePickerDateTime, validateDateRange,
} from '../lib/dateTime';

describe('picker values', () => {
  it('round-trips a local Date through YYYY-MM-DD / HH:mm', () => {
    const d = new Date(2026, 9, 3, 13, 5);
    expect(toPickerDate(d)).toBe('2026-10-03');
    expect(toPickerTime(d)).toBe('13:05');
    expect(pickerValuesToDate('2026-10-03', '13:05')?.getTime()).toBe(d.getTime());
  });

  it('treats a missing time as local midnight', () => {
    expect(pickerValuesToIso('2026-10-03', '')).toBe(new Date(2026, 9, 3).toISOString());
  });

  it('returns undefined without a valid date', () => {
    expect(pickerValuesToIso('', '09:00')).toBeUndefined();
    expect(pickerValuesToDate('10/03/2026', '')).toBeUndefined();
  });

  it('rejects dates that roll over (Feb 31)', () => {
    expect(pickerValuesToDate('2026-02-31', '')).toBeUndefined();
  });

  it('formats for display', () => {
    expect(formatPickerDate('2026-10-03')).toBe('10/03/2026');
    expect(formatPickerDate('')).toBe('');
    expect(formatPickerTime('00:30')).toBe('12:30 AM');
    expect(formatPickerTime('12:00')).toBe('12:00 PM');
    expect(formatPickerTime('13:05')).toBe('1:05 PM');
    expect(formatPickerTime('')).toBe('');
  });
});

describe('isoToPickerValues', () => {
  it('round-trips picker values through the ISO string the API stores', () => {
    for (const [date, time] of [['2026-06-15', '14:30'], ['2026-06-15', '00:00'], ['2026-06-15', '12:00']]) {
      expect(isoToPickerValues(pickerValuesToIso(date, time))).toEqual({ date, time });
    }
  });

  it('round-trips across the DST changes', () => {
    // Valid wall-clock times in every zone; US zones shift on these dates.
    for (const [date, time] of [['2026-03-08', '03:30'], ['2026-11-01', '01:30'], ['2026-11-01', '23:00']]) {
      expect(isoToPickerValues(pickerValuesToIso(date, time))).toEqual({ date, time });
    }
  });

  it('returns empty fields for missing or bad input', () => {
    expect(isoToPickerValues(null)).toEqual({ date: '', time: '' });
    expect(isoToPickerValues(undefined)).toEqual({ date: '', time: '' });
    expect(isoToPickerValues('not a date')).toEqual({ date: '', time: '' });
  });
});

describe('validatePickerDateTime', () => {
  const now = new Date(2026, 8, 25, 15, 0);   // Sep 25 2026, 3:00 PM local
  const future = { label: 'Start', future: true, now };

  it('allows both fields empty', () => {
    expect(validatePickerDateTime('', '', future)).toEqual({});
  });

  it('rejects a time without a date', () => {
    expect(validatePickerDateTime('', '08:00', future).time).toBe('Pick a date for this start time');
  });

  it('allows a future moment', () => {
    expect(validatePickerDateTime('2026-10-03', '', future)).toEqual({});
    expect(validatePickerDateTime('2026-09-25', '15:30', future)).toEqual({});
  });

  it('rejects a past date', () => {
    expect(validatePickerDateTime('2026-09-24', '', future).date).toBe('Start date can’t be in the past');
  });

  it('rejects today with a time that has passed, or no time (midnight)', () => {
    expect(validatePickerDateTime('2026-09-25', '14:00', future).time).toBe('Start time has already passed');
    expect(validatePickerDateTime('2026-09-25', '', future).time).toBe('Pick a start time later today');
  });

  it('skips the past check when future is off (unchanged saved value)', () => {
    expect(validatePickerDateTime('2026-01-10', '09:00', { label: 'Start', now })).toEqual({});
  });

  it('enforces a min–max range', () => {
    const season = { label: 'Round', min: '2026-04-01', max: '2026-09-30', rangeName: 'the season', now };
    expect(validatePickerDateTime('2026-06-15', '', season)).toEqual({});
    expect(validatePickerDateTime('2026-04-01', '', season)).toEqual({});
    expect(validatePickerDateTime('2026-10-01', '', season).date)
      .toBe('Pick a date within the season (04/01/2026 – 09/30/2026)');
    expect(validatePickerDateTime('2026-03-31', '', { label: 'Round', min: '2026-04-01' }).date)
      .toBe('Pick a date on or after 04/01/2026');
  });
});

describe('validateDateRange', () => {
  it('requires both dates', () => {
    expect(validateDateRange('', '')).toEqual({ start: 'Pick a start date', end: 'Pick an end date' });
  });

  it('allows end on or after start', () => {
    expect(validateDateRange('2026-04-01', '2026-09-30')).toEqual({});
    expect(validateDateRange('2026-04-01', '2026-04-01')).toEqual({});
  });

  it('rejects end before start', () => {
    expect(validateDateRange('2026-09-30', '2026-04-01').end).toBe('End date can’t be before the start date');
  });
});
