import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { registerPushToken } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
  }),
});

/**
 * How a registration attempt ended. "declined" and "unsupported" are normal;
 * "failed" means this golfer will get NO outbid alerts, which used to be
 * indistinguishable from a declined prompt because the caller swallowed every
 * error (problemList D5).
 */
export type PushRegistration = 'registered' | 'declined' | 'unsupported' | 'failed';

/**
 * The EAS project id Expo's push service needs. `eas init` writes it to
 * app.json as extra.eas.projectId, and EAS Build also injects easConfig. With
 * neither, getExpoPushTokenAsync throws ERR_NOTIFICATIONS_NO_EXPERIENCE_ID deep
 * inside Expo; resolving it here turns that into a clear, named failure.
 */
export function resolveEasProjectId(): string | null {
  const fromEas   = Constants.easConfig?.projectId;
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return fromEas || fromExtra || null;
}

/**
 * Requests notification permission and registers the Expo push token with the
 * server. Called once after a golfer successfully joins an event. NEVER throws:
 * it resolves to an outcome, and logs when the outcome is "failed".
 *
 * Android requires a notification channel for foreground notifications.
 * iOS requires explicit permission grant.
 */
export async function registerForPushNotifications(
  playerId: string,
  sessionToken: string,
): Promise<PushRegistration> {
  // Web has no push by design: no VAPID key or service worker, and the server
  // sends through Expo's APNs/FCM service. Web golfers get in-app notify() and
  // live SignalR instead (problemList D5, "WEB MODE GETS NO PUSH").
  if (Platform.OS === 'web') return 'unsupported';

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('gfp-default', {
        name:       'Golf Fundraiser Pro',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#27ae60',
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return 'declined';

    const projectId = resolveEasProjectId();
    if (!projectId) {
      throw new Error('no EAS projectId in this build (app.json extra.eas.projectId) — run `eas init`');
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await registerPushToken(playerId, token, sessionToken);
    return 'registered';
  } catch (e) {
    // Visible in device logs (adb logcat / Xcode console) and in dev. Infra
    // failures must not look like a golfer who said no.
    console.warn(`[push] registration failed; this golfer will get no outbid alerts: ${
      e instanceof Error ? e.message : String(e)}`);
    return 'failed';
  }
}
