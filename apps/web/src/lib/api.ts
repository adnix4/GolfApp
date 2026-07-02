const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

/** Organizer/admin app base URL for Sign-up / Log-in CTAs (separate app; a link, not SSO). */
export const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:8081';

export interface PublicCourseInfo {
  name:  string;
  city:  string;
  state: string;
}

export interface PublicSponsorInfo {
  name:                 string;
  logoUrl:              string;
  tagline:              string | null;
  tier:                 string;
  holeNumbers?:         number[];     // hole-sponsor associations
  challengeDescription?: string;      // e.g. "Closest to Pin"
}

export interface PublicFundraisingInfo {
  donationsCents:  number;
  grandTotalCents: number;
  goalCents?:      number;
}

export interface PublicEventData {
  id:               string;
  name:             string;
  eventCode:        string;
  orgName:          string;
  orgSlug:          string;
  format:           string;
  status:           string;
  startAt:          string | null;
  spotsRemaining:   number | null;
  course:           PublicCourseInfo | null;
  sponsors:         PublicSponsorInfo[];
  fundraising:      PublicFundraisingInfo;
  freeAgentEnabled: boolean;
  resolvedLogoUrl:   string | null;
  resolvedThemeJson: string | null;
  missionStatement:  string | null;
  is501c3:           boolean;
  sponsorsVersion:   number;
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
  eventId:           string;
  eventName:         string;
  status:            string;
  standings:         PublicLeaderboardEntry[];
  resolvedLogoUrl:   string | null;
  resolvedThemeJson: string | null;
  orgName:           string | null;
}

/** Lightweight summary of a publicly-listed (Registration/Active/Scoring) event. */
export interface ActiveEventSummary {
  id:               string;
  name:             string;
  eventCode:        string;
  format:           string;
  status:           string;
  startAt:          string | null;
  orgName:          string;
  orgSlug:          string;
  courseName:       string | null;
  courseCity:       string | null;
  courseState:      string | null;
  logoUrl:          string | null;
  freeAgentEnabled: boolean;
}

/** All currently-open events across orgs (for the golfer "find your event" directory). */
export async function fetchActiveEvents(): Promise<ActiveEventSummary[]> {
  try {
    const res = await fetch(`${BASE}/api/v1/pub/events/active`, { cache: 'no-store' });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchPublicEvent(eventCode: string): Promise<PublicEventData | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/pub/events/${eventCode}`, {
      next: { revalidate: 60 },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Client-side, cache-bypassing refetch of the public event. Used by the live
 * scoreboard to pull a fresh sponsor list (and sponsorsVersion) after a
 * SponsorsChanged signal or a poll-fallback tick. Unlike fetchPublicEvent,
 * this never serves a cached response, so a mid-event sponsor edit lands
 * immediately.
 */
export async function fetchPublicEventFresh(eventCode: string): Promise<PublicEventData | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/pub/events/${eventCode}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchPublicLeaderboard(eventCode: string): Promise<PublicLeaderboard | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/pub/events/${eventCode}/leaderboard`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── REGISTRATION ──────────────────────────────────────────────────────────────

export interface RegisterTeamPayload {
  teamName: string;
  players:  { firstName: string; lastName: string; email: string; handicap?: number }[];
}

export interface JoinTeamPayload {
  inviteToken: string;
  player:      { firstName: string; lastName: string; email: string; handicap?: number };
}

export interface RegisterFreeAgentPayload {
  player:      { firstName: string; lastName: string; email: string; handicap?: number };
  skillLevel?: string;
  pairingNote?: string;
}

export interface RegistrationResult {
  ok:      boolean;
  message: string;
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    cache:   'no-store',
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  return { ok: res.ok, status: res.status, data };
}

export async function registerTeam(eventId: string, payload: RegisterTeamPayload): Promise<RegistrationResult> {
  const { ok, data } = await postJson(`${BASE}/api/v1/events/${eventId}/register/team`, payload);
  if (!ok) return { ok: false, message: data?.detail ?? data?.title ?? 'Registration failed.' };
  return { ok: true, message: 'Team registered! Check your email for next steps.' };
}

export async function joinTeam(eventId: string, payload: JoinTeamPayload): Promise<RegistrationResult> {
  const { ok, data } = await postJson(`${BASE}/api/v1/events/${eventId}/register/join`, payload);
  if (!ok) return { ok: false, message: data?.detail ?? data?.title ?? 'Could not join team.' };
  return { ok: true, message: "You've been added to the team!" };
}

export async function registerFreeAgent(eventId: string, payload: RegisterFreeAgentPayload): Promise<RegistrationResult> {
  const { ok, data } = await postJson(`${BASE}/api/v1/events/${eventId}/register/free-agent`, payload);
  if (!ok) return { ok: false, message: data?.detail ?? data?.title ?? 'Registration failed.' };
  return { ok: true, message: "You're on the free agent list — the organizer will be in touch!" };
}

// ── DONATION ──────────────────────────────────────────────────────────────────

export interface DonatePayload {
  donorName:   string;
  donorEmail:  string;
  amountCents: number;
}

export interface DonateResult {
  ok:      boolean;
  message: string;
}

export async function submitDonation(eventCode: string, payload: DonatePayload): Promise<DonateResult> {
  const { ok, data } = await postJson(`${BASE}/api/v1/pub/events/${eventCode}/donate`, payload);
  if (!ok) return { ok: false, message: data?.detail ?? data?.title ?? 'Donation failed.' };
  return { ok: true, message: data?.message ?? 'Thank you for your donation!' };
}
