import AsyncStorage from '@react-native-async-storage/async-storage';
import type { JoinEventResponse, PendingScore } from './api';

const KEYS = {
  deviceId:  'gfp:deviceId',
  session:   'gfp:session',
  scores:    (eventId: string, teamId: string) => `gfp:scores:${eventId}:${teamId}`,
};

export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(KEYS.deviceId);
  if (!id) {
    id = `mob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await AsyncStorage.setItem(KEYS.deviceId, id);
  }
  return id;
}

export async function saveSession(data: JoinEventResponse): Promise<void> {
  await AsyncStorage.setItem(KEYS.session, JSON.stringify(data));
}

export async function loadSession(): Promise<JoinEventResponse | null> {
  const raw = await AsyncStorage.getItem(KEYS.session);
  return raw ? JSON.parse(raw) : null;
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.session);
}

export async function savePendingScores(
  eventId: string,
  teamId: string,
  scores: PendingScore[],
): Promise<void> {
  await AsyncStorage.setItem(KEYS.scores(eventId, teamId), JSON.stringify(scores));
}

export async function loadPendingScores(
  eventId: string,
  teamId: string,
): Promise<PendingScore[]> {
  const raw = await AsyncStorage.getItem(KEYS.scores(eventId, teamId));
  return raw ? JSON.parse(raw) : [];
}

export async function clearPendingScores(
  eventId: string,
  teamId: string,
): Promise<void> {
  await AsyncStorage.removeItem(KEYS.scores(eventId, teamId));
}
