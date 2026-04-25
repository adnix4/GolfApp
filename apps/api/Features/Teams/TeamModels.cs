// ─────────────────────────────────────────────────────────────────────────────
// Features/Teams/TeamModels.cs — Request & Response Models for Team Endpoints
// ─────────────────────────────────────────────────────────────────────────────
//
// THREE REGISTRATION MODES (spec Phase 1 §5):
//
//   MODE 1 — FULL TEAM (captain registers everyone at once)
//     POST /api/v1/events/{id}/register/team
//     Body: team name + array of player objects (2–4 players)
//     Creates: one Team + N Players (RegistrationType = FullTeam)
//     Sends:   registration_confirm email to each player
//
//   MODE 2 — INDIVIDUAL JOIN (player joins an existing team via invite link)
//     POST /api/v1/events/{id}/register/join
//     Body: invite token + player info
//     Creates: one Player (RegistrationType = IndividualJoin) on the invited team
//     Sends:   registration_confirm email to the new player
//
//   MODE 3 — FREE AGENT (solo player enters the pool, awaiting assignment)
//     POST /api/v1/events/{id}/register/free-agent
//     Body: player info + optional skill/age/pairing note
//     Creates: one Player (RegistrationType = FreeAgent) with TeamId = null
//     Sends:   registration_confirm email acknowledging free agent status
//
// INVITE TOKEN FLOW:
//   1. Captain registers (Mode 1) → team created with InviteToken + InviteExpiresAt
//   2. Captain shares the invite link: /e/{slug}/{code}/join?token={InviteToken}
//   3. Teammate opens link → frontend calls GET /teams/{id}/invite to preview team
//   4. Teammate submits form → POST /events/{id}/register/join with the token
//   5. Player added to team; if team is now full, InviteToken is cleared
// ─────────────────────────────────────────────────────────────────────────────

using System.ComponentModel.DataAnnotations;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.Teams;

// ── SHARED PLAYER INPUT ───────────────────────────────────────────────────────

/// <summary>
/// Player info used in all three registration modes.
/// Reused across RegisterTeamRequest, JoinTeamRequest, and RegisterFreeAgentRequest.
/// </summary>
public record PlayerInput
{
    [Required]
    [MaxLength(100)]
    public string FirstName { get; init; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string LastName { get; init; } = string.Empty;

    [Required]
    [EmailAddress]
    [MaxLength(254)]
    public string Email { get; init; } = string.Empty;

    [MaxLength(30)]
    public string? Phone { get; init; }

    /// <summary>
    /// USGA handicap index. e.g. 14.2
    /// Optional — most charity golfers don't have an official handicap.
    /// Used by the free agent auto-pair algorithm when available.
    /// </summary>
    [Range(0.0, 54.0)]
    public double? HandicapIndex { get; init; }
}

// ── MODE 1: FULL TEAM REGISTRATION ───────────────────────────────────────────

/// <summary>
/// POST /api/v1/events/{id}/register/team
/// The captain registers the full team in one call.
/// Minimum 1 player (the captain); maximum is the team's max_players setting (default 4).
/// </summary>
public record RegisterTeamRequest
{
    /// <summary>
    /// Team display name shown on the leaderboard and admin panels.
    /// e.g. "The Bogey Brothers"
    /// </summary>
    [Required]
    [MaxLength(200)]
    public string TeamName { get; init; } = string.Empty;

    /// <summary>
    /// The players on this team.  At least 1 required (the captain themselves).
    /// The first player in the array is treated as the team captain.
    /// </summary>
    [Required]
    [MinLength(1)]
    public List<PlayerInput> Players { get; init; } = new();

    /// <summary>
    /// Optional override for max players on this specific team.
    /// If null, uses the event's default (4).
    /// Must not exceed the event's configured max_players.
    /// </summary>
    [Range(1, 8)]
    public short? MaxPlayers { get; init; }
}

// ── MODE 2: INDIVIDUAL JOIN ───────────────────────────────────────────────────

/// <summary>
/// POST /api/v1/events/{id}/register/join
/// A player joins an existing team using the invite token from the team invite link.
/// The token is validated for: existence, expiry, and team not full.
/// </summary>
public record JoinTeamRequest
{
    /// <summary>
    /// The invite token from the team's invite link query parameter.
    /// Format: HMAC-SHA256 signed token stored on the team record.
    /// Expires after 48 hours.
    /// </summary>
    [Required]
    public string InviteToken { get; init; } = string.Empty;

