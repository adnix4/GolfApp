import * as Notifications from 'expo-notifications';
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
 * Requests notification permission and registers the Expo push token
 * with the server. Called once after a golfer successfully joins an event.
 *
 * Android requires a notification channel for foreground notifications.
 * iOS requires explicit permission grant.
 */
export async function registerForPushNotifications(playerId: string): Promise<void> {
  // Android requires a channel
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

  if (finalStatus !== 'granted') return; // player declined

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  await registerPushToken(playerId, token);
}
