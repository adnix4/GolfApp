import { describe, it, expect, vi, afterEach } from 'vitest';
import { notify, registerDialogHost } from '../lib/notify';

afterEach(() => registerDialogHost(null));

describe('notify → themed dialog host', () => {
  it('hands every dialog, with its highlight, to the mounted host', () => {
    const host = vi.fn();
    registerDialogHost(host);
    const buttons = [{ text: 'Cancel', style: 'cancel' as const }, { text: 'Bid' }];

    notify('Confirm your bid', 'Bid $60 on "Signed Flag"?', buttons, { highlight: 'Signed Flag' });

    expect(host).toHaveBeenCalledWith({
      title: 'Confirm your bid', message: 'Bid $60 on "Signed Flag"?', buttons, highlight: 'Signed Flag',
    });
  });

  it('stops routing once the host unregisters', () => {
    const host = vi.fn();
    registerDialogHost(host);
    registerDialogHost(null);
    // No host: falls back to the platform dialog (the RN mock has no Alert), so
    // just assert the old host is no longer called.
    try { notify('Hi'); } catch { /* fallback unavailable in the node mock */ }
    expect(host).not.toHaveBeenCalled();
  });
});
