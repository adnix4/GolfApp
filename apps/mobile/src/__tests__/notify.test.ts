import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiError } from '@gfp/shared-types';
import { notify, notifyFailure, registerDialogHost } from '../lib/notify';

afterEach(() => registerDialogHost(null));

describe('notify → themed dialog host', () => {
  it('hands the dialog to the host, turning the item shorthand into a highlight', () => {
    const host = vi.fn();
    registerDialogHost(host);
    const buttons = [{ text: 'Cancel', style: 'cancel' as const }, { text: 'Bid' }];

    notify('Confirm your bid', 'Bid $60 on "Signed Flag"?', buttons, { highlight: 'Signed Flag', payment: true });

    expect(host).toHaveBeenCalledWith({
      title: 'Confirm your bid', message: 'Bid $60 on "Signed Flag"?', buttons,
      payment: true, highlights: [{ text: 'Signed Flag', kind: 'item' }],
    });
  });

  it('passes sponsor highlights and dont-show-again through untouched', () => {
    const host = vi.fn();
    registerDialogHost(host);
    notify('Heads up', 'Acme Bank sponsors this hole.', undefined, {
      kind: 'warning', highlights: [{ text: 'Acme Bank', kind: 'sponsor' }], dontShowAgain: { id: 'x' },
    });
    expect(host.mock.calls[0][0]).toMatchObject({
      kind: 'warning', highlights: [{ text: 'Acme Bank', kind: 'sponsor' }], dontShowAgain: { id: 'x' },
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

describe('notifyFailure', () => {
  it('shows plain English as an error, with no code outside dev builds', () => {
    const host = vi.fn();
    registerDialogHost(host);
    notifyFailure('Update Failed', new ApiError(404, 'NOT_FOUND', 'Player not found.'));
    // vitest defines __DEV__ = false, i.e. a production build.
    expect(host.mock.calls[0][0]).toMatchObject({
      title: 'Update Failed', kind: 'error', detailCode: null,
      message: "We couldn't find what you were looking for.",
    });
  });
});
