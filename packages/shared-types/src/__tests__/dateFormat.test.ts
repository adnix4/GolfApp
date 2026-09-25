import { describe, it, expect } from 'vitest';
import {
  parseDateOnly, formatDateOnly, formatDate, formatTime, formatDateTime,
} from '../dateFormat';

// Timestamp tests pin the zone through Intl so they pass on any machine/CI.
const CHI = { timeZone: 'America/Chicago' } as const;
// 7:45 AM Central on Dec 12 2026 (CST, UTC-6), as the API stores it.
const START = '2026-12-12T13:45:00Z';

describe('date-only values', () => {
  it('formats YYYY-MM-DD without shifting the day', () => {
    // new Date('2027-06-15') would be UTC midnight → Jun 14 in the Americas.
    expect(formatDateOnly('2027-06-15')).toBe('Jun 15, 2027');
    expect(formatDateOnly('2027-01-01')).toBe('Jan 1, 2027');
  });

  it('accepts Intl options', () => {
    expect(formatDateOnly('2027-06-15', { weekday: 'short' })).toBe('Tue, Jun 15, 2027');
    expect(formatDateOnly('2027-06-15', { year: undefined })).toBe('Jun 15');
  });

  it('is empty for missing or malformed input', () => {
    expect(formatDateOnly(null)).toBe('');
    expect(formatDateOnly('')).toBe('');
    expect(formatDateOnly('06/15/2027')).toBe('');
    expect(parseDateOnly('2027-02-30')).toBeUndefined();
  });
});

describe('timestamps', () => {
  it('shows the local wall-clock time that was entered, not UTC', () => {
    expect(formatTime(START, CHI)).toBe('7:45 AM');
    expect(formatDate(START, CHI)).toBe('Dec 12, 2026');
    expect(formatDateTime(START, CHI)).toBe('Dec 12, 2026, 7:45 AM');
  });

  it('keeps an evening start on its local date', () => {
    // 8:00 PM Central Oct 3 is already Oct 4 in UTC.
    expect(formatDate('2026-10-04T01:00:00Z', CHI)).toBe('Oct 3, 2026');
  });

  it('accepts Date objects and Intl options', () => {
    expect(formatDate(new Date(START), { ...CHI, weekday: 'long', month: 'long' }))
      .toBe('Saturday, December 12, 2026');
    expect(formatDate(START, { ...CHI, weekday: 'short', year: undefined })).toBe('Sat, Dec 12');
  });

  it('is empty for missing or invalid input', () => {
    expect(formatDate(null)).toBe('');
    expect(formatTime(undefined)).toBe('');
    expect(formatDateTime('not a date')).toBe('');
  });
});
