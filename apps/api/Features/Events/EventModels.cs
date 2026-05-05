// ─────────────────────────────────────────────────────────────────────────────
// Features/Events/EventModels.cs — Request & Response Models for Event Endpoints
// ─────────────────────────────────────────────────────────────────────────────
//
// DESIGN PRINCIPLE — WHY NOT EXPOSE ENTITIES DIRECTLY:
//   The Event entity has navigation properties (Teams, Scores, Sponsors) that
//   would cause circular serialization and over-fetch data the caller didn't ask
//   for.  DTOs let us return exactly the right shape for each endpoint.
//
// JSONB CONFIG PATTERN:
//   The events.config column is a JSONB bag of flexible settings.  Rather than
//   add a new column every time a feature needs a flag, the typed EventConfigDto
//   class is serialized to/from that column.  Adding a new field is a code change
//   only — no migration needed.
// ─────────────────────────────────────────────────────────────────────────────

using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.Events;

// ── REQUEST MODELS ────────────────────────────────────────────────────────────

/// <summary>
/// POST /api/v1/events
/// Creates a new event in Draft status.
/// The organizer can configure everything else after creation.
/// Spec: "Events start in Draft status.  Format + start type required at creation."
/// </summary>
public record CreateEventRequest
{
    [Required]
    [MaxLength(200)]
    public string Name { get; init; } = string.Empty;

    [Required]
    public EventFormat Format { get; init; }

    [Required]
    public EventStartType StartType { get; init; }

    /// <summary>9 or 18 holes.  Defaults to 18.</summary>
    public short Holes { get; init; } = 18;

    /// <summary>
    /// Scheduled start time in UTC.  Optional at creation — can be set later via PATCH.
    /// Required before transitioning from Draft → Registration.
    /// </summary>
    public DateTime? StartAt { get; init; }
}

/// <summary>
/// PATCH /api/v1/events/{id}
/// Partial update — only non-null fields are applied.
/// Uses a nullable-everything pattern so the caller only sends changed fields.
/// </summary>
public record UpdateEventRequest
{
    [MaxLength(200)]
    public string? Name { get; init; }

    public EventFormat? Format { get; init; }

    public EventStartType? StartType { get; init; }

    public short? Holes { get; init; }

    public DateTime? StartAt { get; init; }

    /// <summary>
    /// Drives the event lifecycle state machine.
    /// Valid transitions (spec Foundation §4.1):
    ///   Draft        → Registration
    ///   Registration → Active
    ///   Active       → Scoring
    ///   Scoring      → Completed
    ///   Any          → Cancelled
    /// Invalid transitions are rejected with 400 INVALID_TRANSITION.
    /// </summary>
    public EventStatus? Status { get; init; }

    /// <summary>Partial config update — only provided keys are merged into the JSONB.</summary>
    public EventConfigDto? Config { get; init; }
}

/// <summary>
/// POST /api/v1/events/{id}/course
/// Creates or replaces the course attached to an event.
/// Also accepts per-hole metadata (par, handicap index, yardages).
/// </summary>
public record AttachCourseRequest
{
    [Required]
    [MaxLength(200)]
    public string Name { get; init; } = string.Empty;

