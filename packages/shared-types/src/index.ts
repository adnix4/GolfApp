/**
 * @gfp/shared-types — API Data Transfer Object Definitions
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS:
 *   Every API response body has a TypeScript interface here AND a matching
 *   Zod schema.  The interface gives compile-time safety; the Zod schema gives
 *   runtime validation (parse API responses before trusting their shape).
 *
 * NAMING CONVENTION:
 *   - Interfaces are suffixed with "DTO"  (e.g. EventDTO)
 *   - Zod schemas are suffixed with "Schema" (e.g. EventSchema)
 *   - Enum string unions are plain PascalCase (e.g. EventFormat)
 *
 * IMPORT PATTERN IN APPS:
 *   import type { EventDTO, TeamDTO } from '@gfp/shared-types'
 *   import { EventSchema }            from '@gfp/shared-types'
 *
 * NOTE ON PHASE GATING:
 *   Fields added in later phases (Phase 4 Stripe, Phase 5 League, Phase 6 GPS)
 *   are marked with a comment.  They are nullable in the API response until
 *   that phase is deployed, so they are typed as T | null here.
 */

import { z } from 'zod';

// ── SHARED PRIMITIVES ─────────────────────────────────────────────────────────

/**
 * UUID string — all primary keys in the GFP database are UUIDs generated
 * server-side (not database serials).  We alias the type for clarity.
 */
export type UUID = string;

/**
 * ISO 8601 UTC timestamp string — all timestamps in API responses are strings
 * in this format: "2024-06-15T09:00:00Z".  The API convention document §10
 * requires this for all TIMESTAMPTZ columns.
 */
export type ISOTimestamp = string;

// ── ENUMS ─────────────────────────────────────────────────────────────────────

/**
 * EventFormat — the scoring format for a golf tournament.
 * Maps to the events.format ENUM column in PostgreSQL.
 *
 * scramble   — all players hit, team picks the best shot, repeat.  Most common
 *               for charity/fundraiser events because it helps slower golfers.
 * stroke     — each player counts every stroke, lowest total wins.
 * stableford — points awarded per hole based on score relative to par.
 * best_ball  — each player plays their own ball, best score on each hole counts.
 * match      — head-to-head by holes won, used in Phase 5 league play.
 */
export type EventFormat = 'scramble' | 'stroke' | 'stableford' | 'best_ball' | 'match';

/**
 * EventStartType — how teams start the round.
 * shotgun  — all teams tee off simultaneously from different holes at a signal.
 *            Used when the course must be cleared by a specific time.
 * tee_times — teams start sequentially from hole 1 at scheduled intervals.
 */
export type EventStartType = 'shotgun' | 'tee_times';

/**
 * EventStatus — the lifecycle state of an event.
 * draft        — being configured, not visible to public
 * registration — registration page live, accepting signups
 * active       — day-of check-in open
 * scoring      — round in progress, scores being entered
 * completed    — round over, final leaderboard published
 * cancelled    — event cancelled (soft delete — record is kept)
 */
export type EventStatus =
  | 'draft'
  | 'registration'
  | 'active'
  | 'scoring'
  | 'completed'
  | 'cancelled';

/**
 * RegistrationType — how a player came to be on a team.
 */
export type RegistrationType =
  | 'full_team'          // captain registered the team
  | 'individual_join'    // joined an existing team
  | 'free_agent'         // entered free agent pool, awaiting assignment
  | 'free_agent_assigned'// was assigned from free agent pool by organizer
  | 'walk_up';           // added same-day at check-in

/**
 * CheckInStatus — for both individual players and teams.
 */
export type CheckInStatus = 'pending' | 'checked_in' | 'complete';

/**
 * SponsorTier — display/pricing tier for event sponsors.
 * Determines where logos appear (see Foundation §6, Flyer sponsor placement).
 */
export type SponsorTier = 'title' | 'gold' | 'hole' | 'silver' | 'bronze';

/**
 * ChallengeType — the type of on-course contest at a given hole.
 */
export type ChallengeType =
  | 'closest_to_pin'
  | 'longest_drive'
  | 'putting'
  | 'beat_the_pro'
  | 'hole_in_one'
  | 'straightest_drive';

