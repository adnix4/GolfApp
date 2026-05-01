import { useAuthStore } from './authStore';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';

// Reads the in-memory access token and returns an Authorization header when
// one is present. Safe to call from non-React contexts (Zustand .getState()).
function authHeader(): Record<string, string> {
  const token = useAuthStore.getState().accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface PlayerCacheDto  { id: string; firstName: string; lastName: string; email: string; }
export interface HoleCacheDto    { holeNumber: number; par: number; handicapIndex: number; yardageWhite: number | null; yardageBlue: number | null; yardageRed: number | null; sponsorName: string | null; sponsorLogoUrl: string | null; }
export interface CourseCacheDto  { id: string; name: string; city: string; state: string; holes: HoleCacheDto[]; }
export interface SponsorCacheDto { id: string; name: string; logoUrl: string; websiteUrl: string | null; tier: string; holeNumbers: number[]; }
export interface OrgCacheDto     { id: string; name: string; slug: string; logoUrl: string | null; themeJson: string | null; }

export interface TeamCacheDto {
  id: string; name: string;
  startingHole: number | null;
  teeTime: string | null;
  players: PlayerCacheDto[];
}

export interface EventCacheDto {
  id: string; name: string; eventCode: string;
  format: string; startType: string; holes: number;
  status: string; startAt: string | null;
}

export interface JoinEventResponse {
  event:    EventCacheDto;
  team:     TeamCacheDto;
  player:   PlayerCacheDto;
  org:      OrgCacheDto;
  course:   CourseCacheDto | null;
  sponsors: SponsorCacheDto[];
}

export interface SyncConflictDto {
  holeNumber:      number;
  existingScore:   number;
  submittedScore:  number;
  existingDeviceId: string;
}

export interface BatchSyncResponse {
  accepted: number;
  conflicts: number;
  conflictDetails: SyncConflictDto[];
}

export interface PendingScore {
  holeNumber:        number;
  grossScore:        number;
  putts:             number | null;
  playerShots?:      Record<string, number>; // playerId → strokes
  clientTimestampMs: number;
}

export async function joinEvent(
  eventCode: string,
  email: string,
  deviceId: string,
): Promise<JoinEventResponse> {
  const res = await fetch(`${BASE}/api/v1/events/${eventCode}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, deviceId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Join failed (${res.status})`);
  }
  return res.json();
}

export interface PublicLeaderboardEntry {
  rank:          number;
  teamName:      string;
  toPar:         number;
  grossTotal:    number;
  holesComplete: number;
  isComplete:    boolean;
}

export interface PublicLeaderboard {
  eventId:   string;
  eventName: string;
  status:    string;
  standings: PublicLeaderboardEntry[];
}

export async function fetchLeaderboard(eventCode: string): Promise<PublicLeaderboard> {
  const res = await fetch(`${BASE}/api/v1/pub/events/${eventCode}/leaderboard`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Leaderboard fetch failed (${res.status})`);
  }
  return res.json();
}

// Returns true if the API server is reachable within 5 s.
export async function checkConnectivity(): Promise<boolean> {
  return Promise.race<boolean>([
    fetch(`${BASE}/api/v1/pub/events/PING`)
      .then(() => true)
      .catch(() => false),
    new Promise<boolean>(resolve => setTimeout(() => resolve(false), 5000)),
  ]);
}

export async function batchSync(
  eventId: string,
  teamId: string,
  deviceId: string,
  scores: PendingScore[],
): Promise<BatchSyncResponse> {
  const res = await fetch(`${BASE}/api/v1/sync/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({
      eventId,
      teamId,
      deviceId,
      scores: scores.map(s => ({
        holeNumber:        s.holeNumber,
        grossScore:        s.grossScore,
        putts:             s.putts,
        playerShots:       s.playerShots ?? null,
        clientTimestampMs: s.clientTimestampMs,
      })),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Sync failed (${res.status})`);
  }
  return res.json();
}
