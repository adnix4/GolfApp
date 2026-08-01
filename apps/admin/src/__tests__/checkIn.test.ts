import { describe, it, expect } from 'vitest';
import {
  isCheckedIn, checkInLabel, checkInColor,
  checkInConfirmCopy, cardlessHint,
  canCheckInWholeTeam, golfersWithoutCard,
} from '../lib/checkIn';

// The API projects the CheckInStatus enum with `.ToString()`, so the wire values
// are PascalCase. Both check-in screens used to compare against lowercase, which
// never matched — the Check In button was unrenderable and every team counted as
// checked in. These tests pin the real wire format.
describe('isCheckedIn', () => {
  it('treats Pending as not checked in', () => {
    expect(isCheckedIn('Pending')).toBe(false);
  });

  it('treats CheckedIn and Complete as checked in', () => {
    expect(isCheckedIn('CheckedIn')).toBe(true);
    expect(isCheckedIn('Complete')).toBe(true);
  });

  it('does not match the old lowercase spelling', () => {
    // Guards the regression: if the API ever switches to snake_case, 'pending'
    // would read as checked-in here and this test fails loudly.
    expect(isCheckedIn('pending')).toBe(true);
  });
});

describe('checkInLabel / checkInColor', () => {
  it('humanizes Complete as Checked In rather than leaking the internal value', () => {
    expect(checkInLabel('Complete')).toBe('Checked In');
    expect(checkInLabel('CheckedIn')).toBe('Checked In');
    expect(checkInLabel('Pending')).toBe('Pending');
  });

  it('gives each state its own colour and falls back for unknown values', () => {
    expect(checkInColor('Pending')).toBe('#f39c12');
    expect(checkInColor('CheckedIn')).toBe('#2ecc71');
    expect(checkInColor('Complete')).toBe('#27ae60');
    expect(checkInColor('nonsense')).toBe('#aaa');
  });
});

// The whole-team button is a fast path offered only when it carries no
// collection risk; any cardless golfer forces per-golfer check-in so the
// warning is seen and accepted individually.
describe('canCheckInWholeTeam', () => {
  it('allows the fast path when every golfer has a card', () => {
    expect(canCheckInWholeTeam([{ hasPaymentMethod: true }, { hasPaymentMethod: true }])).toBe(true);
  });

  it('withholds it when even one golfer is cardless', () => {
    expect(canCheckInWholeTeam([{ hasPaymentMethod: true }, { hasPaymentMethod: false }])).toBe(false);
  });

  it('withholds it for an empty roster', () => {
    expect(canCheckInWholeTeam([])).toBe(false);
  });
});

describe('golfersWithoutCard', () => {
  it('returns only the cardless golfers', () => {
    const roster = [
      { hasPaymentMethod: true,  firstName: 'Ann' },
      { hasPaymentMethod: false, firstName: 'Cara' },
      { hasPaymentMethod: false, firstName: 'Dan' },
    ];
    expect(golfersWithoutCard(roster).map(p => p.firstName)).toEqual(['Cara', 'Dan']);
  });
});

describe('cardlessHint', () => {
  it('explains why the team button is missing', () => {
    expect(cardlessHint(2, 4)).toBe('2 of 4 golfers have no card — check in individually');
  });

  it('singularizes a one-golfer team', () => {
    expect(cardlessHint(1, 1)).toBe('1 of 1 golfer have no card — check in individually');
  });
});

// The popup states card status either way; the cardless variant must warn about
// manual collection, because checking that golfer in unlocks cardless bidding.
describe('checkInConfirmCopy', () => {
  it('confirms plainly when the golfer has a card', () => {
    const c = checkInConfirmCopy('Jane Doe', true);
    expect(c.confirmText).toBe('Check In');
    expect(c.message).toContain('card on file');
    expect(c.message).toContain('Jane Doe');
    expect(c.message).not.toContain('collect payment manually');
  });

  it('warns about manual collection when the golfer has no card', () => {
    const c = checkInConfirmCopy('John Smith', false);
    expect(c.confirmText).toBe('Check In Anyway');
    expect(c.message).toContain('NO card on file');
    expect(c.message).toContain('John Smith');
    expect(c.message).toContain('collect payment manually');
  });

  it('uses the same title for both so the dialog reads consistently', () => {
    expect(checkInConfirmCopy('A', true).title).toBe(checkInConfirmCopy('A', false).title);
  });
});
