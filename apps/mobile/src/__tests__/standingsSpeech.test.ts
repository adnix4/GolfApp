import { describe, expect, it } from 'vitest';
import { golferRowLabel, ordinal, teamRowLabel } from '../lib/standingsSpeech';
import type { PublicIndividualEntry, PublicLeaderboardEntry } from '../lib/api';

const team = (o: Partial<PublicLeaderboardEntry> = {}): PublicLeaderboardEntry => ({
  rank: 1, teamId: 't', teamName: 'Timing Crew', toPar: -2, grossTotal: 30,
  stablefordPoints: 0, holesComplete: 9, isComplete: false, strokesBack: 0,
  bestHole: null, bestHoleScore: null, ...o,
});
const golfer = (o: Partial<PublicIndividualEntry> = {}): PublicIndividualEntry => ({
  rank: 2, playerId: 'p', playerName: 'Ava Stone', teamId: 't', teamName: 'Timing Crew',
  toPar: 1, grossTotal: 37, holesComplete: 9, isComplete: false, strokesBack: 3, ...o,
});

describe('ordinal', () => {
  it.each([[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd'], [111, '111th']])(
    '%i → %s', (n, s) => expect(ordinal(n)).toBe(s));
});

describe('teamRowLabel', () => {
  it('reads a leading team as one sentence', () => {
    expect(teamRowLabel(team({ bestHole: 7, bestHoleScore: 2 }), false))
      .toBe('1st, Timing Crew, 2 under par, through 9 holes, best hole 7, scored 2');
  });
  it('says how far back a trailing team is, and singular holes/strokes', () => {
    expect(teamRowLabel(team({ rank: 3, toPar: 0, holesComplete: 1, strokesBack: 1 }), false))
      .toBe('3rd, Timing Crew, even par, through 1 hole, 1 stroke back');
  });
  it('says finished instead of a hole count', () => {
    expect(teamRowLabel(team({ isComplete: true, holesComplete: 18 }), false)).toContain('finished');
  });
  it('uses points on a Stableford board', () => {
    expect(teamRowLabel(team({ stablefordPoints: 14 }), true))
      .toBe('1st, Timing Crew, 14 points, through 9 holes');
  });
  it('never speaks a rank of 0 or a par for a team that has not scored', () => {
    expect(teamRowLabel(team({ rank: 0, toPar: 0, holesComplete: 0 }), false))
      .toBe('Timing Crew, no holes scored yet');
  });
});

describe('golferRowLabel', () => {
  it('names the golfer and team, score, total and gap', () => {
    expect(golferRowLabel(golfer()))
      .toBe('2nd, Ava Stone of Timing Crew, 1 over par, 37 strokes total, through 9 holes, 3 strokes back');
  });
  it('handles a golfer with no holes', () => {
    expect(golferRowLabel(golfer({ rank: 0, holesComplete: 0 }))).toBe('Ava Stone of Timing Crew, no holes scored yet');
  });
});