/**
 * ScoreSource — how a score record was created.
 * admin_entry  — typed in by event staff on the admin dashboard tablet
 * mobile_sync  — submitted by a golfer via the Phase 2 mobile app and synced
 * qr_transfer  — transferred from a paper scorecard via QR code scan (Phase 2)
 */
export type ScoreSource = 'admin_entry' | 'mobile_sync' | 'qr_transfer';

// ── DTO INTERFACES ────────────────────────────────────────────────────────────

/**
 * OrganizationDTO — returned by GET /api/v1/orgs/{id}
 * Represents a non-profit or school that runs events through GFP.
 */
export interface OrganizationDTO {
  id:               UUID;
  name:             string;
  /** URL-safe identifier used in public routes: /e/{slug}/{eventCode} */
  slug:             string;
  logoUrl:          string | null;
  /** Org-level 5-token color theme override.  null = use Eco Green defaults. */
  theme:            GFPThemeDTO | null;
  missionStatement: string | null;
  /** If true, donation receipt emails include 501(c)3 tax deductibility note */
  is501c3:          boolean;
  createdAt:        ISOTimestamp;
}

/**
 * GFPThemeDTO — the 5-token color override stored in organizations.theme JSONB.
 * Mirrors the GFPTheme interface from @gfp/theme.
 */
export interface GFPThemeDTO {
  primary:   string;
  action:    string;
  accent:    string;
  highlight: string;
  surface:   string;
}

/**
 * EventDTO — returned by GET /api/v1/events/{id}
 * The central entity.  All teams, scores, sponsors, and challenges belong to an event.
 */
export interface EventDTO {
  id:        UUID;
  orgId:     UUID;
  name:      string;
  /** 8-character random alphanumeric code used in QR codes and public URLs */
  eventCode: string;
  format:    EventFormat;
  startType: EventStartType;
  /** Number of holes: 9 or 18 */
  holes:     9 | 18;
  status:    EventStatus;
  startAt:   ISOTimestamp | null;
  /** Flexible settings bag — allow_walk_ups, max_teams, tee_intervals, etc. */
  config:    EventConfigDTO;
  course:    CourseDTO | null;
}

/**
 * EventConfigDTO — the flexible JSONB config column on events.
 * Fields are added here as features require them without schema migrations.
 */
export interface EventConfigDTO {
  allowWalkUps?:      boolean;
  maxTeams?:          number;
  teeIntervalMinutes?: number;
  freeAgentEnabled?:  boolean;
  /** Per-event theme override — null inherits from org theme */
  themeOverride?:     GFPThemeDTO | null;
}

/**
 * CourseDTO — a golf course attached to an event.
 */
export interface CourseDTO {
  id:      UUID;
  orgId:   UUID;
  name:    string;
  address: string;
  city:    string;
  state:   string;
  zip:     string;
  holes:   CourseHoleDTO[];
}

/**
 * CourseHoleDTO — per-hole metadata for scoring and handicap calculations.
 */
export interface CourseHoleDTO {
  id:            UUID;
  holeNumber:    number;
  par:           number;
  /** Hole difficulty rank 1–18 (1 = hardest).  Used for net stroke allocation. */
  handicapIndex: number;
  yardageWhite:  number | null;
  yardageBlue:   number | null;
  yardageRed:    number | null;
  /** Phase 6: GPS coordinates of the pin */
  cupLocation:   GeoPointDTO | null;
}

/**
 * GeoPointDTO — a WGS-84 lat/lon coordinate.
 * Used for Phase 6 GPS features (closest-to-pin measurement, drive tracking).
 * Included in Phase 1 types so the mobile app can handle Phase 6 responses
 * without a type-system update.
 */
export interface GeoPointDTO {
  latitude:  number;
  longitude: number;
  /** Elevation in meters — only present for cup_location */
  elevationM?: number;
}

/**
 * TeamDTO — a team registered for an event.
 */
export interface TeamDTO {
  id:              UUID;
  eventId:         UUID;
  name:            string;
  captainPlayerId: UUID | null;
  /** For shotgun starts: which hole the team begins on */
  startingHole:    number | null;
  teeTime:         ISOTimestamp | null;
  entryFeePaid:    boolean;
  maxPlayers:      number;
  checkInStatus:   CheckInStatus;
  players:         PlayerDTO[];
}

