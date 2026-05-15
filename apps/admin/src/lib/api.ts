import { storage } from './storage';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';

export function resolveUrl(url: string): string {
  return url.startsWith('/') ? `${BASE}${url}` : url;
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface RequestOptions {
  method?:  HttpMethod;
  body?:    unknown;
  public?:  boolean; // skip auth header
}

class ApiError extends Error {
  constructor(
    public status: number,
    public code:   string,
    message:       string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, public: isPublic = false } = opts;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (!isPublic) {
    const token = storage.getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Attempt silent token refresh on 401
  if (res.status === 401 && !isPublic) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${storage.getAccessToken()}`;
      const retry = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (retry.ok) return retry.json() as Promise<T>;
      // Retry returned a non-2xx that isn't 401 — it's a real API error, not an auth issue.
      // Do NOT clear tokens: the session is still valid, the request itself failed.
      if (retry.status !== 401) {
        let code = 'UNKNOWN_ERROR';
        let msg  = `HTTP ${retry.status}`;
        try {
          const e = await retry.json();
          code = e.code ?? code;
          if (e.error) { msg = e.error; }
          else if (e.title) {
            const fe = e.errors ? Object.entries(e.errors as Record<string, string[]>).map(([f, m]) => `${f}: ${(m as string[]).join(', ')}`).join('; ') : null;
            msg = fe ? `${e.title} — ${fe}` : e.title;
          }
        } catch { /* not JSON */ }
        throw new ApiError(retry.status, code, msg);
      }
    }
    // Refresh failed or retry returned 401 — session is gone, force re-login.
    storage.clearTokens();
    throw new ApiError(401, 'UNAUTHORIZED', 'Session expired. Please log in again.');
  }

  if (!res.ok) {
    let code = 'UNKNOWN_ERROR';
    let message = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      code = err.code ?? code;
      if (err.error) {
        message = err.error;
      } else if (err.title) {
        // ASP.NET Core ValidationProblemDetails format
        const fieldErrors = err.errors
          ? Object.entries(err.errors as Record<string, string[]>)
              .map(([f, msgs]) => `${f}: ${(msgs as string[]).join(', ')}`)
              .join('; ')
          : null;
        message = fieldErrors ? `${err.title} — ${fieldErrors}` : err.title;
      }
    } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = storage.getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    storage.setAccessToken(data.accessToken);
    if (data.refreshToken) storage.setRefreshToken(data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

// ── AUTH ──────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; refreshToken: string; orgId: string }>(
      '/api/v1/auth/login',
      { method: 'POST', body: { email, password }, public: true },
    ),

  register: (payload: {
    email: string; password: string; displayName: string;
    orgName: string; orgSlug: string; is501c3?: boolean;
  }) =>
    request<{ accessToken: string; refreshToken: string; orgId: string }>(
      '/api/v1/auth/register',
      { method: 'POST', body: payload, public: true },
    ),

  logout: (refreshToken: string) =>
    request<void>('/api/v1/auth/logout', { method: 'POST', body: { refreshToken } }),
};

// ── EVENTS ────────────────────────────────────────────────────────────────────

export const eventsApi = {
  list: () =>
    request<EventSummary[]>('/api/v1/events'),

  get: (id: string) =>
    request<EventDetail>(`/api/v1/events/${id}`),

  create: (payload: CreateEventPayload) =>
    request<EventDetail>('/api/v1/events', { method: 'POST', body: payload }),

  update: (id: string, payload: Partial<UpdateEventPayload>) =>
    request<EventDetail>(`/api/v1/events/${id}`, { method: 'PATCH', body: payload }),

  attachCourse: (id: string, payload: AttachCoursePayload) =>
    request<EventDetail>(`/api/v1/events/${id}/course`, { method: 'POST', body: payload }),

  assignShotgun: (id: string, assignments: { teamId: string; startingHole: number }[]) =>
    request<void>(`/api/v1/events/${id}/shotgun-assignments`, {
      method: 'POST', body: { assignments },
    }),

  getLeaderboard: (id: string) =>
    request<LeaderboardEntry[]>(`/api/v1/events/${id}/leaderboard`),

  getFundraising: (id: string) =>
    request<FundraisingTotals>(`/api/v1/events/${id}/fundraising`),
};

// ── TEST DATA ─────────────────────────────────────────────────────────────────

export const testDataApi = {
  seed: (eventId: string) =>
    request<TestDataSummary>(`/api/v1/events/${eventId}/test-data/seed`, { method: 'POST' }),

  getSummary: (eventId: string) =>
    request<TestDataSummary>(`/api/v1/events/${eventId}/test-data/summary`),

  clearAll: (eventId: string) =>
    request<TestDataSummary>(`/api/v1/events/${eventId}/test-data`, { method: 'DELETE' }),

  clearRegistration: (eventId: string) =>
    request<TestDataSummary>(`/api/v1/events/${eventId}/test-data/registration`, { method: 'DELETE' }),

  setTestMode: (eventId: string, enabled: boolean) =>
    request<EventDetail>(`/api/v1/events/${eventId}/test-mode`, { method: 'PATCH', body: { enabled } }),
};

// ── EVENT BRANDING ────────────────────────────────────────────────────────────

export interface UpdateEventBrandingPayload {
  logoUrl?: string | null;
  themeJson?: string | null;
  missionStatement?: string | null;
  is501c3?: boolean;
}

export const eventBrandingApi = {
  update: (id: string, payload: UpdateEventBrandingPayload) =>
    request<EventDetail>(`/api/v1/events/${id}/branding`, { method: 'PATCH', body: payload }),

  uploadLogo: async (id: string, file: File): Promise<{ url: string }> => {
    const token   = storage.getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const form = new FormData();
    form.append('file', file);

    const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';
    const res = await fetch(`${BASE_URL}/api/v1/events/${id}/branding/logo`, {
      method: 'POST', headers, body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, 'UPLOAD_FAILED', (err as any).detail ?? 'Logo upload failed.');
    }
    return res.json();
  },
};

// ── TEAMS ─────────────────────────────────────────────────────────────────────

export const teamsApi = {
  list: (eventId: string) =>
    request<Team[]>(`/api/v1/events/${eventId}/teams`),

  get: (eventId: string, teamId: string) =>
    request<Team>(`/api/v1/events/${eventId}/teams/${teamId}`),

  registerTeam: (eventId: string, payload: RegisterTeamPayload) =>
    request<{ team: Team; inviteUrl: string | null; message: string }>(
      `/api/v1/events/${eventId}/register/team`,
      { method: 'POST', body: payload },
    ),

  checkIn: (eventId: string, teamId: string) =>
    request<Team>(`/api/v1/events/${eventId}/teams/${teamId}/check-in`, {
      method: 'POST', body: {},
    }),

  markFeePaid: (eventId: string, teamId: string) =>
    request<Team>(`/api/v1/events/${eventId}/teams/${teamId}/fee-paid`, {
      method: 'POST', body: {},
    }),

  update: (eventId: string, teamId: string, payload: { name?: string; maxPlayers?: number; entryFeePaid?: boolean }) =>
    request<Team>(`/api/v1/events/${eventId}/teams/${teamId}`, { method: 'PATCH', body: payload }),
};

// ── FREE AGENTS ───────────────────────────────────────────────────────────────

export const playersApi = {
  listFreeAgents: (eventId: string) =>
    request<Player[]>(`/api/v1/events/${eventId}/free-agents`),

  assignToTeam: (eventId: string, playerId: string, teamId: string) =>
    request<Team>(`/api/v1/events/${eventId}/free-agents/assign`, {
      method: 'POST', body: { playerId, teamId },
    }),
};

// ── CHALLENGES ────────────────────────────────────────────────────────────────

export const challengesApi = {
  list: (eventId: string) =>
    request<HoleChallenge[]>(`/api/v1/events/${eventId}/challenges`),

  upsert: (eventId: string, holeNumber: number, payload: UpsertChallengePayload) =>
    request<HoleChallenge>(`/api/v1/events/${eventId}/challenges/${holeNumber}`, {
      method: 'PUT', body: payload,
    }),

  remove: (eventId: string, holeNumber: number) =>
    request<void>(`/api/v1/events/${eventId}/challenges/${holeNumber}`, {
      method: 'DELETE',
    }),
};

// ── SCORES ────────────────────────────────────────────────────────────────────

export const scoresApi = {
  getAll: (eventId: string) =>
    request<Score[]>(`/api/v1/events/${eventId}/scores`),

  getScorecard: (eventId: string, teamId: string) =>
    request<Scorecard>(`/api/v1/events/${eventId}/teams/${teamId}/scorecard`),

  submit: (eventId: string, payload: SubmitScorePayload) =>
    request<Score>(`/api/v1/events/${eventId}/scores`, { method: 'POST', body: payload }),

  update: (eventId: string, scoreId: string, payload: { grossScore?: number; putts?: number }) =>
    request<Score>(`/api/v1/events/${eventId}/scores/${scoreId}`, {
      method: 'PATCH', body: payload,
    }),

  resolveConflict: (eventId: string, scoreId: string, acceptedScore: number, note?: string) =>
    request<Score>(`/api/v1/events/${eventId}/scores/${scoreId}/resolve`, {
      method: 'POST', body: { acceptedScore, resolutionNote: note },
    }),

  qrCollect: (eventId: string, payload: string) =>
    request<QrCollectResult>(`/api/v1/events/${eventId}/scores/qr-collect`, {
      method: 'POST', body: { payload },
    }),
};

// ── SPONSORS ──────────────────────────────────────────────────────────────────

export const sponsorsApi = {
  list: (eventId: string) =>
    request<Sponsor[]>(`/api/v1/events/${eventId}/sponsors`),

  create: (eventId: string, payload: CreateSponsorPayload) =>
    request<Sponsor>(`/api/v1/events/${eventId}/sponsors`, { method: 'POST', body: payload }),

  update: (eventId: string, sponsorId: string, payload: Partial<CreateSponsorPayload>) =>
    request<Sponsor>(`/api/v1/events/${eventId}/sponsors/${sponsorId}`, {
      method: 'PATCH', body: payload,
    }),

  delete: (eventId: string, sponsorId: string) =>
    request<void>(`/api/v1/events/${eventId}/sponsors/${sponsorId}`, { method: 'DELETE' }),

  uploadLogo: async (eventId: string, sponsorId: string, file: File): Promise<Sponsor> => {
    const token = storage.getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/api/v1/events/${eventId}/sponsors/${sponsorId}/logo`, {
      method: 'POST', headers, body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, 'UPLOAD_FAILED', (err as any).error ?? 'Logo upload failed.');
    }
    return res.json();
  },
};

