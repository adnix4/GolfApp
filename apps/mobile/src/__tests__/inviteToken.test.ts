import { describe, it, expect } from 'vitest';
import { parseInviteToken } from '../lib/inviteToken';

const TOKEN = 'YWJjMTIzOjE3OTk5OTk5OTk.Zm9vYmFyX2Jhei1xdXV4';

describe('parseInviteToken', () => {
  it('accepts the bare token', () => {
    expect(parseInviteToken(TOKEN)).toBe(TOKEN);
  });

  it("reads token= from the captain's shared link", () => {
    expect(parseInviteToken(`https://golffundraiser.pro/e/acme/7NY5BKCG/join?token=${TOKEN}`)).toBe(TOKEN);
  });

  it("reads invite= from the web event page's link, ignoring the hash", () => {
    expect(parseInviteToken(`http://localhost:3000/e/acme/7NY5BKCG?invite=${TOKEN}#register`)).toBe(TOKEN);
  });

  it('decodes a URL-encoded token and finds it among other params', () => {
    expect(parseInviteToken(`https://x.test/join?utm=sms&token=${encodeURIComponent(TOKEN)}&b=1`)).toBe(TOKEN);
  });

  it('trims whitespace and newlines from a paste', () => {
    expect(parseInviteToken(`  ${TOKEN}\n`)).toBe(TOKEN);
  });

  it('rejects junk, empty input, and links without a token', () => {
    expect(parseInviteToken('')).toBeNull();
    expect(parseInviteToken('   ')).toBeNull();
    expect(parseInviteToken('hello there')).toBeNull();
    expect(parseInviteToken('https://golffundraiser.pro/e/acme/7NY5BKCG')).toBeNull();
    expect(parseInviteToken('https://x.test/join?token=not a token')).toBeNull();
  });
});
