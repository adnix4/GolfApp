import { describe, it, expect } from 'vitest';
import { autoAssignHoles, validateShotgunAssignments, type ShotgunTeam } from '../lib/shotgunUtils';

// Fixture teams
const TEAMS: ShotgunTeam[] = [
  { id: 't1', name: 'Eagles' },
  { id: 't2', name: 'Birdies' },
  { id: 't3', name: 'Condors' },
  { id: 't4', name: 'Albatrosses' },
];

// ── autoAssignHoles ───────────────────────────────────────────────────────────

describe('autoAssignHoles', () => {
  it('assigns a hole to every team', () => {
    const result = autoAssignHoles(TEAMS, 18);
    expect(Object.keys(result)).toHaveLength(TEAMS.length);
    TEAMS.forEach(t => expect(result[t.id]).toBeDefined());
  });

  it('assigns in alphabetical order (Albatrosses → hole 1, Birdies → hole 2, …)', () => {
    const result = autoAssignHoles(TEAMS, 18);
    // Alphabetical: Albatrosses, Birdies, Condors, Eagles
    expect(result['t4']).toBe('1'); // Albatrosses
    expect(result['t2']).toBe('2'); // Birdies
    expect(result['t3']).toBe('3'); // Condors
    expect(result['t1']).toBe('4'); // Eagles
  });

  it('wraps around when there are more teams than holes', () => {
    const result = autoAssignHoles(TEAMS, 2);
    const values = Object.values(result).map(Number);
    values.forEach(v => expect(v).toBeGreaterThanOrEqual(1));
    values.forEach(v => expect(v).toBeLessThanOrEqual(2));
    // With 4 teams and 2 holes: each hole should be used twice
    const counts = values.reduce<Record<number, number>>((acc, v) => {
      acc[v] = (acc[v] ?? 0) + 1; return acc;
    }, {});
    expect(counts[1]).toBe(2);
    expect(counts[2]).toBe(2);
  });

  it('returns string values (compatible with TextInput controlled state)', () => {
    const result = autoAssignHoles(TEAMS, 18);
    Object.values(result).forEach(v => expect(typeof v).toBe('string'));
  });

  it('returns an empty object for an empty team list', () => {
    expect(autoAssignHoles([], 18)).toEqual({});
  });

  it('does not mutate the original teams array', () => {
    const original = [...TEAMS];
    autoAssignHoles(TEAMS, 18);
    expect(TEAMS).toEqual(original);
  });

  it('handles a single team', () => {
    const result = autoAssignHoles([{ id: 'x', name: 'Solo' }], 18);
    expect(result['x']).toBe('1');
  });
});

// ── validateShotgunAssignments ────────────────────────────────────────────────

describe('validateShotgunAssignments', () => {
  // ── Valid cases ──────────────────────────────────────────────────────────

  it('returns empty array for a valid unique assignment', () => {
    const assignments = { t1: '4', t2: '2', t3: '3', t4: '1' };
    expect(validateShotgunAssignments(TEAMS, assignments, 18)).toEqual([]);
  });

  it('returns empty array when all assignments are blank (all teams unassigned)', () => {
    const assignments = { t1: '', t2: '', t3: '', t4: '' };
    expect(validateShotgunAssignments(TEAMS, assignments, 18)).toEqual([]);
  });

  it('returns empty array for mixed assigned / unassigned', () => {
    const assignments = { t1: '1', t2: '', t3: '3', t4: '' };
    expect(validateShotgunAssignments(TEAMS, assignments, 18)).toEqual([]);
  });

  it('returns empty array when assignments object is completely empty', () => {
    expect(validateShotgunAssignments(TEAMS, {}, 18)).toEqual([]);
  });

  // ── Out-of-range errors ──────────────────────────────────────────────────

  it('flags a hole number below 1', () => {
    const errors = validateShotgunAssignments(TEAMS, { t1: '0' }, 18);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Eagles');
  });

  it('flags a hole number above totalHoles', () => {
    const errors = validateShotgunAssignments(TEAMS, { t1: '19' }, 18);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Eagles');
    expect(errors[0]).toContain('1–18');
  });

  it('flags hole 10 on a 9-hole course', () => {
    const errors = validateShotgunAssignments(TEAMS, { t1: '10' }, 9);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('1–9');
  });

  it('flags a non-numeric entry', () => {
    const errors = validateShotgunAssignments(TEAMS, { t1: 'abc' }, 18);
    expect(errors.length).toBeGreaterThan(0);
  });

  // ── Duplicate errors ─────────────────────────────────────────────────────

  it('flags when two teams share the same hole', () => {
    const assignments = { t1: '5', t2: '5' };
    const errors = validateShotgunAssignments(TEAMS, assignments, 18);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('Hole 5');
    expect(errors[0]).toContain('Eagles');
    expect(errors[0]).toContain('Birdies');
  });

  it('produces one duplicate error per collision, not one per team', () => {
    // All four teams on hole 1 → 3 collision errors (1vs2, 1vs3, 1vs4)
    const assignments = { t1: '1', t2: '1', t3: '1', t4: '1' };
    const errors = validateShotgunAssignments(TEAMS, assignments, 18);
    expect(errors.length).toBe(3);
  });

  // ── Range message uses totalHoles ────────────────────────────────────────

  it('includes the actual totalHoles in the range error message', () => {
    const errors = validateShotgunAssignments(TEAMS, { t1: '20' }, 18);
    expect(errors[0]).toContain('1–18');
  });

  it('uses 9 in the range message for a 9-hole course', () => {
    const errors = validateShotgunAssignments(TEAMS, { t1: '10' }, 9);
    expect(errors[0]).toContain('1–9');
  });
});
