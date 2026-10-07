/// <reference types="node" />  // this test reads/writes the shared fixture file
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildQrPayloads, toBase64, type QrPayloadInput } from '../lib/qrPayload';

// The CONTRACT with the API (problemList D22). This fixture is what this
// module produces for the inputs below, and apps/api-tests imports the same
// file through the real QR import. If the phone's format changes, this test
// fails; if the API stops reading it, the API's test fails. Regenerate only
// for a deliberate format change: UPDATE_QR_FIXTURE=1 npx vitest run qrPayload
const FIXTURE = path.resolve(__dirname, '../../../api-tests/Fixtures/qr-payload-v1.txt');

const CONTRACT_INPUT: QrPayloadInput = {
  eventCode: 'QRTEST01',
  teamId:    '11111111-2222-4333-8444-555555555555',
  teamName:  'Les Aigles Dorés',            // non-ASCII must survive the round trip
  deviceId:  'dev-qr-fixture',
  ts:        1700000000,
  scores: [
    { h: 1, g: 4, p: 2 },
    { h: 2, g: 5, p: null },                 // putts not tracked
    { h: 3, g: 3, p: 1 },
    { h: 4, g: 4, p: 2 },
    { h: 5, g: 6, p: 3 },
    { h: 6, g: 4, p: 2 },
  ],
};
const CONTRACT_THRESHOLD = 200;              // forces the two-part split

// atob + TextDecoder rather than Node's Buffer: the mobile tsconfig has no Node types.
const g = globalThis as unknown as { atob(s: string): string; TextDecoder: new () => { decode(b: Uint8Array): string } };
const utf8 = (b64: string) => new g.TextDecoder().decode(Uint8Array.from(g.atob(b64), c => c.charCodeAt(0)));
const decode = (b64: string) => JSON.parse(utf8(b64));

describe('QR scorecard payload (v1)', () => {
  it('matches the contract fixture the API imports, byte for byte', () => {
    const parts = buildQrPayloads(CONTRACT_INPUT, CONTRACT_THRESHOLD);
    if (process.env.UPDATE_QR_FIXTURE === '1') fs.writeFileSync(FIXTURE, parts.join('\n') + '\n');
    expect(parts.join('\n') + '\n').toBe(fs.readFileSync(FIXTURE, 'utf8').replace(/\r\n/g, '\n'));
  });

  it('carries exactly the fields the API reads, with no signature', () => {
    const [only] = buildQrPayloads(CONTRACT_INPUT);
    const body = decode(only);
    expect(Object.keys(body).sort()).toEqual(['did', 'ec', 'scores', 'tid', 'tn', 'ts', 'v']);
    expect(body).toMatchObject({ v: 1, ec: 'QRTEST01', tn: 'Les Aigles Dorés', ts: 1700000000 });
    expect(body.scores[1]).toEqual({ h: 2, g: 5, p: null });
  });

  it('is one QR for a normal card and two for a long one, with nothing lost', () => {
    expect(buildQrPayloads(CONTRACT_INPUT)).toHaveLength(1);

    const parts = buildQrPayloads(CONTRACT_INPUT, CONTRACT_THRESHOLD).map(decode);
    expect(parts.map(p => [p.part, p.total])).toEqual([[1, 2], [2, 2]]);
    expect(parts.flatMap(p => p.scores.map((s: { h: number }) => s.h))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('encodes UTF-8, not Latin-1, so accented names decode intact', () => {
    expect(utf8(toBase64('Dorés'))).toBe('Dorés');
  });
});
