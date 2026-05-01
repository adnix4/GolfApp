export interface DecodedQrPayload {
  teamId:    string;
  teamName:  string;
  eventCode: string;
  holeCount: number;
  ts:        number;
  part?:     number;
  total?:    number;
}

/**
 * Decodes a base64-encoded QR payload from the mobile scorecard.
 * Returns null when the payload is malformed or missing required fields.
 */
export function decodeQrPayload(raw: string): DecodedQrPayload | null {
  try {
    const json   = atob(raw.trim());
    const parsed = JSON.parse(json);
    if (!parsed.tid || !parsed.ec || !Array.isArray(parsed.scores)) return null;
    return {
      teamId:    parsed.tid,
      teamName:  parsed.tn ?? parsed.tid,
      eventCode: parsed.ec,
      holeCount: parsed.scores.length,
      ts:        parsed.ts ?? 0,
      part:      parsed.part,
      total:     parsed.total,
    };
  } catch {
    return null;
  }
}
