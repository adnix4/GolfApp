const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

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
  eventId:           string;
  eventName:         string;
  status:            string;
  standings:         PublicLeaderboardEntry[];
  resolvedLogoUrl:   string | null;
  resolvedThemeJson: string | null;
  orgName:           string | null;
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
