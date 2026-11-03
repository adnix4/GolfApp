import { describe, expect, it } from 'vitest';
import {
  buildFlightPayload, changedHoles, flightRangeLabel, holeInputsFrom, parseSkinsPot, scorableMembers,
} from '../lib/leagueAdmin';
import type { LeagueMember, LeagueScorecard, RoundAbsence } from '../lib/api';

const card = (scores: [number, number][]): LeagueScorecard => ({
  memberId: 'm1', memberName: 'A B', handicapIndex: 10, grossTotal: 0, netTotal: 0, stablefordTotal: 0,
  holes: scores.map(([holeNumber, grossScore]) => ({
    holeNumber, grossScore, par: 4, netScore: grossScore, stablefordPoints: 0,
  })),
});

const member = (id: string, lastName: string, status = 'Active') =>
  ({ id, lastName, firstName: 'X', status }) as LeagueMember;

describe('changedHoles', () => {
  it('sends only holes that differ from the saved card', () => {
    const saved = card([[1, 4], [2, 5]]);
    expect(changedHoles({ 1: '4', 2: '6', 3: '3' }, saved, 18)).toEqual({
      changes: [{ holeNumber: 2, grossScore: 6 }, { holeNumber: 3, grossScore: 3 }],
    });
  });

  it('allows blanks on a partial card', () => {
    expect(changedHoles({ 1: '4' }, undefined, 18).changes).toHaveLength(1);
  });

  it('refuses to blank a saved hole, since the API cannot delete one', () => {
    const result = changedHoles({ 1: ' ' }, card([[1, 4]]), 18);
    expect(result.error).toContain('Hole 1');
    expect(result.changes).toEqual([]);
  });

  it.each(['0', '21', '4.5', 'x', '-1'])('rejects %s', value => {
    expect(changedHoles({ 7: value }, undefined, 18).error).toContain('Hole 7');
  });

  it('ignores boxes past the end of the card', () => {
    expect(changedHoles({ 10: '4' }, undefined, 9).changes).toEqual([]);
  });
});

describe('holeInputsFrom', () => {
  it('seeds the boxes from a saved card', () => {
    expect(holeInputsFrom(card([[3, 5]]))).toEqual({ 3: '5' });
    expect(holeInputsFrom(undefined)).toEqual({});
  });
});

describe('scorableMembers', () => {
  it('keeps active members and subs, drops absent and inactive, sorts by name', () => {
    const roster = [
      member('1', 'Young'), member('2', 'Adams'), member('3', 'Gone', 'Inactive'),
      member('4', 'Away'), member('5', 'Mills', 'Sub'),
    ];
    const absences = [{ memberId: '4' }] as RoundAbsence[];
    expect(scorableMembers(roster, absences).map(m => m.id)).toEqual(['2', '5', '1']);
  });
});

describe('parseSkinsPot', () => {
  it('treats blank as no skins and converts dollars to cents', () => {
    expect(parseSkinsPot(' ')).toEqual({ cents: 0 });
    expect(parseSkinsPot('2')).toEqual({ cents: 200 });
    expect(parseSkinsPot('0.25')).toEqual({ cents: 25 });
    expect(parseSkinsPot('1.10')).toEqual({ cents: 110 });
  });

  it.each(['-1', 'two'])('rejects %s', value => {
    expect(parseSkinsPot(value).error).toBeTruthy();
  });
});

describe('buildFlightPayload', () => {
  it('needs a name', () => {
    expect(buildFlightPayload({ name: ' ', minHandicap: '', maxHandicap: '' }).error).toBeTruthy();
  });

  it('keeps zero and plus handicaps, and leaves blanks out', () => {
    expect(buildFlightPayload({ name: ' A ', minHandicap: '-2.5', maxHandicap: '0' }).payload)
      .toEqual({ name: 'A', minHandicap: -2.5, maxHandicap: 0 });
    expect(buildFlightPayload({ name: 'B', minHandicap: '', maxHandicap: '' }).payload)
      .toEqual({ name: 'B', minHandicap: undefined, maxHandicap: undefined });
  });

  it('rejects a backwards range and non-numbers', () => {
    expect(buildFlightPayload({ name: 'A', minHandicap: '10', maxHandicap: '5' }).error).toBeTruthy();
    expect(buildFlightPayload({ name: 'A', minHandicap: 'low', maxHandicap: '' }).error).toBeTruthy();
  });
});

describe('flightRangeLabel', () => {
  it('words each range shape', () => {
    expect(flightRangeLabel({ minHandicap: 0, maxHandicap: 9 })).toBe('HC 0–9');
    expect(flightRangeLabel({ minHandicap: 10, maxHandicap: null })).toBe('HC 10+');
    expect(flightRangeLabel({ minHandicap: null, maxHandicap: 9 })).toBe('HC up to 9');
    expect(flightRangeLabel({ minHandicap: null, maxHandicap: null })).toBe('');
  });
});
