import { describe, it, expect } from 'vitest';
import {
  formatDateInput, formatTimeInput,
  validateDateField, validateTimeField,
  buildIsoDateTime, parseIsoToFields,
} from '../lib/dateTime';

describe('formatDateInput', () => {
  it('passes through 1-2 digits', () => {
    expect(formatDateInput('1')).toBe('1');
    expect(formatDateInput('12')).toBe('12');
  });

  it('inserts the first slash at 3 digits', () => {
    expect(formatDateInput('123')).toBe('12/3');
    expect(formatDateInput('1234')).toBe('12/34');
  });

  it('inserts the second slash at 5+ digits', () => {
    expect(formatDateInput('12345')).toBe('12/34/5');
    expect(formatDateInput('12312025')).toBe('12/31/2025');
  });

  it('caps at 8 digits worth of input', () => {
    expect(formatDateInput('123120259999')).toBe('12/31/2025');
  });

  it('strips non-digits', () => {
    expect(formatDateInput('12-31-2025')).toBe('12/31/2025');
  });
});

describe('formatTimeInput', () => {
  it('inserts the colon at 3 digits', () => {
    expect(formatTimeInput('123')).toBe('12:3');
    expect(formatTimeInput('1234')).toBe('12:34');
  });
});

describe('validateDateField', () => {
  it('treats empty input as not-yet-entered (no error)', () => {
    expect(validateDateField('')).toBeUndefined();
  });

  it('flags incomplete dates', () => {
    expect(validateDateField('12/31/20')).toMatch(/complete date/i);
  });

  it('accepts a valid date', () => {
    expect(validateDateField('12/31/2025')).toBeUndefined();
  });

  it('rejects out-of-range month/day/year', () => {
    expect(validateDateField('13/01/2025')).toMatch(/month/i);
    expect(validateDateField('01/32/2025')).toMatch(/day/i);
    expect(validateDateField('01/01/2024')).toMatch(/year/i);
  });
});

describe('validateTimeField', () => {
  it('treats empty as no error', () => {
    expect(validateTimeField('')).toBeUndefined();
  });

  it('accepts a valid 12-hour time', () => {
    expect(validateTimeField('09:30')).toBeUndefined();
    expect(validateTimeField('12:00')).toBeUndefined();
  });

  it('rejects out-of-range hour/minute', () => {
    expect(validateTimeField('13:00')).toMatch(/hour/i);
    expect(validateTimeField('09:60')).toMatch(/minute/i);
  });
});

describe('buildIsoDateTime / parseIsoToFields round-trip', () => {
  it('returns undefined for incomplete dates', () => {
    expect(buildIsoDateTime('', '', 'AM')).toBeUndefined();
    expect(buildIsoDateTime('12/31', '09:00', 'AM')).toBeUndefined();
  });

  it('round-trips a known PM value', () => {
    const iso = buildIsoDateTime('06/15/2026', '02:30', 'PM');
    expect(iso).toBeDefined();
    const parsed = parseIsoToFields(iso!);
    expect(parsed.date).toBe('06/15/2026');
    expect(parsed.time).toBe('02:30');
    expect(parsed.ampm).toBe('PM');
  });

  it('round-trips a midnight (12 AM) value', () => {
    const iso = buildIsoDateTime('06/15/2026', '12:00', 'AM');
    const parsed = parseIsoToFields(iso!);
    expect(parsed.time).toBe('12:00');
    expect(parsed.ampm).toBe('AM');
  });

  it('round-trips a noon (12 PM) value', () => {
    const iso = buildIsoDateTime('06/15/2026', '12:00', 'PM');
    const parsed = parseIsoToFields(iso!);
    expect(parsed.time).toBe('12:00');
    expect(parsed.ampm).toBe('PM');
  });

  it('returns empty fields for null/undefined ISO input', () => {
    expect(parseIsoToFields(null)).toEqual({ date: '', time: '', ampm: 'AM' });
    expect(parseIsoToFields(undefined)).toEqual({ date: '', time: '', ampm: 'AM' });
  });
});
