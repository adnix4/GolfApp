import { describe, it, expect } from 'vitest';
import {
  EVENT_STATUS_COLOR, EVENT_STATUS_LABEL, NEXT_TRANSITIONS,
  eventStatusColor, eventStatusLabel,
  scoringGate, scoringGateHint, openScoringEarlyCopy,
} from '../lib/eventStatus';

describe('event status palette', () => {
  it('defines a color for every status in the state machine', () => {
    const required = ['Draft', 'Registration', 'Active', 'Scoring', 'Completed', 'Cancelled'];
    for (const s of required) {
      expect(EVENT_STATUS_COLOR[s]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(EVENT_STATUS_LABEL[s]).toBeDefined();
    }
  });

  it('eventStatusColor falls back gracefully for unknown statuses', () => {
    expect(eventStatusColor('NotARealStatus')).toBe('#aaa');
  });

  it('eventStatusLabel returns the raw value for unknown statuses', () => {
    expect(eventStatusLabel('SomethingNew')).toBe('SomethingNew');
  });

  it('only exposes forward transitions for non-terminal mid-flow statuses', () => {
    expect(NEXT_TRANSITIONS.Draft).toBeUndefined();        // advanced via separate flow
    expect(NEXT_TRANSITIONS.Completed).toBeUndefined();    // terminal
    expect(NEXT_TRANSITIONS.Cancelled).toBeUndefined();    // terminal
    expect(NEXT_TRANSITIONS.Registration?.[0]?.status).toBe('Active');
    expect(NEXT_TRANSITIONS.Active?.[0]?.status).toBe('Scoring');
    expect(NEXT_TRANSITIONS.Scoring?.[0]?.status).toBe('Completed');
  });
});

// Opening scoring before the field has checked in means golfers score before the
// desk has seen them — and since check-in also waives the auction's saved-card
// requirement, an early flip leaves cardless golfers unable to bid.
describe('scoringGate', () => {
  it('is ready once every team is checked in', () => {
    const g = scoringGate({ teamsRegistered: 5, teamsCheckedIn: 5 });
    expect(g).toEqual({ ready: true, outstanding: 0, total: 5 });
  });

  it('is not ready while any team is outstanding', () => {
    const g = scoringGate({ teamsRegistered: 5, teamsCheckedIn: 3 });
    expect(g).toEqual({ ready: false, outstanding: 2, total: 5 });
  });

  it('is not ready with no teams — there is nothing to score', () => {
    expect(scoringGate({ teamsRegistered: 0, teamsCheckedIn: 0 }).ready).toBe(false);
  });

  it('clamps a checked-in count above the registered count', () => {
    // Guests are team-less and excluded from both counts by design, but never
    // let a bad count produce a negative "outstanding".
    const g = scoringGate({ teamsRegistered: 3, teamsCheckedIn: 9 });
    expect(g).toEqual({ ready: true, outstanding: 0, total: 3 });
  });

  it('ignores negative inputs rather than reporting nonsense', () => {
    expect(scoringGate({ teamsRegistered: -2, teamsCheckedIn: -5 }))
      .toEqual({ ready: false, outstanding: 0, total: 0 });
  });
});

describe('scoringGateHint', () => {
  it('names how many teams are outstanding', () => {
    expect(scoringGateHint(scoringGate({ teamsRegistered: 5, teamsCheckedIn: 3 })))
      .toBe('2 of 5 teams still need check-in');
  });

  it('singularizes a one-team event', () => {
    expect(scoringGateHint(scoringGate({ teamsRegistered: 1, teamsCheckedIn: 0 })))
      .toBe('1 of 1 team still need check-in');
  });

  it('explains an empty event instead of saying 0 of 0', () => {
    expect(scoringGateHint(scoringGate({ teamsRegistered: 0, teamsCheckedIn: 0 })))
      .toBe('No teams are registered yet.');
  });
});

// The override exists so one no-show foursome cannot strand the round.
describe('openScoringEarlyCopy', () => {
  it('lists the teams that are not checked in', () => {
    const c = openScoringEarlyCopy(['Sleepers', 'peter Klom']);
    expect(c.confirmText).toBe('Open Scoring');
    expect(c.message).toContain('• Sleepers');
    expect(c.message).toContain('• peter Klom');
  });

  it('reassures that late teams can still be checked in afterwards', () => {
    // Check-in stays open through Scoring, so this promise is real.
    expect(openScoringEarlyCopy(['A']).message)
      .toContain('check them in after');
  });

  it('degrades gracefully when the list is empty', () => {
    expect(openScoringEarlyCopy([]).message).toContain('(none)');
  });
});