export const emailBuilderApi = {
  getData: (eventId: string) =>
    request<EmailBuilderData>(`/api/v1/events/${eventId}/email-builder/data`),

  send: (eventId: string, payload: { toAddress: string; subject: string; html: string }) =>
    request<{ sent: boolean }>(`/api/v1/events/${eventId}/email-builder/send`, {
      method: 'POST', body: payload,
    }),

  export: async (eventId: string, html: string): Promise<Blob> => {
    const token   = storage.getAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';
    const res = await fetch(`${BASE_URL}/api/v1/events/${eventId}/email-builder/export`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ html }),
    });
    if (!res.ok) throw new ApiError(res.status, 'EXPORT_FAILED', 'Email export failed.');
    return res.blob();
  },
};

export interface EmailBuilderData {
  eventName:        string;
  orgName:          string;
  orgLogoUrl:       string | null;
  eventDate:        string;
  eventLocation:    string;
  registrationUrl:  string;
  qrCodeUrl:        string;
  primaryColor:     string;
  missionStatement: string | null;
  sponsors:         Array<{ name: string; logoUrl: string | null; tier: string }>;
}

// ── LOCAL TYPES (mirror shared-types DTOs, explicit for this app) ─────────────

export interface EventSummary {
  id: string; name: string; eventCode: string;
  format: string; status: string; startAt: string | null; teamCount: number;
}

