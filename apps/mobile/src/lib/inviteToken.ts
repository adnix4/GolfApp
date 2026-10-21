// Pulls a team invite token out of whatever the golfer pasted: the captain's
// shared link (…/join?token=…), the web event page's link (…?invite=…), or the
// bare token. Tokens are base64url(payload).base64url(signature) — see
// apps/api/Features/Teams/InviteTokenHelper.cs.

const TOKEN_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function parseInviteToken(input: string): string | null {
  const text = input.trim();
  if (!text) return null;

  if (TOKEN_RE.test(text)) return text;

  const query = text.match(/[?&](?:token|invite)=([^&#\s]+)/);
  if (!query) return null;

  let token: string;
  try { token = decodeURIComponent(query[1]); } catch { return null; }
  return TOKEN_RE.test(token) ? token : null;
}
