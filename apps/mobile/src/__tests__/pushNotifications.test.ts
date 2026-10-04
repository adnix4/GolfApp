import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Platform } from 'react-native';

// vi.mock factories are hoisted above imports, so shared state lives in vi.hoisted.
const h = vi.hoisted(() => ({
  perm:         'granted' as string,
  askResult:    'granted' as string,
  tokenError:   null as Error | null,
  easConfig:    { projectId: 'eas-123' } as { projectId?: string } | null,
  extra:        undefined as unknown,
  registerFail: null as Error | null,
  register:     vi.fn(),
  getToken:     vi.fn(),
}));

vi.mock('expo-notifications', () => ({
  setNotificationHandler:       () => {},
  setNotificationChannelAsync:  async () => {},
  AndroidImportance:            { HIGH: 4 },
  getPermissionsAsync:          async () => ({ status: h.perm }),
  requestPermissionsAsync:      async () => ({ status: h.askResult }),
  getExpoPushTokenAsync:        async (opts: unknown) => {
    h.getToken(opts);
    if (h.tokenError) throw h.tokenError;
    return { data: 'ExponentPushToken[abc]' };
  },
}));
vi.mock('expo-constants', () => ({
  default: {
    get easConfig()   { return h.easConfig; },
    get expoConfig()  { return { extra: h.extra }; },
  },
}));
vi.mock('../lib/api', () => ({
  registerPushToken: async (...args: unknown[]) => {
    h.register(...args);
    if (h.registerFail) throw h.registerFail;
  },
}));

import { registerForPushNotifications, resolveEasProjectId } from '../lib/pushNotifications';

beforeEach(() => {
  (Platform as { OS: string }).OS = 'ios';
  h.perm = 'granted'; h.askResult = 'granted'; h.tokenError = null; h.registerFail = null;
  h.easConfig = { projectId: 'eas-123' }; h.extra = undefined;
  h.register.mockClear(); h.getToken.mockClear();
});

describe('resolveEasProjectId', () => {
  it('prefers the EAS Build config, then app.json extra.eas.projectId', () => {
    expect(resolveEasProjectId()).toBe('eas-123');
    h.easConfig = null; h.extra = { eas: { projectId: 'from-app-json' } };
    expect(resolveEasProjectId()).toBe('from-app-json');
  });

  it('is null when neither is present (no `eas init` yet)', () => {
    h.easConfig = null;
    expect(resolveEasProjectId()).toBeNull();
  });
});

describe('registerForPushNotifications', () => {
  it('registers the token with the golfer\'s session and passes the project id explicitly', async () => {
    expect(await registerForPushNotifications('pl1', 'sess-1')).toBe('registered');
    expect(h.getToken).toHaveBeenCalledWith({ projectId: 'eas-123' });
    expect(h.register).toHaveBeenCalledWith('pl1', 'ExponentPushToken[abc]', 'sess-1');
  });

  it('asks for permission when not yet granted', async () => {
    h.perm = 'undetermined'; h.askResult = 'granted';
    expect(await registerForPushNotifications('pl1', 'sess-1')).toBe('registered');
  });

  it('reports a declined prompt as declined, not as a failure, and logs nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.perm = 'denied'; h.askResult = 'denied';
    expect(await registerForPushNotifications('pl1', 'sess-1')).toBe('declined');
    expect(h.register).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('is unsupported on web without touching expo-notifications', async () => {
    (Platform as { OS: string }).OS = 'web';
    expect(await registerForPushNotifications('pl1', 'sess-1')).toBe('unsupported');
    expect(h.getToken).not.toHaveBeenCalled();
  });

  // The D5 failure that used to be silent: no projectId → Expo throws deep down.
  it('fails loudly, by name, when the build has no EAS project id', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.easConfig = null;
    expect(await registerForPushNotifications('pl1', 'sess-1')).toBe('failed');
    expect(h.getToken).not.toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toMatch(/no EAS projectId.*eas init/);
    warn.mockRestore();
  });

  it('never throws: a token or server error resolves to "failed" and is logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.tokenError = new Error('ERR_NOTIFICATIONS_NETWORK_ERROR');
    await expect(registerForPushNotifications('pl1', 'sess-1')).resolves.toBe('failed');
    h.tokenError = null; h.registerFail = new Error('Player not found.');
    await expect(registerForPushNotifications('pl1', 'sess-1')).resolves.toBe('failed');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1][0]).toMatch(/no outbid alerts: Player not found/);
    warn.mockRestore();
  });
});
