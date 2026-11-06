import { describe, it, expect } from 'vitest';
import { buildHoleChallengeRows } from '../holeChallenges';
import type { PublicChallenge, PublicSponsorInfo } from '@/lib/api';

const sponsor = (name: string, holeNumbers: number[] = []): PublicSponsorInfo =>
  ({ name, logoUrl: '', tagline: null, tier: 'hole', holeNumbers });

const challenge = (id: string, holeNumber: number | null, extra: Partial<PublicChallenge> = {}): PublicChallenge =>
  ({ id, holeNumber, challengeType: 'ClosestToPin', description: `Contest ${id}`,
     prizeDescription: null, sponsorName: null, ...extra });

const view = (rows: ReturnType<typeof buildHoleChallengeRows>) =>
  rows.map(r => [r.hole, r.description, r.sponsorName]);

describe('buildHoleChallengeRows (event page Hole Challenges card)', () => {
  it('is empty with no hole sponsors and no challenges, so the card stays hidden', () => {
    expect(buildHoleChallengeRows([sponsor('Banner')], [])).toEqual([]);
  });

  it('lists hole sponsors alone when the organizer set up no challenges', () => {
    expect(view(buildHoleChallengeRows([sponsor('Pin Co', [7, 3])], []))).toEqual([
      [3, null, 'Pin Co'],
      [7, null, 'Pin Co'],
    ]);
  });

  it('puts the challenge description on its hole, sponsored by the linked sponsor', () => {
    const rows = buildHoleChallengeRows(
      [sponsor('Pin Co', [3])],
      [challenge('a', 3, { description: 'Closest to the Pin', sponsorName: 'Acme', prizeDescription: 'Driver' })],
    );
    expect(rows).toEqual([
      { key: 'c-a', hole: 3, description: 'Closest to the Pin', prize: 'Driver', sponsorName: 'Acme' },
    ]); // no separate plain "Pin Co" row for a hole that already has a challenge
  });

  it('credits the hole sponsors when the challenge has no sponsor of its own', () => {
    const rows = buildHoleChallengeRows(
      [sponsor('Pin Co', [3]), sponsor('Flag Inc', [3])],
      [challenge('a', 3)],
    );
    expect(view(rows)).toEqual([[3, 'Contest a', 'Pin Co, Flag Inc']]);
  });

  it('shows a challenge on a hole nobody sponsors, with no sponsor line', () => {
    expect(view(buildHoleChallengeRows([], [challenge('a', 5)]))).toEqual([[5, 'Contest a', null]]);
  });

  it('sorts by hole and puts all-day challenges last', () => {
    const rows = buildHoleChallengeRows(
      [sponsor('Pin Co', [9])],
      [challenge('allday', null), challenge('b', 12), challenge('a', 2)],
    );
    expect(rows.map(r => r.hole)).toEqual([2, 9, 12, null]);
  });

  it('turns a blank description or prize into null', () => {
    const [row] = buildHoleChallengeRows([], [challenge('a', 1, { description: '  ', prizeDescription: '' })]);
    expect(row).toMatchObject({ description: null, prize: null });
  });

  it('does not list a sponsor twice for the same hole', () => {
    expect(buildHoleChallengeRows([sponsor('Pin Co', [4, 4])], [])).toHaveLength(1);
  });
});