    /// <summary>The player joining the team.</summary>
    [Required]
    public PlayerInput Player { get; init; } = new();
}

// ── MODE 3: FREE AGENT REGISTRATION ──────────────────────────────────────────

/// <summary>
/// POST /api/v1/events/{id}/register/free-agent
/// A solo player enters the free agent pool without a team.
/// The organizer can assign them to a team via the Free Agent Board.
/// </summary>
public record RegisterFreeAgentRequest
{
    [Required]
    public PlayerInput Player { get; init; } = new();

    /// <summary>
    /// Self-reported skill level for auto-pair matching.
    /// The auto-pair algorithm groups players by skill then age for balanced teams.
    /// </summary>
    public SkillLevel? SkillLevel { get; init; }

    /// <summary>Self-reported age group for auto-pair matching.</summary>
    public AgeGroup? AgeGroup { get; init; }

    /// <summary>
    /// Free-text note visible to the organizer on the Free Agent Board.
    /// e.g. "I know the Johnson family — please pair me with them if possible."
    /// </summary>
    [MaxLength(500)]
    public string? PairingNote { get; init; }
}

// ── ADMIN: FREE AGENT ASSIGNMENT ──────────────────────────────────────────────

/// <summary>
/// POST /api/v1/events/{id}/free-agents/assign
/// Admin manually assigns a free agent to an existing team.
/// </summary>
public record AssignFreeAgentRequest
{
    [Required]
    public Guid PlayerId { get; init; }

    [Required]
    public Guid TeamId { get; init; }
}

/// <summary>
/// POST /api/v1/events/{id}/free-agents/auto-pair
/// Admin triggers the auto-pair algorithm to assign ALL unassigned free agents
/// to teams in one operation.
///
/// ALGORITHM (spec Phase 1 §5.3):
///   1. Sort free agents by handicap index (lowest = best) — null handicaps last
///   2. Group by skill level (Competitive → Advanced → Intermediate → Beginner)
///   3. Snake-draft into teams of max_players (default 4):
///      Team 1 gets pick 1, Team 2 gets pick 2, ..., last team gets last pick,
///      then reverses (snake) to balance team quality.
///   4. Age group used as tiebreaker within skill groups.
///   5. Walk-up players (added same-day) are excluded from auto-pair.
/// </summary>
public record AutoPairRequest
{
    /// <summary>
    /// Target players per team.  Defaults to event's max_players setting (4).
    /// Must be between 2 and 8.
    /// </summary>
    [Range(2, 8)]
    public short? PlayersPerTeam { get; init; }

    /// <summary>
    /// If true, existing partial teams that have room are filled first
    /// before creating new teams.  Default: true.
    /// </summary>
    public bool FillExistingTeams { get; init; } = true;

    /// <summary>
    /// Prefix for auto-generated team names.
    /// e.g. "Free Agent Team" → "Free Agent Team 1", "Free Agent Team 2"
    /// Defaults to "Team".
    /// </summary>
    [MaxLength(50)]
    public string TeamNamePrefix { get; init; } = "Team";
}

// ── TEAM MANAGEMENT ───────────────────────────────────────────────────────────

/// <summary>
/// PATCH /api/v1/teams/{id}
/// Admin updates a team (name, entry fee status).
/// </summary>
public record UpdateTeamRequest
{
    [MaxLength(200)]
    public string? Name { get; init; }

    /// <summary>Mark the team's entry fee as paid or unpaid.</summary>
    public bool? EntryFeePaid { get; init; }

