import { describe, it, expect } from 'vitest';
import {
  GFPThemeSchema,
  EventSchema,
  LeaderboardEntrySchema,
  LeaderboardSchema,
} from '../index';

// ── GFPThemeSchema ──────────────────────────────────────────────────────────

describe('GFPThemeSchema', () => {
  const validTheme = {
    primary: '#31572c', action: '#409151', accent: '#8ba955',
    highlight: '#ecf39e', surface: '#f4f7de',
  };

  it('accepts a valid 6-digit hex theme', () => {
    expect(GFPThemeSchema.safeParse(validTheme).success).toBe(true);
  });

  it('rejects a token with 8-digit hex (with alpha)', () => {
    const result = GFPThemeSchema.safeParse({ ...validTheme, primary: '#31572cff' });
    expect(result.success).toBe(false);
  });

  it('rejects a token with 3-digit shorthand hex', () => {
    const result = GFPThemeSchema.safeParse({ ...validTheme, primary: '#abc' });
    expect(result.success).toBe(false);
  });

  it('rejects a token without the leading #', () => {
    const result = GFPThemeSchema.safeParse({ ...validTheme, primary: '31572c' });
    expect(result.success).toBe(false);
  });

  it('rejects a token with non-hex characters', () => {
    const result = GFPThemeSchema.safeParse({ ...validTheme, primary: '#GGGGGG' });
    expect(result.success).toBe(false);
  });

  it('accepts uppercase hex digits', () => {
    const result = GFPThemeSchema.safeParse({ ...validTheme, primary: '#A1B2C3' });
    expect(result.success).toBe(true);
  });

  it('rejects extra unknown keys (strict mode)', () => {
    const result = GFPThemeSchema.safeParse({ ...validTheme, extraField: '#ffffff' });
    expect(result.success).toBe(false);
  });

  it('rejects when a required token is missing', () => {
    const { surface: _s, ...withoutSurface } = validTheme;
    const result = GFPThemeSchema.safeParse(withoutSurface);
    expect(result.success).toBe(false);
  });

  it('parses a valid theme and returns the same values', () => {
    const result = GFPThemeSchema.parse(validTheme);
    expect(result).toStrictEqual(validTheme);
  });
});

// ── EventSchema ─────────────────────────────────────────────────────────────

describe('EventSchema', () => {
  const validEvent = {
    id:        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    orgId:     'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    name:      'Spring Golf Classic',
    eventCode: 'ABCD1234',
    format:    'scramble' as const,
    startType: 'shotgun'  as const,
    holes:     18 as const,
    status:    'registration' as const,
    startAt:   '2026-06-15T09:00:00Z',
    config:    { allowWalkUps: true },
    course:    null,
  };

  it('accepts a valid event', () => {
    expect(EventSchema.safeParse(validEvent).success).toBe(true);
  });

  it('rejects a non-UUID id', () => {
    const result = EventSchema.safeParse({ ...validEvent, id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects an eventCode that is not exactly 8 characters', () => {
    expect(EventSchema.safeParse({ ...validEvent, eventCode: 'SHORT' }).success).toBe(false);
    expect(EventSchema.safeParse({ ...validEvent, eventCode: 'TOOLONGCODE' }).success).toBe(false);
  });

  it('rejects an invalid format', () => {
    const result = EventSchema.safeParse({ ...validEvent, format: 'bogus' });
    expect(result.success).toBe(false);
  });

  it('rejects holes value of 27 (only 9 or 18 allowed)', () => {
    const result = EventSchema.safeParse({ ...validEvent, holes: 27 });
    expect(result.success).toBe(false);
  });

  it('accepts holes=9', () => {
    expect(EventSchema.safeParse({ ...validEvent, holes: 9 }).success).toBe(true);
  });

  it('accepts all valid statuses', () => {
    const statuses = ['draft', 'registration', 'active', 'scoring', 'completed', 'cancelled'];
    statuses.forEach(status => {
      expect(EventSchema.safeParse({ ...validEvent, status }).success).toBe(true);
    });
  });

  it('rejects an empty event name', () => {
    const result = EventSchema.safeParse({ ...validEvent, name: '' });
    expect(result.success).toBe(false);
  });

  it('accepts startAt as null', () => {
    expect(EventSchema.safeParse({ ...validEvent, startAt: null }).success).toBe(true);
  });
});

// ── LeaderboardEntrySchema ──────────────────────────────────────────────────

describe('LeaderboardEntrySchema', () => {
  const validEntry = {
    rank: 1, teamId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    teamName: 'Team Alpha', toPar: -6, grossTotal: 66,
    holesComplete: 18, isComplete: true, sponsorBadge: null,
  };

  it('accepts a valid leaderboard entry', () => {
    expect(LeaderboardEntrySchema.safeParse(validEntry).success).toBe(true);
  });

  it('rejects rank of 0 (must be positive)', () => {
    expect(LeaderboardEntrySchema.safeParse({ ...validEntry, rank: 0 }).success).toBe(false);
  });

  it('rejects negative grossTotal', () => {
    expect(LeaderboardEntrySchema.safeParse({ ...validEntry, grossTotal: -1 }).success).toBe(false);
  });

  it('rejects holesComplete > 18', () => {
    expect(LeaderboardEntrySchema.safeParse({ ...validEntry, holesComplete: 19 }).success).toBe(false);
  });

  it('accepts holesComplete of 0', () => {
    expect(LeaderboardEntrySchema.safeParse({ ...validEntry, holesComplete: 0 }).success).toBe(true);
  });

  it('accepts negative toPar (under par scores)', () => {
    expect(LeaderboardEntrySchema.safeParse({ ...validEntry, toPar: -12 }).success).toBe(true);
  });

  it('accepts positive toPar (over par scores)', () => {
    expect(LeaderboardEntrySchema.safeParse({ ...validEntry, toPar: 5 }).success).toBe(true);
  });

  it('accepts toPar of 0 (even par)', () => {
    expect(LeaderboardEntrySchema.safeParse({ ...validEntry, toPar: 0 }).success).toBe(true);
  });

  it('rejects non-integer rank', () => {
    expect(LeaderboardEntrySchema.safeParse({ ...validEntry, rank: 1.5 }).success).toBe(false);
  });
});

// ── LeaderboardSchema ───────────────────────────────────────────────────────

describe('LeaderboardSchema', () => {
  const entry = {
    rank: 1, teamId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    teamName: 'Team Alpha', toPar: -2, grossTotal: 70,
    holesComplete: 18, isComplete: true, sponsorBadge: null,
  };

  it('accepts an empty array', () => {
    expect(LeaderboardSchema.safeParse([]).success).toBe(true);
  });

  it('accepts an array of valid entries', () => {
    const board = [entry, { ...entry, rank: 2, toPar: 0, teamName: 'Team Beta' }];
    expect(LeaderboardSchema.safeParse(board).success).toBe(true);
  });

  it('rejects an array containing an invalid entry', () => {
    const bad = { ...entry, rank: -1 };
    expect(LeaderboardSchema.safeParse([entry, bad]).success).toBe(false);
  });

  it('rejects a non-array value', () => {
    expect(LeaderboardSchema.safeParse(entry).success).toBe(false);
  });
});