export interface TestDataSummary {
  teamsCount: number;
  playersCount: number;
  scoresCount: number;
  donationsCount: number;
  challengeResultsCount: number;
  bidsCount: number;
  auctionItemsCount: number;
  auctionWinnersCount: number;
  totalCount: number;
}

export interface EventDetail extends EventSummary {
  orgId: string; startType: string; holes: number;
  config: Record<string, unknown>;
  course: Course | null;
  counts: { teamsRegistered: number; playersRegistered: number; teamsCheckedIn: number; holesScored: number };
  logoUrl: string | null; themeJson: string | null;
  missionStatement: string | null; is501c3: boolean;
  isTestMode: boolean;
  testDataSummary: TestDataSummary;
}

export interface Course {
  id: string; name: string; address: string; city: string; state: string; zip: string;
  holes: CourseHole[];
}

export interface CourseHole {
  id: string; holeNumber: number; par: number; handicapIndex: number;
  yardageWhite: number | null; yardageBlue: number | null; yardageRed: number | null;
}

export interface Team {
  id: string; eventId: string; name: string;
  startingHole: number | null; teeTime: string | null;
  entryFeePaid: boolean; maxPlayers: number; checkInStatus: string;
  players: Player[];
}

export interface Player {
  id: string; teamId: string | null; eventId: string;
  firstName: string; lastName: string; email: string;
  handicapIndex: number | null; checkInStatus: string;
}