    /// <summary>Override max players for this team.</summary>
    [Range(1, 8)]
    public short? MaxPlayers { get; init; }
}

/// <summary>
/// POST /api/v1/teams/{id}/invite/regenerate
/// Regenerates the invite token for a team (e.g. if it expired or was compromised).
/// Returns the new invite URL.
/// </summary>
public record RegenerateInviteResponse
{
    public string InviteToken   { get; init; } = string.Empty;
    public string InviteUrl     { get; init; } = string.Empty;
    public DateTime ExpiresAt   { get; init; }
}

// ── RESPONSE MODELS ───────────────────────────────────────────────────────────

/// <summary>
/// Full team detail with player roster.
/// Returned after registration and by GET /teams/{id}.
/// </summary>
public record TeamResponse
{
    public Guid    Id              { get; init; }
    public Guid    EventId         { get; init; }
    public string  Name            { get; init; } = string.Empty;
    public Guid?   CaptainPlayerId { get; init; }
    public short?  StartingHole    { get; init; }
    public DateTime? TeeTime       { get; init; }
    public bool    EntryFeePaid    { get; init; }
    public short   MaxPlayers      { get; init; }
    public string  CheckInStatus   { get; init; } = string.Empty;
    public bool    HasInviteLink   { get; init; }
    public DateTime? InviteExpiresAt { get; init; }
    public List<PlayerResponse> Players { get; init; } = new();
}

/// <summary>
/// Player detail within a TeamResponse or as a standalone response.
/// </summary>
public record PlayerResponse
{
    public Guid    Id               { get; init; }
    public Guid?   TeamId           { get; init; }
    public Guid    EventId          { get; init; }
    public string  FirstName        { get; init; } = string.Empty;
    public string  LastName         { get; init; } = string.Empty;
    public string  Email            { get; init; } = string.Empty;
    public string? Phone            { get; init; }
    public double? HandicapIndex    { get; init; }
    public string  RegistrationType { get; init; } = string.Empty;
    public string? SkillLevel       { get; init; }
    public string? AgeGroup         { get; init; }
    public string? PairingNote      { get; init; }
    public string  CheckInStatus    { get; init; } = string.Empty;
    public DateTime? CheckInAt      { get; init; }
}

/// <summary>
/// Invite preview — returned by GET /teams/{id}/invite?token={token}
/// Lets the joining player see the team before committing.
/// </summary>
public record TeamInvitePreviewResponse
{
    public Guid   TeamId    { get; init; }
    public string TeamName  { get; init; } = string.Empty;
    public string EventName { get; init; } = string.Empty;
    /// <summary>Current roster (names only — emails not exposed pre-join).</summary>
    public List<string> PlayerNames  { get; init; } = new();
    public int    SpotsRemaining     { get; init; }
    public bool   IsFull             { get; init; }
}

/// <summary>
/// Registration confirmation — returned after any of the three registration modes.
/// Contains enough info for the frontend to show a confirmation screen.
/// </summary>
public record RegistrationConfirmResponse
{
    public TeamResponse Team         { get; init; } = new();
    /// <summary>The player that was just registered (for Mode 2 and 3).</summary>
    public PlayerResponse? Player    { get; init; }
    /// <summary>Invite URL to share with teammates (Mode 1 only).</summary>
    public string? InviteUrl         { get; init; }
    public string  Message           { get; init; } = string.Empty;
}

/// <summary>
/// Free agent list item for the Free Agent Board kanban.
/// </summary>
public record FreeAgentResponse
{
    public Guid    Id               { get; init; }
    public string  FirstName        { get; init; } = string.Empty;
    public string  LastName         { get; init; } = string.Empty;
    public string  Email            { get; init; } = string.Empty;
    public double? HandicapIndex    { get; init; }
    public string? SkillLevel       { get; init; }
    public string? AgeGroup         { get; init; }
    public string? PairingNote      { get; init; }
    public string  CheckInStatus    { get; init; } = string.Empty;
    public DateTime RegisteredAt    { get; init; }
}

/// <summary>
/// Result of the auto-pair operation.
/// Shows what was created so the admin can review before confirming.
/// </summary>
public record AutoPairResultResponse
{
    /// <summary>Teams created or modified by the auto-pair run.</summary>
    public List<TeamResponse> Teams          { get; init; } = new();
    public int                AgentsAssigned { get; init; }
    public int                TeamsCreated   { get; init; }
    public int                TeamsModified  { get; init; }
    /// <summary>Any agents that couldn't be placed (e.g. odd numbers).</summary>
    public List<FreeAgentResponse> Unassigned { get; init; } = new();
}
