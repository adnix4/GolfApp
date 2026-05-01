import { describe, it, expect } from 'vitest';
import { decodeQrPayload } from '../lib/qrUtils';

// Helper: create a valid base64 QR payload matching the mobile scorecard format
function makePayload(overrides: Record<string, unknown> = {}): string {
  const data = {
    tid: 'team-uuid-123',
    tn:  'Eagles',
    ec:  'ABCD1234',
    scores: [4, 3, 5],   // 3 holes
    ts:  1_700_000_000,
    ...overrides,
  };
  return btoa(JSON.stringify(data));
}

describe('decodeQrPayload', () => {
  // ── Happy path ────────────────────────────────────────────────────────────

  it('decodes a valid payload', () => {
    const result = decodeQrPayload(makePayload());
    expect(result).not.toBeNull();
    expect(result!.teamId).toBe('team-uuid-123');
    expect(result!.teamName).toBe('Eagles');
    expect(result!.eventCode).toBe('ABCD1234');
    expect(result!.holeCount).toBe(3);
    expect(result!.ts).toBe(1_700_000_000);
  });

  it('trims leading and trailing whitespace from the raw input', () => {
    const result = decodeQrPayload('  ' + makePayload() + '  ');
    expect(result).not.toBeNull();
    expect(result!.teamId).toBe('team-uuid-123');
  });

  it('falls back to teamId when tn (teamName) is missing', () => {
    const raw = makePayload({ tn: undefined });
    const result = decodeQrPayload(raw);
    expect(result!.teamName).toBe('team-uuid-123');
  });

  it('sets ts to 0 when timestamp is not included', () => {
    const raw = makePayload({ ts: undefined });
    const result = decodeQrPayload(raw);
    expect(result!.ts).toBe(0);
  });

  it('includes part and total when present (multi-part QR)', () => {
    const raw = makePayload({ part: 2, total: 3 });
    const result = decodeQrPayload(raw);
    expect(result!.part).toBe(2);
    expect(result!.total).toBe(3);
  });

  it('leaves part and total undefined when not in payload', () => {
    const result = decodeQrPayload(makePayload());
    expect(result!.part).toBeUndefined();
    expect(result!.total).toBeUndefined();
  });

  it('counts the correct number of holes from the scores array', () => {
    const tenHoles = Array(10).fill(4);
    const result = decodeQrPayload(makePayload({ scores: tenHoles }));
    expect(result!.holeCount).toBe(10);
  });

  // ── Missing required fields → null ────────────────────────────────────────

  it('returns null when tid (teamId) is missing', () => {
    expect(decodeQrPayload(makePayload({ tid: undefined }))).toBeNull();
  });

  it('returns null when ec (eventCode) is missing', () => {
    expect(decodeQrPayload(makePayload({ ec: undefined }))).toBeNull();
  });

  it('returns null when scores is missing', () => {
    expect(decodeQrPayload(makePayload({ scores: undefined }))).toBeNull();
  });

  it('returns null when scores is not an array', () => {
    expect(decodeQrPayload(makePayload({ scores: 'not-an-array' }))).toBeNull();
  });

  // ── Malformed input → null ────────────────────────────────────────────────

  it('returns null for a completely invalid string', () => {
    expect(decodeQrPayload('NOTVALIDBASE64!!!!')).toBeNull();
  });

  it('returns null for a valid base64 that is not JSON', () => {
    expect(decodeQrPayload(btoa('hello world'))).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(decodeQrPayload('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(decodeQrPayload('   ')).toBeNull();
  });
});
