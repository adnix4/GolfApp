import { describe, it, expect } from 'vitest';
import {
  EVENT_STATUS_COLOR, EVENT_STATUS_LABEL, NEXT_TRANSITIONS,
  eventStatusColor, eventStatusLabel,
  scoringGate, scoringGateHint, openScoringEarlyCopy,
  completionGate, markCompleteCopy, markCompleteUncheckedCopy, cancelEventCopy,
} from '../lib/eventStatus';

/** Builds a leaderboard-shaped row; `thru` below `holes` means unfinished. */
function team(teamName: string, holesComplete: number, holes = 18) {
  return { teamName, holesComplete, isComplete: holesComplete >= holes };
}

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

// Completing closes scoring server-side (ScoreService + MobileService both
// reject anything but Active/Scoring), so a premature flip strands the field.
describe('completionGate', () => {
  it('is ready once every team has finished', () => {
    const g = completionGate([team('Sleepers', 18), team('Bogey Boys', 18)]);
    expect(g).toEqual({ ready: true, unfinished: [], total: 2 });
  });

  it('reports who is still out and how far they got', () => {
    const g = completionGate([team('Sleepers', 18), team('Bogey Boys', 12), team('Slicers', 0)]);
    expect(g.ready).toBe(false);
    expect(g.total).toBe(3);
    expect(g.unfinished).toEqual([
      { name: 'Bogey Boys', thru: 12 },
      { name: 'Slicers',    thru: 0  },
    ]);
  });

  it('trusts the server isComplete flag, so 9-hole events work unchanged', () => {
    expect(completionGate([team('Niners', 9, 9)]).ready).toBe(true);
    expect(completionGate([team('Niners', 8, 9)]).ready).toBe(false);
  });

  it('is not ready with an empty leaderboard — no scores at all is worth a confirm', () => {
    expect(completionGate([])).toEqual({ ready: false, unfinished: [], total: 0 });
  });
});

describe('markCompleteCopy', () => {
  it('names each unfinished team with its hole count', () => {
    const c = markCompleteCopy(completionGate([team('Sleepers', 18), team('peter Klom', 12)]));
    expect(c.title).toBe('End scoring early?');
    expect(c.confirmText).toBe('Mark Complete');
    expect(c.message).toContain('1 of 2 teams has not finished all holes');
    expect(c.message).toContain('• peter Klom — thru 12');
    expect(c.message).not.toContain('Sleepers');
  });

  it('warns that scoring closes, including offline holes, and cannot be undone', () => {
    const c = markCompleteCopy(completionGate([team('A', 3)]));
    expect(c.message).toContain('no longer enter or sync scores');
    expect(c.message).toContain('saved offline on their phones');
    expect(c.message).toContain('cannot be undone');
  });

  it('truncates a long field instead of producing an unreadable dialog', () => {
    const many = Array.from({ length: 14 }, (_, i) => team(`Team ${i + 1}`, 5));
    const c = markCompleteCopy(completionGate(many));
    expect(c.message).toContain('• Team 10 — thru 5');
    expect(c.message).not.toContain('• Team 11 —');
    expect(c.message).toContain('…and 4 more teams');
  });

  it('singularizes the tail for exactly one hidden team', () => {
    const many = Array.from({ length: 11 }, (_, i) => team(`Team ${i + 1}`, 5));
    expect(markCompleteCopy(completionGate(many)).message).toContain('…and 1 more team');
  });

  it('says so plainly when no team has scored at all', () => {
    const c = markCompleteCopy(completionGate([]));
    expect(c.message).toContain('No teams have scored yet.');
    expect(c.message).not.toContain('•');
  });

  it('still confirms when everyone is in, because the status is terminal', () => {
    const c = markCompleteCopy(completionGate([team('A', 18), team('B', 18)]));
    expect(c.title).toBe('Mark event complete?');
    expect(c.message).toContain('All 2 teams have finished');
    expect(c.message).toContain('cannot be undone');
  });

  it('singularizes a one-team finished event', () => {
    expect(markCompleteCopy(completionGate([team('A', 18)])).message)
      .toContain('All 1 team has finished');
  });
});

describe('markCompleteUncheckedCopy', () => {
  it('admits progress is unknown but still offers the confirm', () => {
    // A failed lookup must not lock the organizer out of finishing the event.
    const c = markCompleteUncheckedCopy();
    expect(c.confirmText).toBe('Mark Complete');
    expect(c.message).toContain('Could not check scoring progress');
    expect(c.message).toContain('cannot be undone');
  });
});

describe('cancelEventCopy', () => {
  it('warns that cancelling is terminal', () => {
    const c = cancelEventCopy();
    expect(c.confirmText).toBe('Cancel Event');
    expect(c.message).toContain('cannot be undone');
  });
});
