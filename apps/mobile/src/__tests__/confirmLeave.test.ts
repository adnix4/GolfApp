import { describe, it, expect, vi, beforeEach } from 'vitest';

const notify = vi.fn();
vi.mock('../lib/notify', () => ({ notify: (...args: unknown[]) => notify(...args) }));

import { confirmLeaveEvent, leaveEventMessage, unsyncedHoleCount } from '../lib/confirmLeave';

beforeEach(() => notify.mockReset());

describe('unsyncedHoleCount', () => {
  it('counts completed holes the server has not confirmed', () => {
    expect(unsyncedHoleCount(new Set([1, 2, 3, 4]), new Set([1, 2]))).toBe(2);
    expect(unsyncedHoleCount(new Set([1, 2]), new Set([1, 2]))).toBe(0);
    expect(unsyncedHoleCount(new Set(), new Set())).toBe(0);
  });
});

describe('leaveEventMessage', () => {
  it('warns about unsynced scores, singular and plural', () => {
    expect(leaveEventMessage(1)).toMatch(/^Scores for 1 hole haven't synced/);
    expect(leaveEventMessage(3)).toMatch(/^Scores for 3 holes haven't synced/);
  });

  it('explains how to come back when nothing would be lost', () => {
    expect(leaveEventMessage(0)).toBe('You can rejoin later with your event code and email.');
  });
});

describe('confirmLeaveEvent', () => {
  it('asks before leaving and only leaves on the destructive choice', () => {
    const onLeave = vi.fn();
    confirmLeaveEvent(onLeave, 2);

    expect(onLeave).not.toHaveBeenCalled();
    const [title, message, buttons] = notify.mock.calls[0] as [string, string, { text: string; style?: string; onPress?: () => void }[]];
    expect(title).toBe('Leave this event?');
    expect(message).toMatch(/2 holes/);

    const stay  = buttons.find(b => b.style === 'cancel')!;
    const leave = buttons.find(b => b.style === 'destructive')!;
    expect(stay.text).toBe('Stay');
    stay.onPress?.();
    expect(onLeave).not.toHaveBeenCalled();

    leave.onPress?.();
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
