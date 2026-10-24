import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Platform } from 'react-native';

const { selectionAsync, notificationAsync } = vi.hoisted(() => ({
  selectionAsync:    vi.fn(),
  notificationAsync: vi.fn(),
}));
vi.mock('expo-haptics', () => ({
  selectionAsync,
  notificationAsync,
  NotificationFeedbackType: { Success: 'success' },
}));

import { tickHaptic, holeCompleteHaptic } from '../lib/haptics';

beforeEach(() => {
  vi.clearAllMocks();
  selectionAsync.mockResolvedValue(undefined);
  notificationAsync.mockResolvedValue(undefined);
  (Platform as { OS: string }).OS = 'ios';
});

describe('score-entry haptics', () => {
  it('ticks a selection haptic for a stepper change', () => {
    tickHaptic();
    expect(selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('plays one success notification when a hole is completed', () => {
    holeCompleteHaptic();
    expect(notificationAsync).toHaveBeenCalledWith('success');
  });

  it('does nothing on web', () => {
    (Platform as { OS: string }).OS = 'web';
    tickHaptic();
    holeCompleteHaptic();
    expect(selectionAsync).not.toHaveBeenCalled();
    expect(notificationAsync).not.toHaveBeenCalled();
  });

  it('swallows a rejected haptic (unsupported hardware)', async () => {
    selectionAsync.mockRejectedValueOnce(new Error('unavailable'));
    expect(() => tickHaptic()).not.toThrow();
    await Promise.resolve();
  });
});