/**
 * PlayerDTO — an individual golfer registered for an event.
 */
export interface PlayerDTO {
  id:               UUID;
  teamId:           UUID | null;
  eventId:          UUID;
  firstName:        string;
  lastName:         string;
  email:            string;
  phone:            string | null;
  handicapIndex:    number | null;
  registrationType: RegistrationType;
  skillLevel:       'beginner' | 'intermediate' | 'advanced' | 'competitive' | null;
  ageGroup:         'under30' | '30to50' | 'over50' | null;
  pairingNote:      string | null;
  checkInStatus:    CheckInStatus;
  checkInAt:        ISOTimestamp | null;
  /** Phase 4: true if player has a Stripe card on file */
  hasPaymentMethod: boolean;
}

/**
 * ScoreDTO — a single hole score for a team.
 * The API returns one ScoreDTO per hole per team.
 * The leaderboard endpoint aggregates these into LeaderboardEntryDTOs.
 */
export interface ScoreDTO {
  id:          UUID;
  eventId:     UUID;
  teamId:      UUID;
  holeNumber:  number;
  grossScore:  number;
  putts:       number | null;
  /** Phase 2: per-player shot breakdown stored as JSONB */
  playerShots: Record<UUID, number> | null;
  deviceId:    string;
  submittedAt: ISOTimestamp;
  syncedAt:    ISOTimestamp | null;
  source:      ScoreSource;
  isConflicted: boolean;
  /** Phase 6: GPS location where the drive landed */
  driveLocation: GeoPointDTO | null;
  ballLocation:  GeoPointDTO | null;
}

/**
 * LeaderboardEntryDTO — aggregated scoring for one team on the leaderboard.
 * Returned by GET /api/v1/events/{id}/leaderboard
 */
export interface LeaderboardEntryDTO {
  rank:          number;
  teamId:        UUID;
  teamName:      string;
  /** Total score relative to par: negative = under par (good), positive = over par */
  toPar:         number;
  /** Total gross strokes */
  grossTotal:    number;
  /** How many holes have been completed */
  holesComplete: number;
  /** true if the team has finished all holes */
  isComplete:    boolean;
  /** Sponsor badge to display next to team name, if any */
  sponsorBadge:  SponsorBadgeDTO | null;
}

/**
 * SponsorDTO — a sponsor attached to an event.
 */
export interface SponsorDTO {
  id:         UUID;
  eventId:    UUID;
  name:       string;
  logoUrl:    string;
  websiteUrl: string | null;
  tagline:    string | null;
  tier:       SponsorTier;
  /** JSONB: where on the platform this sponsor's logo appears */
  placements: SponsorPlacementsDTO;
}

/**
 * SponsorPlacementsDTO — which platform surfaces display this sponsor.
 */
export interface SponsorPlacementsDTO {
  leaderboard?: boolean;
  landingPage?:  boolean;
  scorecards?:   boolean;
  emailFooter?:  boolean;
  /** Specific hole numbers if this is a hole sponsor */
  holeNumbers?:  number[];
}

/**
 * SponsorBadgeDTO — a lightweight sponsor reference for inline leaderboard display.
 */
export interface SponsorBadgeDTO {
  name:    string;
  logoUrl: string;
  tier:    SponsorTier;
}

/**
 * DonationDTO — a donation recorded for an event.
 */
export interface DonationDTO {
  id:                   UUID;
  eventId:              UUID;
  donorName:            string;
  donorEmail:           string;
  /** Amount in US cents to avoid floating-point currency errors */
  amountCents:          number;
  receiptSent:          boolean;
  /** Phase 4: Stripe PaymentIntent ID for online donations */
  stripePaymentIntentId: string | null;
  createdAt:            ISOTimestamp;
}

/**
 * HoleChallengeDTO — an on-course contest at a specific hole (or all day).
 */
export interface HoleChallengeDTO {
  id:               UUID;
  eventId:          UUID;
  /** null = all-day challenge (e.g. hole-in-one anywhere on the course) */
  holeNumber:       number | null;
  challengeType:    ChallengeType;
  description:      string;
  prizeDescription: string | null;
  sponsorId:        UUID | null;
  results:          ChallengeResultDTO[];
}

