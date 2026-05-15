import { useAuthStore } from './authStore';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';

export function resolveUrl(url: string): string {
  return url.startsWith('/') ? `${BASE}${url}` : url;
}

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
  logoUrl: string | null; themeJson: string | null;
  missionStatement: string | null; is501c3: boolean;
  offlineMode: boolean;
}

export interface JoinEventResponse {
  event:     EventCacheDto;
  team:      TeamCacheDto;
  player:    PlayerCacheDto;
  org:       OrgCacheDto;
  course:    CourseCacheDto | null;
  sponsors:  SponsorCacheDto[];
  leagueId?: string;
  seasonId?: string;
  memberId?: string;
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

export interface ActiveEventSummary {
  id:          string;
  name:        string;
  eventCode:   string;
  format:      string;
  status:      string;
  startAt:     string | null;
  orgName:     string;
  courseName:  string | null;
  courseCity:  string | null;
  courseState: string | null;
  logoUrl:     string | null;
}

export async function fetchActiveEvents(): Promise<ActiveEventSummary[]> {
  try {
    const res = await fetch(`${BASE}/api/v1/pub/events/active`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
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

export async function fetchEventStatus(eventCode: string): Promise<string> {
  const res = await fetch(`${BASE}/api/v1/pub/events/${eventCode}`);
  if (!res.ok) throw new Error(`Status check failed (${res.status})`);
  const data = await res.json();
  return data.status as string;
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

export async function registerPushToken(playerId: string, token: string | null): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/players/${playerId}/push-token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ token }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Push token registration failed (${res.status})`);
  }
}

// ── HOLE CHALLENGES (public, no auth) ────────────────────────────────────────

export interface ChallengeCacheDto {
  id:               string;
  holeNumber:       number | null;
  challengeType:    string;
  description:      string;
  prizeDescription: string | null;
  sponsorName:      string | null;
  sponsorLogoUrl:   string | null;
}

export async function fetchPublicChallenges(eventCode: string): Promise<ChallengeCacheDto[]> {
  try {
    const res = await fetch(`${BASE}/api/v1/pub/events/${eventCode}/challenges`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.challenges ?? []) as ChallengeCacheDto[];
  } catch {
    return [];
  }
}

// ── PHASE 4: AUCTION ──────────────────────────────────────────────────────────

export interface AuctionItemDto {
  id: string;
  eventId: string;
  title: string;
  description: string;
  photoUrls: string[];
  auctionType: string;
  status: string;
  startingBidCents: number;
  bidIncrementCents: number;
  buyNowPriceCents: number | null;
  currentHighBidCents: number;
  closesAt: string | null;
  maxExtensionMin: number;
  donationDenominations: number[] | null;
  minimumBidCents: number | null;
  fairMarketValueCents: number;
  goalCents: number | null;
  totalRaisedCents: number;
}

export interface BidResponse {
  id: string;
  auctionItemId: string;
  playerId: string;
  amountCents: number;
  placedAt: string;
  isWinning: boolean;
  newClosesAt: string | null;
}

export interface AuctionSessionDto {
  id: string;
  eventId: string;
  isActive: boolean;
  currentItemId: string | null;
  currentCalledAmountCents: number;
  startedAt: string;
  endedAt: string | null;
}

export interface PlayerBidHistoryItem {
  auctionItemId: string;
  itemTitle: string;
  amountCents: number;
  status: string;
  placedAt: string;
}

export async function fetchAuctionItems(eventId: string): Promise<AuctionItemDto[]> {
  const res = await fetch(`${BASE}/api/v1/events/${eventId}/auction/items/public`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Auction items fetch failed (${res.status})`);
  }
  return res.json();
}

export async function placeBid(
  itemId: string,
  playerId: string,
  amountCents: number,
): Promise<BidResponse> {
  const res = await fetch(`${BASE}/api/v1/auction/items/${itemId}/bid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, amountCents }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Bid failed (${res.status})`);
  }
  return res.json();
}

export async function pledge(
  itemId: string,
  playerId: string,
  amountCents: number,
): Promise<BidResponse> {
  const res = await fetch(`${BASE}/api/v1/auction/items/${itemId}/pledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, amountCents }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Pledge failed (${res.status})`);
  }
  return res.json();
}

export async function createSetupIntent(playerId: string): Promise<{ clientSecret: string }> {
  const res = await fetch(`${BASE}/api/v1/payments/setup-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Setup intent failed (${res.status})`);
  }
  return res.json();
}

export async function confirmSetup(
  playerId: string,
  setupIntentId: string,
): Promise<{ hasPaymentMethod: boolean }> {
  const res = await fetch(`${BASE}/api/v1/payments/confirm-setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, setupIntentId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Confirm setup failed (${res.status})`);
  }
  return res.json();
}

export async function fetchPlayerBidHistory(playerId: string): Promise<PlayerBidHistoryItem[]> {
  const res = await fetch(`${BASE}/api/v1/players/${playerId}/bids`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Bid history fetch failed (${res.status})`);
  }
  return res.json();
}

export async function fetchActiveAuctionSession(eventId: string): Promise<AuctionSessionDto | null> {
  const res = await fetch(`${BASE}/api/v1/events/${eventId}/auction/sessions/active`);
  if (res.status === 204) return null;
  if (!res.ok) return null;
  return res.json();
}

// ── PHASE 5: LEAGUE ───────────────────────────────────────────────────────────

export interface MemberSeasonSummary {
  memberId:      string;
  name:          string;
  handicapIndex: number;
  flightName:    string;
  rank:          number;
  totalPoints:   number;
  roundsPlayed:  number;
  handicapTrend: HandicapTrendRow[];
  roundHistory:  RoundResultRow[];
}

export interface HandicapTrendRow {
  id: string; roundId: string | null; roundDate: string | null;
  oldIndex: number; newIndex: number; differential: number;
  adminOverride: boolean; reason: string | null; createdAt: string;
}

export interface RoundResultRow {
  roundId:          string;
  roundDate:        string;
  grossTotal:       number;
  netTotal:         number;
  stablefordPoints: number;
  differential:     number;
}

export async function fetchMemberSeasonSummary(
  leagueId: string,
  seasonId: string,
  memberId: string,
): Promise<MemberSeasonSummary | null> {
  const res = await fetch(
    `${BASE}/api/v1/leagues/${leagueId}/seasons/${seasonId}/members/${memberId}/summary`,
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Summary fetch failed (${res.status})`);
  }
  return res.json();
}

// ── REGISTRATION ─────────────────────────────────────────────────────────────

export interface PlayerInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  handicapIndex?: number;
}

export interface RegistrationConfirmResponse {
  team: {
    id: string;
    name: string;
    captainPlayerId: string | null;
    maxPlayers: number;
    inviteToken: string | null;
    inviteExpiresAt: string | null;
  };
  player: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    registrationType: string;
  };
  inviteLink: string | null;
}

export async function registerTeam(
  eventId: string,
  teamName: string,
  players: PlayerInput[],
): Promise<RegistrationConfirmResponse> {
  const res = await fetch(`${BASE}/api/v1/events/${eventId}/register/team`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamName, players }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Registration failed (${res.status})`);
  }
  return res.json();
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
