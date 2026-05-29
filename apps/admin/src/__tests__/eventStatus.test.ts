import { describe, it, expect } from 'vitest';
import {
  EVENT_STATUS_COLOR, EVENT_STATUS_LABEL, NEXT_TRANSITIONS,
  eventStatusColor, eventStatusLabel,
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