/**
 * ChallengeResultDTO — the result recorded for one team in a hole challenge.
 */
export interface ChallengeResultDTO {
  id:          UUID;
  challengeId: UUID;
  teamId:      UUID;
  playerId:    UUID | null;
  /** For distance challenges: yards; for putting: number of putts */
  resultValue: number | null;
  resultNotes: string | null;
  recordedAt:  ISOTimestamp;
}

/**
 * FundraisingTotalsDTO — returned by GET /api/v1/events/{id}/fundraising
 * Shows real-time fundraising progress across all revenue streams.
 */
export interface FundraisingTotalsDTO {
  /** Sum of all entry fees collected (in cents) */
  entryFeesCents:  number;
  /** Sum of all donations (in cents) */
  donationsCents:  number;
  /** Grand total across all streams (in cents) */
  grandTotalCents: number;
  /** Number of teams that have paid entry fees */
  teamsPaid:       number;
  /** Total number of registered teams */
  teamsTotal:      number;
}

/**
 * PublicEventDTO — the subset of EventDTO returned by the unauthenticated
 * GET /api/v1/pub/events/{eventCode} endpoint used by the landing page.
 * Excludes internal organizer data (check-in counts, financial details, etc.)
 */
export interface PublicEventDTO {
  id:           UUID;
  name:         string;
  eventCode:    string;
  format:       EventFormat;
  startAt:      ISOTimestamp | null;
  status:       EventStatus;
  /** Remaining team spots: max_teams - registered_teams */
  spotsRemaining: number | null;
  course:       Pick<CourseDTO, 'name' | 'city' | 'state'> | null;
  sponsors:     SponsorDTO[];
  /** Fundraising thermometer data for the donation widget */
  fundraising:  Pick<FundraisingTotalsDTO, 'donationsCents' | 'grandTotalCents'>;
}

// ── ZOD SCHEMAS ───────────────────────────────────────────────────────────────
// Zod schemas mirror the DTO interfaces and are used to validate API responses
// at runtime.  This is especially important for offline-capable mobile scenarios
// where stale cached data might not match the current schema.
//
// Pattern: z.object({...}).strict() — "strict" rejects unknown keys, catching
// accidental extra fields that could indicate a schema mismatch.

export const GFPThemeSchema = z.object({
  primary:   z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color'),
  action:    z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent:    z.string().regex(/^#[0-9a-fA-F]{6}$/),
  highlight: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  surface:   z.string().regex(/^#[0-9a-fA-F]{6}$/),
}).strict();

export const EventSchema = z.object({
  id:        z.string().uuid(),
  orgId:     z.string().uuid(),
  name:      z.string().min(1),
  eventCode: z.string().length(8),
  format:    z.enum(['scramble', 'stroke', 'stableford', 'best_ball', 'match']),
  startType: z.enum(['shotgun', 'tee_times']),
  holes:     z.union([z.literal(9), z.literal(18)]),
  status:    z.enum(['draft', 'registration', 'active', 'scoring', 'completed', 'cancelled']),
  startAt:   z.string().nullable(),
  config:    z.record(z.unknown()),  // flexible JSONB — validated per-field elsewhere
  course:    z.unknown().nullable(), // CourseSchema defined separately
});

export const LeaderboardEntrySchema = z.object({
  rank:          z.number().int().positive(),
  teamId:        z.string().uuid(),
  teamName:      z.string(),
  toPar:         z.number().int(),
  grossTotal:    z.number().int().nonnegative(),
  holesComplete: z.number().int().min(0).max(18),
  isComplete:    z.boolean(),
  sponsorBadge:  z.unknown().nullable(),
});

export const LeaderboardSchema = z.array(LeaderboardEntrySchema);

/**
 * Type helpers — infer TypeScript types from Zod schemas so we don't duplicate
 * the type definitions.  The z.infer<> pattern ensures the Schema and the type
 * are always in sync.
 */
export type GFPThemeFromSchema = z.infer<typeof GFPThemeSchema>;
export type LeaderboardEntry   = z.infer<typeof LeaderboardEntrySchema>;
