import { useAuthStore } from './authStore';
import { getDeviceId } from './store';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';

export function resolveUrl(url: string): string {
  return url.startsWith('/') ? `${BASE}${url}` : url;
}

// ── Device-tagged fetch ────────────────────────────────────────────────────
// Every API call carries X-GFP-Device (the stable install id) so the server's
// rate limiter can give each device its own bucket — without it, all devices
// at a venue share the ONE WiFi NAT IP and a busy tournament throttles itself.
// The id is cached after the first SQLite read; on storage failure we proceed
// without the header (the request still rides the per-IP bucket).
let cachedDeviceId: string | null = null;
async function deviceHeader(): Promise<Record<string, string>> {
  try {
    cachedDeviceId ??= await getDeviceId();
    return { 'X-GFP-Device': cachedDeviceId };
  } catch {
    return {};
  }
}

async function gfpFetch(url: string, init?: RequestInit): Promise<Response> {
  const device = await deviceHeader();
  return fetch(url, {
    ...init,
    headers: { ...device, ...(init?.headers as Record<string, string> | undefined) },
  });
}

// Reads the in-memory access token and returns an Authorization header when
// one is present. Safe to call from non-React contexts (Zustand .getState()).
function authHeader(): Record<string, string> {
  const token = useAuthStore.getState().accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface PlayerCacheDto  { id: string; firstName: string; lastName: string; email: string; hasPaymentMethod: boolean; }
export interface HoleCacheDto    { holeNumber: number; par: number; handicapIndex: number; yardageWhite: number | null; yardageBlue: number | null; yardageRed: number | null; sponsorName: string | null; sponsorLogoUrl: string | null; }
export interface CourseCacheDto  { id: string; name: string; city: string; state: string; holes: HoleCacheDto[]; }
export interface SponsorCacheDto { id: string; name: string; logoUrl: string; websiteUrl: string | null; tagline: string | null; tier: string; holeNumbers: number[]; }
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
  /** Null when awaitingAssignment is true (free agent not yet assigned to a team). */
  team?:     TeamCacheDto;
  player:    PlayerCacheDto;
  org:       OrgCacheDto;
  course:    CourseCacheDto | null;
  sponsors:  SponsorCacheDto[];
  leagueId?: string;
  seasonId?: string;
  memberId?: string;
  /**
   * True when the golfer registered as a free agent and the organizer has not yet
   * assigned them to a team. `team` will be undefined in this case.
   * The join screen shows a "Check Again" button that re-polls until assigned.
   */
  awaitingAssignment?: boolean;
  /**
   * Opaque per-player session token minted by the server at join. Stored in the
   * session and sent back to authorize this player's own actions (profile edit,
   * score sync, auction bids, card setup) — golfers have no password.
   */
  sessionToken: string;
  /**
   * True when the server wants email-ownership proof before joining (A3): a
   * one-time code was just emailed to the registered address and every other
   * field is empty. Check this FIRST, then re-call joinEvent with the code.
   * Devices that already verified once are remembered and skip this.
   */
  verificationRequired?: boolean;
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

export interface PlayerShotBreakdown {
  drive:    number;
  approach: number;
  putt:     number;
}

export interface PendingScore {
  holeNumber:        number;
  grossScore:        number;
  putts:             number | null;
  playerShots?:      Record<string, PlayerShotBreakdown>; // playerId → { drive, approach, putt }
  clientTimestampMs: number;
  /** True when the golfer's value for this hole is awaiting admin approval (server-flagged conflict). */
  conflict?:         boolean;
}

export interface ActiveEventSummary {
  id:               string;
  name:             string;
  eventCode:        string;
  format:           string;
  status:           string;
  startAt:          string | null;
  orgName:          string;
  courseName:       string | null;
  courseCity:       string | null;
  courseState:      string | null;
  logoUrl:          string | null;
  freeAgentEnabled: boolean;
}

export async function fetchActiveEvents(): Promise<ActiveEventSummary[]> {
  try {
    const res = await gfpFetch(`${BASE}/api/v1/pub/events/active`);
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
  // One-time email verification code (A3). Omitted on the first call — the
  // server emails a code and responds verificationRequired; the retry carries
  // the code the golfer typed (or the dev-only test bypass code).
  verificationCode?: string,
): Promise<JoinEventResponse> {
  const res = await gfpFetch(`${BASE}/api/v1/events/${eventCode}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, deviceId, verificationCode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Join failed (${res.status})`);
  }
  return res.json();
}

export interface PublicLeaderboardEntry {
  rank:          number;
  teamId:        string;
  teamName:      string;
  toPar:         number;
  grossTotal:    number;
  holesComplete: number;
  isComplete:    boolean;
  strokesBack:   number;
  bestHole:      number | null;
  bestHoleScore: number | null;
}

export interface PublicLeaderboard {
  eventId:   string;
  eventName: string;
  status:    string;
  standings: PublicLeaderboardEntry[];
}

export async function fetchLeaderboard(eventCode: string): Promise<PublicLeaderboard> {
  const res = await gfpFetch(`${BASE}/api/v1/pub/events/${eventCode}/leaderboard`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Leaderboard fetch failed (${res.status})`);
  }
  return res.json();
}

// ── TEAM SCORECARD PULL (server → device) ────────────────────────────────────
// Lets admin corrections and resolved conflicts flow back to the golfer's
// local scorecard. See store.mergeServerScores for the reconciliation rules.

export interface TeamHoleScore {
  holeNumber:    number;
  grossScore:    number;
  putts:         number | null;
  isConflicted:  boolean;
  proposedScore: number | null;
}

export interface TeamScorecard {
  teamId: string;
  holes:  TeamHoleScore[];
}

/** Returns the authoritative server scores for a team, or null on failure. */
export async function fetchTeamScores(
  eventCode: string,
  teamId:    string,
): Promise<TeamScorecard | null> {
  try {
    const res = await gfpFetch(`${BASE}/api/v1/pub/events/${eventCode}/teams/${teamId}/scorecard`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface EventStatusResult {
  status:    string;
  /** Resolved branding (event value, else org value). Null when unset. */
  themeJson: string | null;
  /** Monotonic sponsor-set version — bumps when sponsors change. */
  sponsorsVersion: number;
}

export async function fetchEventStatus(eventCode: string): Promise<EventStatusResult> {
  // Dedicated polling micro-endpoint — a single-row projection server-side.
  // (The full /pub/events/{code} landing payload loads sponsors/teams/
  // donations and 404s Draft/Cancelled; this one reports every status, so
  // test-mode theme refresh and Completed/Cancelled detection work too.)
  const res = await gfpFetch(`${BASE}/api/v1/pub/events/${eventCode}/status`);
  if (!res.ok) throw new Error(`Status check failed (${res.status})`);
  const data = await res.json();
  return {
    status:    data.status as string,
    themeJson: (data.resolvedThemeJson ?? null) as string | null,
    sponsorsVersion: (data.sponsorsVersion ?? 0) as number,
  };
}

/**
 * Fetches the event's current sponsor list (same shape cached at /join).
 * Called by the scorer after the SponsorsVersion changes so a sponsor added
 * mid-event appears without a rejoin. Returns null on failure so the caller
 * can keep the existing cached list.
 *
 * The optional session auth exists for Draft (test-mode) events: the endpoint
 * 404s anonymously (Draft isn't public), but serves a caller who proves they
 * already joined via the per-player session token — so a test-mode preview
 * still picks up live sponsor edits (problemList S4).
 */
export async function fetchPublicSponsors(
  eventCode: string,
  auth?: { playerId: string; sessionToken: string },
): Promise<SponsorCacheDto[] | null> {
  try {
    const res = await gfpFetch(`${BASE}/api/v1/pub/events/${eventCode}/sponsors`, {
      headers: auth
        ? { 'X-GFP-Player-Id': auth.playerId, 'X-GFP-Session-Token': auth.sessionToken }
        : undefined,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.sponsors ?? []) as SponsorCacheDto[];
  } catch {
    return null;
  }
}

// Returns true if the API server is reachable within 5 s.
// AbortSignal.timeout (standard via expo/fetch, SDK 56) bounds the request AND
// cancels it when the deadline passes — the old Promise.race left the fetch
// running in the background after the timeout won.
export async function checkConnectivity(): Promise<boolean> {
  try {
    await gfpFetch(`${BASE}/api/v1/pub/events/PING`, { signal: AbortSignal.timeout(5000) });
    return true;
  } catch {
    return false;
  }
}

export async function registerPushToken(playerId: string, token: string | null): Promise<void> {
  const res = await gfpFetch(`${BASE}/api/v1/players/${playerId}/push-token`, {
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
    const res = await gfpFetch(`${BASE}/api/v1/pub/events/${eventCode}/challenges`);
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
  const res = await gfpFetch(`${BASE}/api/v1/events/${eventId}/auction/items/public`);
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
  sessionToken: string,
): Promise<BidResponse> {
  const res = await gfpFetch(`${BASE}/api/v1/auction/items/${itemId}/bid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, amountCents, sessionToken }),
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
  sessionToken: string,
): Promise<BidResponse> {
  const res = await gfpFetch(`${BASE}/api/v1/auction/items/${itemId}/pledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, amountCents, sessionToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Pledge failed (${res.status})`);
  }
  return res.json();
}

