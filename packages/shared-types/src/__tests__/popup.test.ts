import { describe, it, expect } from 'vitest';
import { ApiError } from '../apiClient';
import { splitHighlights, describeFailure, dismissKey, resolveDontShowAgain } from '../popup';

describe('splitHighlights', () => {
  it('pulls a quoted item out as a chip, dropping the quotes', () => {
    const { parts, standalone } = splitHighlights('Pledge $25.00 to "Junior Golf"?', [{ text: 'Junior Golf', kind: 'item' }]);
    expect(parts).toEqual([
      { text: 'Pledge $25.00 to ', kind: null },
      { text: 'Junior Golf', kind: 'item' },
      { text: '?', kind: null },
    ]);
    expect(standalone).toEqual([]);
  });

  it('marks sponsors and items separately in one message', () => {
    const { parts } = splitHighlights(
      'Hole 7 closest-to-pin is sponsored by Acme Bank. Prize: Signed Flag.',
      [{ text: 'Acme Bank', kind: 'sponsor' }, { text: 'Signed Flag', kind: 'item' }],
    );
    expect(parts.filter(p => p.kind).map(p => [p.text, p.kind])).toEqual([
      ['Acme Bank', 'sponsor'], ['Signed Flag', 'item'],
    ]);
    expect(parts.map(p => p.text).join('')).toBe('Hole 7 closest-to-pin is sponsored by Acme Bank. Prize: Signed Flag.');
  });

  it('prefers the longer name where two overlap', () => {
    const { parts } = splitHighlights('Thanks, Acme Bank Foundation!', [
      { text: 'Acme Bank', kind: 'sponsor' }, { text: 'Acme Bank Foundation', kind: 'sponsor' },
    ]);
    expect(parts.filter(p => p.kind).map(p => p.text)).toEqual(['Acme Bank Foundation']);
  });

  it('returns unmentioned highlights as standalone', () => {
    const { parts, standalone } = splitHighlights('Bid placed!', [{ text: 'Signed Flag', kind: 'item' }]);
    expect(parts).toEqual([{ text: 'Bid placed!', kind: null }]);
    expect(standalone).toEqual([{ text: 'Signed Flag', kind: 'item' }]);
  });

  it('handles empty input', () => {
    expect(splitHighlights('')).toEqual({ parts: [], standalone: [] });
  });
});

describe('describeFailure', () => {
  const prod = { dev: false } as const;
  const dev  = { dev: true } as const;

  it('never shows codes in production', () => {
    for (const status of [400, 401, 403, 404, 409, 500, 503]) {
      const out = describeFailure(new ApiError(status, 'SOME_CODE', 'x'), prod);
      expect(out.code).toBeNull();
      expect(out.message).not.toMatch(/\b\d{3}\b|SOME_CODE/);
    }
  });

  it('adds CODE · HTTP status in dev', () => {
    expect(describeFailure(new ApiError(404, 'NOT_FOUND', 'Event not found.'), dev))
      .toEqual({ message: "We couldn't find what you were looking for.", code: 'NOT_FOUND · HTTP 404' });
  });

  it("keeps the server's plain sentence for validation errors", () => {
    const e = new ApiError(400, 'VALIDATION_ERROR', 'Walk-up registration must be enabled in event settings.');
    expect(describeFailure(e, prod).message).toBe('Walk-up registration must be enabled in event settings.');
  });

  it('uses the generic 400 copy when there is no validation sentence', () => {
    expect(describeFailure(new ApiError(400, 'BAD_REQUEST', ''), prod).message).toMatch(/Check the form/);
  });

  it('collapses 5xx into one server message', () => {
    expect(describeFailure({ status: 502 }, prod).message).toMatch(/server ran into a problem/i);
  });

  it('explains network failures on web and native', () => {
    expect(describeFailure(new TypeError('Failed to fetch'), prod).message).toMatch(/internet connection/);
    const native = describeFailure(new TypeError('Network request failed'), dev);
    expect(native.message).toMatch(/internet connection/);
    expect(native.code).toBe('NETWORK_ERROR');
  });

  it('honours overrides', () => {
    expect(describeFailure({ status: 409 }, { dev: false, overrides: { conflict: 'That league name is taken.' } }).message)
      .toBe('That league name is taken.');
    expect(describeFailure({ status: 403 }, { dev: false, overrides: { byStatus: { 403: 'No access.' } } }).message)
      .toBe('No access.');
  });

  it('falls back to the message, then to a generic line', () => {
    expect(describeFailure(new Error('Card declined.'), prod).message).toBe('Card declined.');
    expect(describeFailure(42, dev)).toEqual({ message: 'Something went wrong. Please try again.', code: 'UNKNOWN_ERROR' });
  });
});

describe('dismissKey', () => {
  it('scopes a warning to one tournament', () => {
    expect(dismissKey('evt-1', 'cardless-checkin')).toBe('gfp:dismissed:evt-1:cardless-checkin');
    expect(dismissKey('evt-2', 'cardless-checkin')).not.toBe(dismissKey('evt-1', 'cardless-checkin'));
  });
});

describe('resolveDontShowAgain', () => {
  const opt = { id: 'cardless-checkin' };

  it('passes the option through for ordinary warnings', () => {
    expect(resolveDontShowAgain({ dontShowAgain: opt }, true)).toBe(opt);
    expect(resolveDontShowAgain({}, true)).toBeUndefined();
  });

  it('refuses it on a payment check: throws in dev, drops it in production', () => {
    expect(() => resolveDontShowAgain({ dontShowAgain: opt, payment: true }, true)).toThrow(/payment/);
    expect(resolveDontShowAgain({ dontShowAgain: opt, payment: true }, false)).toBeUndefined();
  });
});