    [Required]
    [MaxLength(300)]
    public string Address { get; init; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string City { get; init; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string State { get; init; } = string.Empty;

    [MaxLength(20)]
    public string Zip { get; init; } = string.Empty;

    /// <summary>
    /// Per-hole metadata.  Must contain exactly Holes entries (9 or 18).
    /// If omitted, placeholder holes are created (par 4, handicap 1–18).
    /// </summary>
    public List<CourseHoleRequest>? Holes { get; init; }
}

/// <summary>Per-hole data within an AttachCourseRequest.</summary>
public record CourseHoleRequest
{
    [Range(1, 18)]
    public short HoleNumber { get; init; }

    [Range(3, 5)]
    public short Par { get; init; } = 4;

    [Range(1, 18)]
    public short HandicapIndex { get; init; } = 1;

    public int? YardageWhite { get; init; }
    public int? YardageBlue  { get; init; }
    public int? YardageRed   { get; init; }
}

/// <summary>
/// POST /api/v1/events/{id}/shotgun-assignments
/// Assigns a starting hole to each team for a shotgun-start event.
/// All teams must be assigned before the event can move to Active status.
/// Spec: "Shotgun assignments: POST body is array of { teamId, startingHole }."
/// </summary>
public record ShotgunAssignmentsRequest
{
    [Required]
    public List<ShotgunAssignment> Assignments { get; init; } = new();
}

public record ShotgunAssignment
{
    [Required]
    public Guid TeamId { get; init; }

    [Range(1, 18)]
    public short StartingHole { get; init; }
}

/// <summary>
/// POST /api/v1/events/{id}/tee-times
/// Assigns tee times to teams for a tee_times-start event.
/// Spec: "Tee times: POST body is array of { teamId, teeTime (UTC ISO 8601) }."
/// </summary>
public record TeeTimesRequest
{
    [Required]
    public List<TeeTimeAssignment> Assignments { get; init; } = new();
}

public record TeeTimeAssignment
{
    [Required]
    public Guid TeamId { get; init; }

    [Required]
    public DateTime TeeTime { get; init; }
}

// ── CONFIG DTO (JSONB bag) ────────────────────────────────────────────────────

/// <summary>
/// Typed representation of the events.config JSONB column.
/// All fields are nullable — only set fields are serialized to the DB.
/// New fields can be added here without a schema migration.
/// </summary>
public class EventConfigDto
{
    /// <summary>If true, walk-up registrations are accepted at check-in.</summary>
    [JsonPropertyName("allowWalkUps")]
    public bool? AllowWalkUps { get; set; }

    /// <summary>Maximum number of teams allowed.  null = unlimited.</summary>
    [JsonPropertyName("maxTeams")]
    public int? MaxTeams { get; set; }

    /// <summary>Minutes between tee times for tee_times-start events.</summary>
    [JsonPropertyName("teeIntervalMinutes")]
    public int? TeeIntervalMinutes { get; set; }

    /// <summary>If true, individual free agent registration is enabled.</summary>
    [JsonPropertyName("freeAgentEnabled")]
    public bool? FreeAgentEnabled { get; set; }

    /// <summary>
    /// Per-event color theme override.  null = inherit org theme.
    /// Allows one org to run differently-branded events.
    /// </summary>
    [JsonPropertyName("themeOverride")]
    public ThemeOverrideDto? ThemeOverride { get; set; }

    /// <summary>Entry fee amount in cents.  e.g. 15000 = $150.00 per team.</summary>
    [JsonPropertyName("entryFeeCents")]
    public int? EntryFeeCents { get; set; }
}

/// <summary>5-token theme override stored inside events.config JSONB.</summary>
public class ThemeOverrideDto
{
    [JsonPropertyName("primary")]   public string? Primary   { get; set; }
    [JsonPropertyName("action")]    public string? Action    { get; set; }
    [JsonPropertyName("accent")]    public string? Accent    { get; set; }
    [JsonPropertyName("highlight")] public string? Highlight { get; set; }
    [JsonPropertyName("surface")]   public string? Surface   { get; set; }
}

// ── RESPONSE MODELS ───────────────────────────────────────────────────────────

/// <summary>
/// Full event detail response.  Returned by GET /events/{id} and POST /events.
/// Includes course, team counts, and config — but NOT the full team roster
/// (that's a separate endpoint to avoid over-fetching).
/// </summary>
public record EventResponse
{
    public Guid            Id          { get; init; }
    public Guid            OrgId       { get; init; }
    public string          Name        { get; init; } = string.Empty;
    public string          EventCode   { get; init; } = string.Empty;
    public string          Format      { get; init; } = string.Empty;
    public string          StartType   { get; init; } = string.Empty;
    public short           Holes       { get; init; }
    public string          Status      { get; init; } = string.Empty;
    public DateTime?       StartAt     { get; init; }
    public EventConfigDto  Config      { get; init; } = new();
    public CourseResponse? Course      { get; init; }

    /// <summary>Quick counts for the Event Hub dashboard cards.</summary>
    public EventCountsDto  Counts      { get; init; } = new();
}

/// <summary>Summary counts shown on the Event Hub dashboard.</summary>
public record EventCountsDto
{
    public int TeamsRegistered  { get; init; }
    public int PlayersRegistered { get; init; }
    public int TeamsCheckedIn   { get; init; }
    public int HolesScored      { get; init; }
}

/// <summary>Summary list item — returned by GET /events (list view).</summary>
public record EventSummaryResponse
{
    public Guid      Id        { get; init; }
    public string    Name      { get; init; } = string.Empty;
    public string    EventCode { get; init; } = string.Empty;
    public string    Format    { get; init; } = string.Empty;
    public string    Status    { get; init; } = string.Empty;
    public DateTime? StartAt   { get; init; }
    public int       TeamCount { get; init; }
}

/// <summary>Course detail included in EventResponse.</summary>
public record CourseResponse
{
    public Guid              Id      { get; init; }
    public string            Name    { get; init; } = string.Empty;
    public string            Address { get; init; } = string.Empty;
    public string            City    { get; init; } = string.Empty;
    public string            State   { get; init; } = string.Empty;
    public string            Zip     { get; init; } = string.Empty;
    public List<HoleResponse> Holes  { get; init; } = new();
}

/// <summary>Per-hole detail within CourseResponse.</summary>
public record HoleResponse
{
    public Guid   Id             { get; init; }
    public short  HoleNumber     { get; init; }
    public short  Par            { get; init; }
    public short  HandicapIndex  { get; init; }
    public int?   YardageWhite   { get; init; }
    public int?   YardageBlue    { get; init; }
    public int?   YardageRed     { get; init; }
}

/// <summary>
/// Leaderboard entry.  Returned by GET /events/{id}/leaderboard.
/// One row per team, sorted by toPar ascending (best score first).
/// </summary>
public record LeaderboardEntryResponse
{
    public int     Rank           { get; init; }
    public Guid    TeamId         { get; init; }
    public string  TeamName       { get; init; } = string.Empty;

    /// <summary>
    /// Total score relative to par.
    /// Negative = under par (good).  e.g. -4 means 4 under par.
    /// "E" (even) = 0.  Displayed as "+n" when positive.
    /// </summary>
    public int     ToPar          { get; init; }

    /// <summary>Sum of all gross scores entered so far.</summary>
    public int     GrossTotal     { get; init; }

    /// <summary>How many holes have a score recorded.</summary>
    public int     HolesComplete  { get; init; }

    /// <summary>True when all holes in the event have a score.</summary>
    public bool    IsComplete      { get; init; }

    /// <summary>
    /// Stableford points total. Only meaningful for Stableford-format events.
    /// Formula per hole: max(0, par - gross + 2). Higher = better.
    /// </summary>
    public int     StablefordPoints { get; init; }

    /// <summary>The team's starting hole (shotgun) or tee time, for display.</summary>
    public short?  StartingHole   { get; init; }
    public DateTime? TeeTime      { get; init; }
}

/// <summary>
/// Fundraising totals.  Returned by GET /events/{id}/fundraising.
/// Shown on the admin dashboard fundraising thermometer.
/// </summary>
public record FundraisingResponse
{
    /// <summary>Sum of entry fees for teams that have paid (in cents).</summary>
    public int EntryFeesCents   { get; init; }

    /// <summary>Sum of all recorded donations (in cents).</summary>
    public int DonationsCents   { get; init; }

    /// <summary>Total of all revenue streams (in cents).</summary>
    public int GrandTotalCents  { get; init; }

    public int TeamsPaid        { get; init; }
    public int TeamsTotal       { get; init; }
    public int DonationCount    { get; init; }
}

/// <summary>
/// Public landing page data.  Returned by GET /api/v1/pub/events/{eventCode}.
/// No authentication required.  Only safe public fields are included.
/// Used by the Next.js SSR landing page and the QR-linked donation widget.
/// </summary>
public record PublicEventResponse
{
    public Guid      Id              { get; init; }
    public string    Name            { get; init; } = string.Empty;
    public string    EventCode       { get; init; } = string.Empty;
    public string    OrgName         { get; init; } = string.Empty;
    public string    OrgSlug         { get; init; } = string.Empty;
    public string?   OrgLogoUrl      { get; init; }
    public string    Format          { get; init; } = string.Empty;
    public string    Status          { get; init; } = string.Empty;
    public DateTime? StartAt         { get; init; }

    /// <summary>Remaining team spots.  null if no max_teams configured.</summary>
    public int?      SpotsRemaining  { get; init; }

    /// <summary>Basic course info for the landing page map card.</summary>
    public PublicCourseInfo? Course  { get; init; }

    /// <summary>Sponsors filtered to those with landingPage placement enabled.</summary>
    public List<PublicSponsorInfo> Sponsors { get; init; } = new();

    /// <summary>Fundraising thermometer data for the donation widget.</summary>
    public PublicFundraisingInfo Fundraising { get; init; } = new();

    /// <summary>Whether free agent registration is open.</summary>
    public bool FreeAgentEnabled { get; init; }
}

public record PublicCourseInfo
{
    public string Name  { get; init; } = string.Empty;
    public string City  { get; init; } = string.Empty;
    public string State { get; init; } = string.Empty;
}

public record PublicSponsorInfo
{
    public string  Name    { get; init; } = string.Empty;
    public string  LogoUrl { get; init; } = string.Empty;
    public string? Tagline { get; init; }
    public string  Tier    { get; init; } = string.Empty;
}

public record PublicFundraisingInfo
{
    public int DonationsCents  { get; init; }
    public int GrandTotalCents { get; init; }
}

// ── PUBLIC LEADERBOARD ───────────────────────────────────────────────────────

/// <summary>
/// GET /api/v1/pub/events/{code}/leaderboard
/// Public (unauthenticated) leaderboard for display boards, mobile spectators,
/// and the event website. No financial data, no player emails.
/// </summary>
public record PublicLeaderboardResponse
{
    public Guid    EventId   { get; init; }
    public string  EventName { get; init; } = string.Empty;
    public string  Format    { get; init; } = string.Empty;
    public string  Status    { get; init; } = string.Empty;
    public List<PublicLeaderboardEntry> Standings { get; init; } = new();
}

public record PublicLeaderboardEntry
{
    public int     Rank             { get; init; }
    public string  TeamName         { get; init; } = string.Empty;
    public int     ToPar            { get; init; }
    public int     GrossTotal       { get; init; }
    public int     StablefordPoints { get; init; }
    public int     HolesComplete    { get; init; }
    public bool    IsComplete       { get; init; }
}

// ── PUBLIC CHALLENGES ────────────────────────────────────────────────────────

/// <summary>
/// GET /api/v1/pub/events/{code}/challenges
/// Returns all hole challenges and their current results for the live view.
/// </summary>
public record PublicChallengesResponse
{
    public List<PublicChallengeDto> Challenges { get; init; } = new();
}

public record PublicChallengeDto
{
    public Guid    Id              { get; init; }
    public string  ChallengeType   { get; init; } = string.Empty;
    public short?  HoleNumber      { get; init; }
    public string  Description     { get; init; } = string.Empty;
    public string? PrizeDescription { get; init; }
    public string? SponsorName     { get; init; }
    public string? SponsorLogoUrl  { get; init; }
    public List<PublicChallengeResultDto> Results { get; init; } = new();
}

public record PublicChallengeResultDto
{
    public string  TeamName   { get; init; } = string.Empty;
    public string? PlayerName { get; init; }
    public float? Value       { get; init; }
    public string? Notes      { get; init; }
}