export interface Score {
  id: string; eventId: string; teamId: string; teamName: string;
  holeNumber: number; grossScore: number; putts: number | null;
  deviceId: string; submittedAt: string; source: string; isConflicted: boolean;
}

export interface Scorecard {
  teamId: string; teamName: string;
  holes: { holeNumber: number; par: number; grossScore: number | null; putts: number | null; hasConflict: boolean }[];
  grossTotal: number; parTotal: number; toPar: number;
  holesComplete: number; hasConflicts: boolean;
}

export interface LeaderboardEntry {
  rank: number; teamId: string; teamName: string;
  toPar: number; grossTotal: number; stablefordPoints: number;
  holesComplete: number; isComplete: boolean;
  startingHole: number | null; teeTime: string | null;
}

export interface FundraisingTotals {
  entryFeesCents: number; donationsCents: number; grandTotalCents: number;
  sponsorAmountCents: number; challengeAmountCents: number;
  teamsPaid: number; teamsTotal: number; donationCount: number;
}

export interface Sponsor {
  id: string; eventId: string; name: string; logoUrl: string;
  websiteUrl: string | null; tagline: string | null; tier: string;
  donationAmountCents: number | null;
}

export interface QrCollectResult {
  teamId: string; teamName: string;
  scoresImported: number; conflicts: number;
  conflictDetails: { holeNumber: number; existingScore: number; qrScore: number }[];
}

export interface HoleChallenge {
  holeNumber:          number;
  description:         string;
  sponsorName:         string | null;
  sponsorLogoUrl:      string | null;
  donationAmountCents: number | null;
  winnerId:            string | null;
  winnerName:          string | null;
}

// Payload types
export interface CreateEventPayload {
  name: string; format: string; startType: string; holes: number; startAt?: string;
}
export interface UpdateEventPayload {
  name?: string; format?: string; startType?: string; holes?: number;
  status?: string; startAt?: string;
  config?: Record<string, unknown>;
}
export interface AttachCoursePayload {
  name: string; address: string; city: string; state: string; zip: string;
  holes?: { holeNumber: number; par: number; handicapIndex: number; yardageWhite?: number; yardageBlue?: number; yardageRed?: number }[];
}
export interface RegisterTeamPayload {
  teamName: string;
  players: { firstName: string; lastName: string; email: string; handicap?: number }[];
}
export interface SubmitScorePayload {
  teamId: string; holeNumber: number; grossScore: number; putts?: number; deviceId?: string;
}
export interface UpsertChallengePayload {
  description: string;
  sponsorName?: string;
  sponsorLogoUrl?: string;
  donationAmountCents?: number;
}

export interface CreateSponsorPayload {
  name: string; logoUrl?: string; tier: string; websiteUrl?: string; tagline?: string;
  donationAmountCents?: number;
  placements?: Record<string, unknown>;
}

// ── AUCTION ───────────────────────────────────────────────────────────────────