export async function createSetupIntent(
  playerId: string,
  sessionToken: string,
): Promise<{ clientSecret: string }> {
  const res = await gfpFetch(`${BASE}/api/v1/payments/setup-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, sessionToken }),
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
  sessionToken: string,
): Promise<{ hasPaymentMethod: boolean }> {
  const res = await gfpFetch(`${BASE}/api/v1/payments/confirm-setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, setupIntentId, sessionToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Confirm setup failed (${res.status})`);
  }
  return res.json();
}

/**
 * Tells the API a Stripe entry-fee payment just succeeded so the golfers show
 * as paid immediately (the Stripe webhook is the backstop). The server
 * re-verifies the intent with Stripe, so no session token is needed.
 */
export async function confirmEntryFee(
  paymentIntentId: string,
): Promise<{ recorded: boolean }> {
  const res = await gfpFetch(`${BASE}/api/v1/payments/confirm-entry-fee`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentIntentId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Confirm entry fee failed (${res.status})`);
  }
  return res.json();
}

export async function updateMyProfile(
  playerId: string,
  // Identity proof — the session token minted at join, verified server-side so
  // only the real player can edit their own profile (see UpdateSelfRequest).
  sessionToken: string,
  patch: { firstName?: string; lastName?: string; phone?: string },
): Promise<PlayerCacheDto> {
  const res = await gfpFetch(`${BASE}/api/v1/players/${playerId}/self`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionToken, ...patch }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Profile update failed (${res.status})`);
  }
  return res.json();
}

export async function fetchPlayerBidHistory(playerId: string): Promise<PlayerBidHistoryItem[]> {
  const res = await gfpFetch(`${BASE}/api/v1/players/${playerId}/bids`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Bid history fetch failed (${res.status})`);
  }
  return res.json();
}

