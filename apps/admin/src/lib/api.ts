import { storage } from './storage';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000';

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
        try { const e = await retry.json(); code = e.code ?? code; msg = e.error ?? msg; } catch { /* not JSON */ }
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
      code    = err.code    ?? code;
      message = err.error   ?? message;
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
    orgName: string; orgSlug: string;
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

// ── TEAMS ─────────────────────────────────────────────────────────────────────

export const teamsApi = {
  list: (eventId: string) =>
    request<Team[]>(`/api/v1/events/${eventId}/teams`),

  get: (eventId: string, teamId: string) =>
    request<Team>(`/api/v1/events/${eventId}/teams/${teamId}`),

  registerTeam: (eventId: string, payload: RegisterTeamPayload) =>
    request<{ team: Team }>(`/api/v1/events/${eventId}/register/team`, {
      method: 'POST', body: payload,
    }),

  checkIn: (eventId: string, teamId: string) =>
    request<Team>(`/api/v1/events/${eventId}/teams/${teamId}/check-in`, {
      method: 'POST', body: {},
    }),

  markFeePaid: (eventId: string, teamId: string) =>
    request<Team>(`/api/v1/events/${eventId}/teams/${teamId}/fee-paid`, {
      method: 'POST', body: {},
    }),
};

// ── FREE AGENTS ───────────────────────────────────────────────────────────────

export const playersApi = {
  listFreeAgents: (eventId: string) =>
    request<Player[]>(`/api/v1/events/${eventId}/free-agents`),

  assignToTeam: (eventId: string, playerId: string, teamId: string) =>
    request<Player>(`/api/v1/events/${eventId}/players/${playerId}/assign`, {
      method: 'POST', body: { teamId },
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

export interface EventDetail extends EventSummary {
  orgId: string; startType: string; holes: number;
  config: Record<string, unknown>;
  course: Course | null;
  counts: { teamsRegistered: number; playersRegistered: number; teamsCheckedIn: number; holesScored: number };
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
  toPar: number; grossTotal: number; holesComplete: number;
  isComplete: boolean; startingHole: number | null; teeTime: string | null;
}

export interface FundraisingTotals {
  entryFeesCents: number; donationsCents: number; grandTotalCents: number;
  teamsPaid: number; teamsTotal: number; donationCount: number;
}

export interface Sponsor {
  id: string; eventId: string; name: string; logoUrl: string;
  websiteUrl: string | null; tagline: string | null; tier: string;
}

export interface QrCollectResult {
  teamId: string; teamName: string;
  scoresImported: number; conflicts: number;
  conflictDetails: { holeNumber: number; existingScore: number; qrScore: number }[];
}

export interface HoleChallenge {
  holeNumber:   number;
  description:  string;
  sponsorName:  string | null;
  winnerId:     string | null;
  winnerName:   string | null;
}

// Payload types
export interface CreateEventPayload {
  name: string; format: string; startType: string; holes: number; startAt?: string;
}
export interface UpdateEventPayload {
  name?: string; status?: string; startAt?: string;
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
}

export interface CreateSponsorPayload {
  name: string; logoUrl: string; tier: string; websiteUrl?: string; tagline?: string;
  placements?: Record<string, unknown>;
}

export { ApiError };