export const auctionApi = {
  getItems: (eventId: string) =>
    request<AuctionItem[]>(`/api/v1/events/${eventId}/auction/items`),

  createItem: (eventId: string, payload: CreateAuctionItemPayload) =>
    request<AuctionItem>(`/api/v1/events/${eventId}/auction/items`, {
      method: 'POST', body: payload,
    }),

  updateItem: (eventId: string, itemId: string, payload: Partial<CreateAuctionItemPayload>) =>
    request<AuctionItem>(`/api/v1/events/${eventId}/auction/items/${itemId}`, {
      method: 'PATCH', body: payload,
    }),

  deleteItem: (eventId: string, itemId: string) =>
    request<void>(`/api/v1/events/${eventId}/auction/items/${itemId}`, { method: 'DELETE' }),

  startSession: (eventId: string) =>
    request<AuctionSession>(`/api/v1/events/${eventId}/auction/sessions/start`, { method: 'POST', body: {} }),

  nextItem: (eventId: string) =>
    request<AuctionSession>(`/api/v1/events/${eventId}/auction/sessions/next-item`, { method: 'POST', body: {} }),

  updateCalledAmount: (eventId: string, amountCents: number) =>
    request<AuctionSession>(`/api/v1/events/${eventId}/auction/sessions/called-amount`, {
      method: 'POST', body: { amountCents },
    }),

  getActiveSession: (eventId: string) =>
    request<AuctionSession | null>(`/api/v1/events/${eventId}/auction/sessions/active`, { public: true })
      .then(r => r ?? null),

  awardItem: (itemId: string, playerId: string, amountCents: number) =>
    request<{ awarded: boolean }>(`/api/v1/auction/items/${itemId}/award`, {
      method: 'POST', body: { playerId, amountCents },
    }),

  getFailedCharges: (eventId: string) =>
    request<FailedCharge[]>(`/api/v1/events/${eventId}/auction/failed-charges`),

  rechargeWinner: (winnerId: string) =>
    request<void>(`/api/v1/auction/winners/${winnerId}/recharge`, { method: 'POST', body: {} }),

  waiveWinner: (winnerId: string) =>
    request<void>(`/api/v1/auction/winners/${winnerId}/waive`, { method: 'POST', body: {} }),

  raiseHand: (eventId: string) =>
    request<{ count: number }>(`/api/v1/events/${eventId}/auction/sessions/raise-hand`, {
      method: 'POST', body: {}, public: true,
    }),

  uploadPhoto: async (eventId: string, itemId: string, file: File): Promise<AuctionItem> => {
    const token = storage.getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/api/v1/events/${eventId}/auction/items/${itemId}/photos`, {
      method: 'POST', headers, body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, 'UPLOAD_FAILED', (err as any).error ?? 'Photo upload failed.');
    }
    return res.json();
  },
};

export interface AuctionItem {
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
  displayOrder: number;
  donationDenominations: number[] | null;
  minimumBidCents: number | null;
  fairMarketValueCents: number;
  goalCents: number | null;
  totalRaisedCents: number;
}

export interface AuctionSession {
  id: string;
  eventId: string;
  isActive: boolean;
  currentItemId: string | null;
  currentCalledAmountCents: number;
  currentBidderCount: number;
  startedAt: string;
  endedAt: string | null;
}

export interface FailedCharge {
  winnerId: string;
  auctionItemId: string;
  itemTitle: string;
  playerName: string;
  playerEmail: string;
  amountCents: number;
  stripePaymentIntentId: string;
  failedAt: string;
}

// ── ORG SETTINGS ─────────────────────────────────────────────────────────────

export interface OrgProfile {
  id: string; name: string; slug: string;
  logoUrl: string | null; missionStatement: string | null;
  is501c3: boolean; themeJson: string | null; createdAt: string;
}

export interface UpdateOrgPayload {
  name?: string;
  logoUrl?: string | null;
  missionStatement?: string | null;
  is501c3?: boolean;
  themeJson?: string | null;
}

export const orgApi = {
  getMe: () => request<OrgProfile>('/api/v1/orgs/me'),

  updateMe: (payload: UpdateOrgPayload) =>
    request<OrgProfile>('/api/v1/orgs/me', { method: 'PATCH', body: payload }),

  uploadLogo: async (file: File): Promise<{ logoUrl: string; fullUrl: string }> => {
    const token   = storage.getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const form = new FormData();
    form.append('file', file);

    const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';
    const res = await fetch(`${BASE_URL}/api/v1/orgs/me/logo`, {
      method: 'POST', headers, body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, 'UPLOAD_FAILED', (err as any).detail ?? 'Logo upload failed.');
    }
    return res.json();
  },
};

// ── SUPER ADMIN ───────────────────────────────────────────────────────────────

export interface OrgSummary {
  id: string; name: string; slug: string;
  is501c3: boolean; eventCount: number; createdAt: string;
}

export interface AllEventSummary {
  id: string; name: string; status: string; eventCode: string;
  orgId: string; orgName: string; orgSlug: string;
  teamCount: number; startAt: string | null;
}

export const superAdminApi = {
  listOrganizations: () =>
    request<OrgSummary[]>('/api/v1/super-admin/organizations'),

  listAllEvents: () =>
    request<AllEventSummary[]>('/api/v1/super-admin/events'),
};

export interface CreateAuctionItemPayload {
  title: string;
  description: string;
  photoUrls?: string[];
  auctionType: string;
  startingBidCents: number;
  bidIncrementCents?: number;
  buyNowPriceCents?: number;
  closesAt?: string;
  maxExtensionMin?: number;
  displayOrder?: number;
  donationDenominations?: number[];
  minimumBidCents?: number;
  fairMarketValueCents?: number;
  goalCents?: number;
}

// ── LEAGUE ────────────────────────────────────────────────────────────────────

export interface LeagueSummary {
  id: string; orgId: string; name: string;
  format: string; handicapSystem: string; handicapCap: number;
  maxFlights: number; duesCents: number; seasonCount: number; createdAt: string;
}

export interface SeasonSummary {
  id: string; leagueId: string; name: string;
  totalRounds: number; startDate: string; endDate: string;
  status: string; roundsCounted: number; standingMethod: string;
  memberCount: number; roundCount: number; createdAt: string;
}

export interface FlightSummary {
  id: string; seasonId: string; name: string;
  minHandicap: number | null; maxHandicap: number | null; memberCount: number;
}

export interface LeagueMember {
  id: string; seasonId: string; playerId: string | null; flightId: string | null;
  flightName: string | null; firstName: string; lastName: string; email: string;
  handicapIndex: number; duesPaid: boolean; roundsPlayed: number;
  absences: number; status: string; isSandbagger: boolean;
}

export interface LeagueRound {
  id: string; seasonId: string; courseId: string | null; courseName: string | null;
  roundDate: string; status: string; notes: string | null;
  pairingCount: number; scoredCount: number;
}

export interface PairingGroup {
  id: string; groupNumber: number; memberIds: string[]; memberNames: string[];
  teeTime: string | null; startingHole: number | null; isLocked: boolean;
}

export interface StandingRow {
  rank: number; memberId: string; memberName: string; flightName: string;
  handicapIndex: number; totalPoints: number; netStrokes: number;
  seasonAvgNet: number; roundsPlayed: number;
}

export interface SkinRow {
  id: string; holeNumber: number; winnerMemberId: string | null;
  winnerName: string | null; potCents: number; carriedOverFromHole: number | null;
}

export interface HandicapHistoryRow {
  id: string; roundId: string | null; roundDate: string | null;
  oldIndex: number; newIndex: number; differential: number;
  adminOverride: boolean; reason: string | null; createdAt: string;
}

export interface SeasonDashboard {
  season: SeasonSummary; rounds: LeagueRound[]; roster: LeagueMember[];
  flights: FlightSummary[]; standings: StandingRow[];
}

export const leagueApi = {
  list: () => request<LeagueSummary[]>('/api/v1/leagues'),

  create: (payload: { name: string; format: string; handicapSystem?: string; handicapCap?: number; maxFlights?: number; duesCents?: number }) =>
    request<LeagueSummary>('/api/v1/leagues', { method: 'POST', body: payload }),

  update: (leagueId: string, payload: Partial<{ name: string; format: string; handicapSystem: string; handicapCap: number; maxFlights: number; duesCents: number }>) =>
    request<LeagueSummary>(`/api/v1/leagues/${leagueId}`, { method: 'PATCH', body: payload }),

  getSeasons: (leagueId: string) =>
    request<SeasonSummary[]>(`/api/v1/leagues/${leagueId}/seasons`),

  getDashboard: (leagueId: string, seasonId: string) =>
    request<SeasonDashboard>(`/api/v1/leagues/${leagueId}/seasons/${seasonId}`),

  createSeason: (leagueId: string, payload: { name: string; totalRounds: number; startDate: string; endDate: string; roundsCounted?: number; standingMethod?: string }) =>
    request<SeasonSummary>(`/api/v1/leagues/${leagueId}/seasons`, { method: 'POST', body: payload }),

  getFlights: (leagueId: string, seasonId: string) =>
    request<FlightSummary[]>(`/api/v1/leagues/${leagueId}/seasons/${seasonId}/flights`),

  createFlight: (leagueId: string, seasonId: string, payload: { name: string; minHandicap?: number; maxHandicap?: number }) =>
    request<FlightSummary>(`/api/v1/leagues/${leagueId}/seasons/${seasonId}/flights`, { method: 'POST', body: payload }),

  getMembers: (leagueId: string, seasonId: string) =>
    request<LeagueMember[]>(`/api/v1/leagues/${leagueId}/seasons/${seasonId}/members`),

  addMember: (leagueId: string, seasonId: string, payload: { firstName: string; lastName: string; email: string; handicapIndex?: number; flightId?: string; status?: string }) =>
    request<LeagueMember>(`/api/v1/leagues/${leagueId}/seasons/${seasonId}/members`, { method: 'POST', body: payload }),

  updateMember: (leagueId: string, seasonId: string, memberId: string, payload: Partial<{ flightId: string; handicapIndex: number; duesPaid: boolean; status: string }>) =>
    request<LeagueMember>(`/api/v1/leagues/${leagueId}/seasons/${seasonId}/members/${memberId}`, { method: 'PATCH', body: payload }),

  overrideHandicap: (leagueId: string, seasonId: string, memberId: string, newIndex: number, reason: string) =>
    request<void>(`/api/v1/leagues/${leagueId}/seasons/${seasonId}/members/${memberId}/handicap`, {
      method: 'PATCH', body: { newIndex, reason },
    }),

  getHandicapHistory: (leagueId: string, seasonId: string, memberId: string) =>
    request<HandicapHistoryRow[]>(`/api/v1/leagues/${leagueId}/seasons/${seasonId}/members/${memberId}/handicap-history`),

  getRounds: (leagueId: string, seasonId: string) =>
    request<LeagueRound[]>(`/api/v1/leagues/${leagueId}/seasons/${seasonId}/rounds`),

  createRound: (leagueId: string, seasonId: string, payload: { roundDate: string; courseId?: string; notes?: string }) =>
    request<LeagueRound>(`/api/v1/leagues/${leagueId}/seasons/${seasonId}/rounds`, { method: 'POST', body: payload }),

  generatePairings: (leagueId: string, seasonId: string, roundId: string, maxPerGroup?: number) =>
    request<PairingGroup[]>(`/api/v1/leagues/${leagueId}/seasons/${seasonId}/rounds/${roundId}/generate-pairings?maxPerGroup=${maxPerGroup ?? 4}`),

  savePairings: (leagueId: string, seasonId: string, roundId: string, groups: { memberIds: string[]; teeTime?: string; startingHole?: number }[], lock?: boolean) =>
    request<void>(`/api/v1/leagues/${leagueId}/seasons/${seasonId}/rounds/${roundId}/pairings`, {
      method: 'PATCH', body: { groups, lock: lock ?? true },
    }),

  openScoring: (leagueId: string, seasonId: string, roundId: string) =>
    request<void>(`/api/v1/leagues/${leagueId}/seasons/${seasonId}/rounds/${roundId}/open-scoring`, { method: 'POST', body: {} }),

  closeRound: (leagueId: string, seasonId: string, roundId: string, skinsPotCents?: number) =>
    request<void>(`/api/v1/leagues/${leagueId}/seasons/${seasonId}/rounds/${roundId}/close?skinsPotCentsPerHolePerPlayer=${skinsPotCents ?? 0}`, { method: 'POST', body: {} }),

  getStandings: (leagueId: string, seasonId: string) =>
    request<StandingRow[]>(`/api/v1/leagues/${leagueId}/seasons/${seasonId}/standings`),

  getSkins: (leagueId: string, seasonId: string, roundId: string) =>
    request<SkinRow[]>(`/api/v1/leagues/${leagueId}/seasons/${seasonId}/rounds/${roundId}/skins`),

  getScorecards: (leagueId: string, seasonId: string, roundId: string) =>
    request<unknown[]>(`/api/v1/leagues/${leagueId}/seasons/${seasonId}/rounds/${roundId}/scorecards`),
};

export { ApiError };