export async function fetchActiveAuctionSession(eventId: string): Promise<AuctionSessionDto | null> {
  const res = await gfpFetch(`${BASE}/api/v1/events/${eventId}/auction/sessions/active`);
  if (res.status === 204) return null;
  if (!res.ok) return null;
  return res.json();
}

/** Soft "I'm Bidding" paddle raise — increments the live bidder count. No auth required. */
export async function raiseHand(eventId: string): Promise<void> {
  await gfpFetch(`${BASE}/api/v1/events/${eventId}/auction/sessions/raise-hand`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
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
  const res = await gfpFetch(
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
  /** Stripe PaymentIntent client_secret for in-app entry fee payment. Null when the event is free. */
  entryFeeClientSecret?: string | null;
  /** Total due for this registration in cents (per-golfer fee × golfers registered). */
  entryFeeCents?: number | null;
  /** The per-golfer fee in cents backing the total. */
  entryFeePerPlayerCents?: number | null;
}

export async function registerTeam(
  eventId: string,
  teamName: string,
  players: PlayerInput[],
): Promise<RegistrationConfirmResponse> {
  const res = await gfpFetch(`${BASE}/api/v1/events/${eventId}/register/team`, {
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

export type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Competitive';
export type AgeGroup   = 'Under30'  | 'From30To50'   | 'Over50';

export interface RegisterFreeAgentPayload {
  player:      PlayerInput;
  skillLevel?: SkillLevel;
  ageGroup?:   AgeGroup;
  pairingNote?: string;
}

export async function registerFreeAgent(
  eventId: string,
  payload: RegisterFreeAgentPayload,
): Promise<RegistrationConfirmResponse> {
  const res = await gfpFetch(`${BASE}/api/v1/events/${eventId}/register/free-agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? err.error ?? `Registration failed (${res.status})`);
  }
  return res.json();
}

export async function batchSync(
  eventId: string,
  teamId: string,
  deviceId: string,
  scores: PendingScore[],
  sessionToken: string,
): Promise<BatchSyncResponse> {
  const res = await gfpFetch(`${BASE}/api/v1/sync/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({
      eventId,
      teamId,
      sessionToken,
      deviceId,
      scores: scores.map(s => ({
        holeNumber:        s.holeNumber,
        grossScore:        s.grossScore,
        putts:             s.putts,
        playerShots:       s.playerShots
          ? Object.fromEntries(
              Object.entries(s.playerShots).map(([id, b]) => [id, b.drive + b.approach + b.putt]),
            )
          : null,
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
