import { describe, it, expect } from 'vitest';
import {
  validateGolfer,
  validateRoster,
  validateLeagueMember,
  toPlayerInput,
  parseHandicap,
} from '../registration';

const ava = { firstName: 'Ava', lastName: 'Stone', email: 'ava@example.com' };

describe('toPlayerInput', () => {
  it('sends the handicap as handicapIndex — the key the API reads', () => {
    // web and admin used to send `handicap`, which the API silently ignored
    const p = toPlayerInput({ ...ava, handicap: '14.2' });
    expect(p.handicapIndex).toBe(14.2);
    expect(p).not.toHaveProperty('handicap');
  });

  it('leaves a blank handicap out instead of sending 0', () => {
    expect(toPlayerInput({ ...ava, handicap: '  ' })).not.toHaveProperty('handicapIndex');
  });

  it('trims names, lowercases the email and keeps only phone digits', () => {
    expect(toPlayerInput({
      firstName: ' Ava ', lastName: ' Stone ', email: ' Ava@Example.COM ', phone: '(555) 867-5309',
    })).toEqual({ firstName: 'Ava', lastName: 'Stone', email: 'ava@example.com', phone: '5558675309' });
  });

  it('omits an empty phone', () => {
    expect(toPlayerInput({ ...ava, phone: '' })).not.toHaveProperty('phone');
  });
});

describe('validateGolfer', () => {
  it('accepts the minimum: name and email', () => {
    expect(validateGolfer(ava)).toBeNull();
  });

  it('requires first name, last name and a valid email', () => {
    expect(validateGolfer({ ...ava, firstName: ' ' })).toMatch(/first name/i);
    expect(validateGolfer({ ...ava, lastName: '' })).toMatch(/last name/i);
    expect(validateGolfer({ ...ava, email: '' })).toMatch(/email address is required/i);
    expect(validateGolfer({ ...ava, email: 'not-an-email' })).toMatch(/valid email/i);
  });

  it('requires a phone only when asked, and then 10 digits', () => {
    expect(validateGolfer(ava, { phoneRequired: true })).toMatch(/phone number is required/i);
    expect(validateGolfer({ ...ava, phone: '555-1234' })).toMatch(/10-digit US phone/);
    expect(validateGolfer({ ...ava, phone: '(155) 867-5309' })).toMatch(/10-digit US phone/);
    expect(validateGolfer({ ...ava, phone: '(555) 867-5309' }, { phoneRequired: true })).toBeNull();
  });

  it('bounds the handicap to 0–54 and rejects non-numbers', () => {
    expect(validateGolfer({ ...ava, handicap: '54' })).toBeNull();
    expect(validateGolfer({ ...ava, handicap: '0' })).toBeNull();
    expect(validateGolfer({ ...ava, handicap: '54.1' })).toMatch(/0 to 54/);
    expect(validateGolfer({ ...ava, handicap: 'abc' })).toMatch(/0 to 54/);
    expect(validateGolfer({ ...ava, handicap: '-2' })).toMatch(/0 to 54/);
  });

  it('prefixes messages with the golfer label', () => {
    expect(validateGolfer({ ...ava, email: '' }, { label: 'Teammate 2' })).toMatch(/^Teammate 2: /);
  });
});

describe('validateRoster', () => {
  it('applies the submitter rules to the first golfer only', () => {
    const ben = { firstName: 'Ben', lastName: 'Ray', email: 'ben@example.com' };
    const rules = { first: { phoneRequired: true } };
    expect(validateRoster([ava, ben], rules)).toMatch(/phone number is required/i);
    // the teammate has no phone either, and that is fine
    expect(validateRoster([{ ...ava, phone: '5558675309' }, ben], rules)).toBeNull();
  });

  it('labels teammates and rejects a repeated email', () => {
    const dup = [ava, { firstName: 'Ben', lastName: 'Ray', email: 'AVA@example.com' }];
    expect(validateRoster(dup)).toMatch(/listed twice/);
    const bad = [ava, { firstName: '', lastName: 'Ray', email: 'ben@example.com' }];
    expect(validateRoster(bad, { otherLabel: i => `Teammate ${i}` })).toMatch(/^Teammate 1: /);
  });
});

describe('validateLeagueMember', () => {
  it('requires a handicap — a blank used to be saved as scratch', () => {
    expect(validateLeagueMember(ava)).toMatch(/handicap index is required/i);
    expect(validateLeagueMember({ ...ava, handicap: '12.4' })).toBeNull();
  });
});

describe('parseHandicap', () => {
  it('distinguishes blank from invalid', () => {
    expect(parseHandicap('')).toBeNull();
    expect(parseHandicap(undefined)).toBeNull();
    expect(parseHandicap('8.5')).toBe(8.5);
    expect(parseHandicap('8,5')).toBeNaN();
  });
});
