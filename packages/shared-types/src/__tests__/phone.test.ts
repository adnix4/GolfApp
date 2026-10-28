import { describe, it, expect } from 'vitest';
import { digitsOnly, fmtPhoneInput, fmtPhone, isValidPhone } from '../phone';

describe('digitsOnly', () => {
  it('strips non-digit characters', () => {
    expect(digitsOnly('(555) 867-5309')).toBe('5558675309');
  });

  it('caps at 10 digits', () => {
    expect(digitsOnly('55586753091234')).toBe('5558675309');
  });

  it('drops a leading US country code once past 10 digits', () => {
    expect(digitsOnly('+1 (555) 867-5309')).toBe('5558675309');
    expect(digitsOnly('15558675309')).toBe('5558675309');
    expect(digitsOnly('1555')).toBe('1555');   // still typing: nothing dropped yet
  });

  it('returns empty string for empty input', () => {
    expect(digitsOnly('')).toBe('');
  });
});

describe('fmtPhoneInput', () => {
  it('passes through 1-3 digits unchanged', () => {
    expect(fmtPhoneInput('')).toBe('');
    expect(fmtPhoneInput('5')).toBe('5');
    expect(fmtPhoneInput('555')).toBe('555');
  });

  it('inserts area-code parens at 4 digits', () => {
    expect(fmtPhoneInput('5558')).toBe('(555) 8');
  });

  it('uses area-code-only format up to 6 digits', () => {
    expect(fmtPhoneInput('5558675')).toBe('(555) 867-5');
    expect(fmtPhoneInput('555867')).toBe('(555) 867');
  });

  it('uses full format from 7-10 digits', () => {
    expect(fmtPhoneInput('5558675309')).toBe('(555) 867-5309');
  });
});

describe('fmtPhone', () => {
  it('returns null for null/empty input', () => {
    expect(fmtPhone(null)).toBeNull();
    expect(fmtPhone(undefined)).toBeNull();
    expect(fmtPhone('')).toBeNull();
  });

  it('formats a 10-digit raw value', () => {
    expect(fmtPhone('5558675309')).toBe('(555) 867-5309');
  });

  it('strips non-digits before formatting', () => {
    expect(fmtPhone('555.867.5309')).toBe('(555) 867-5309');
  });

  it('falls back to raw value when not 10 digits', () => {
    expect(fmtPhone('555')).toBe('555');
    expect(fmtPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
  });
});

describe('isValidPhone', () => {
  it('accepts a complete US number in any common format', () => {
    for (const v of ['5558675309', '(555) 867-5309', '555.867.5309', '+1 555 867 5309']) {
      expect(isValidPhone(v)).toBe(true);
    }
  });

  it('rejects short numbers and impossible area codes or exchanges', () => {
    for (const v of ['', '555-1234', '(055) 867-5309', '(155) 867-5309', '(555) 067-5309', '(555) 167-5309']) {
      expect(isValidPhone(v)).toBe(false);
    }
  });
});
