import { describe, it, expect } from 'vitest';
import {
  formatCents, formatCentsShort, centsToDollarsInput, dollarsToCents,
  formatMoneyInput,
} from '../money';

describe('formatCents', () => {
  it('formats whole-dollar cents as USD currency', () => {
    expect(formatCents(12345)).toBe('$123.45');
  });

  it('renders zero correctly', () => {
    expect(formatCents(0)).toBe('$0.00');
  });

  it('inserts the thousands separator', () => {
    expect(formatCents(123456789)).toBe('$1,234,567.89');
  });

  it('handles negative cents', () => {
    expect(formatCents(-500)).toBe('-$5.00');
  });
});

describe('formatCentsShort', () => {
  it('formats with no grouping', () => {
    expect(formatCentsShort(12345)).toBe('$123.45');
  });

  it('always uses two decimals', () => {
    expect(formatCentsShort(100)).toBe('$1.00');
    expect(formatCentsShort(0)).toBe('$0.00');
  });
});

describe('centsToDollarsInput', () => {
  it('returns empty string for null/undefined', () => {
    expect(centsToDollarsInput(null)).toBe('');
    expect(centsToDollarsInput(undefined)).toBe('');
  });

  it('returns "0.00" for zero (NOT empty string)', () => {
    expect(centsToDollarsInput(0)).toBe('0.00');
  });

  it('rounds to two decimal places', () => {
    expect(centsToDollarsInput(12345)).toBe('123.45');
    expect(centsToDollarsInput(100)).toBe('1.00');
  });
});

describe('dollarsToCents', () => {
  it('round-trips with centsToDollarsInput', () => {
    expect(dollarsToCents('123.45')).toBe(12345);
    expect(dollarsToCents('1.00')).toBe(100);
  });

  it('strips currency symbols and commas', () => {
    expect(dollarsToCents('$1,234.56')).toBe(123456);
  });

  it('returns 0 for empty or non-numeric input', () => {
    expect(dollarsToCents('')).toBe(0);
    expect(dollarsToCents('abc')).toBe(0);
  });

  it('rounds to the nearest cent to avoid float drift', () => {
    expect(dollarsToCents('0.1')).toBe(10);
    expect(dollarsToCents('0.01')).toBe(1);
    expect(dollarsToCents('0.005')).toBe(1);
  });
});

describe('formatMoneyInput', () => {
  it('reads typed digits as cents, cash-register style', () => {
    expect(formatMoneyInput('5')).toBe('$0.05');
    expect(formatMoneyInput('50')).toBe('$0.50');
    expect(formatMoneyInput('5000')).toBe('$50.00');
    expect(formatMoneyInput('123456')).toBe('$1,234.56');
  });

  it('ignores any non-digit characters (currency symbol, commas, letters)', () => {
    expect(formatMoneyInput('$1,234')).toBe('$12.34');
    expect(formatMoneyInput('12a3')).toBe('$1.23');
  });

  it('returns empty string when there are no digits, so a placeholder can show', () => {
    expect(formatMoneyInput('')).toBe('');
    expect(formatMoneyInput('abc')).toBe('');
    expect(formatMoneyInput('$')).toBe('');
  });

  it('collapses leading zeros', () => {
    expect(formatMoneyInput('007')).toBe('$0.07');
  });

  it('clamps at the $999,999.99 ceiling', () => {
    expect(formatMoneyInput('999999999999')).toBe('$999,999.99');
  });

  it('round-trips through dollarsToCents', () => {
    expect(dollarsToCents(formatMoneyInput('5000'))).toBe(5000);
    expect(dollarsToCents(formatMoneyInput('123456'))).toBe(123456);
  });
});
