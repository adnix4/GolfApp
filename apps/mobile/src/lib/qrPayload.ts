/**
 * The scorecard a golfer hands to the desk as a QR code at the end of the round
 * (problemList D22). The desk scans it on the admin QR Import tab, which posts
 * the text unchanged to POST /events/{id}/scores/qr-collect.
 *
 * Format v1: Base64 (UTF-8) of JSON
 *   { v: 1, ec, tid, tn, did, ts, part?, total?, scores: [{ h, g, p }] }
 *
 * No signature, by design. It used to carry an HMAC, but the key was built
 * from public values (so it stopped nothing), the phone and the API computed
 * it differently (so every import was rejected), and it needed Web Crypto,
 * which React Native's Hermes engine doesn't normally provide. Golfers enter
 * their own scores; the QR only has to carry them reliably, and QR codes have
 * their own error correction. The API still checks the structure.
 *
 * The API reads this exact format: apps/api-tests/Fixtures/qr-payload-v1.txt is
 * produced by this module and imported by the API's tests, so a change on
 * either side fails a test (see __tests__/qrPayload.test.ts).
 */

export interface QrScore {
  h: number;          // hole number
  g: number;          // gross score
  p: number | null;   // putts (null when not tracked)
}

export interface QrPayloadInput {
  eventCode: string;
  teamId:    string;
  teamName:  string;
  deviceId:  string;
  scores:    QrScore[];
  /** Unix seconds; the screen passes "now". */
  ts:        number;
}

/** Above this many JSON characters the card is split across two QR codes. */
export const SPLIT_THRESHOLD = 1200;

function payloadJson(input: QrPayloadInput, scores: QrScore[], part?: number, total?: number): string {
  return JSON.stringify({
    v: 1, ec: input.eventCode, tid: input.teamId, tn: input.teamName, did: input.deviceId,
    ts: input.ts,
    ...(part !== undefined ? { part, total } : {}),
    scores,
  });
}

/** UTF-8 safe base64: team names may have accents. */
export function toBase64(str: string): string {
  const latin1 = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  return (globalThis as { btoa(s: string): string }).btoa(latin1);
}

/**
 * One QR value, or two when the card is too long to scan comfortably as one
 * (each part carries part/total and imports on its own).
 */
export function buildQrPayloads(input: QrPayloadInput, splitThreshold = SPLIT_THRESHOLD): string[] {
  if (payloadJson(input, input.scores).length <= splitThreshold) {
    return [toBase64(payloadJson(input, input.scores))];
  }
  const mid = Math.ceil(input.scores.length / 2);
  return [
    toBase64(payloadJson(input, input.scores.slice(0, mid), 1, 2)),
    toBase64(payloadJson(input, input.scores.slice(mid), 2, 2)),
  ];
}
