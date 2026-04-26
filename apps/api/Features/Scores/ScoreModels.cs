using System.ComponentModel.DataAnnotations;

namespace GolfFundraiserPro.Api.Features.Scores;

// ── REQUEST MODELS ─────────────────────────────────────────────────────────────

/// <summary>
/// POST /api/v1/events/{eventId}/scores
/// Admin submits a score for a team on a specific hole.
/// If a score for this team/hole already exists from the same device, it is updated.
/// If it exists from a different device with a different value, is_conflicted is set.
/// </summary>
public record SubmitScoreRequest
{
    [Required]
    public Guid TeamId { get; init; }

    [Required, Range(1, 18)]
    public short HoleNumber { get; init; }

    [Required, Range(1, 20)]
    public short GrossScore { get; init; }

    [Range(0, 10)]
    public short? Putts { get; init; }

    /// <summary>Device identifier for conflict detection. Default = admin-dashboard.</summary>
    [MaxLength(100)]
    public string DeviceId { get; init; } = "admin-dashboard";
}

/// <summary>PATCH /api/v1/events/{eventId}/scores/{id} — admin correction.</summary>
public record UpdateScoreRequest
{
    [Range(1, 20)]
    public short? GrossScore { get; init; }

    [Range(0, 10)]
    public short? Putts { get; init; }
}

/// <summary>
/// POST /api/v1/events/{eventId}/scores/{id}/resolve
/// Admin accepts one of the conflicting scores and clears the conflict flag.
/// </summary>
public record ResolveConflictRequest
{
    [Required, Range(1, 20)]
    public short AcceptedScore { get; init; }

    [MaxLength(500)]
    public string? ResolutionNote { get; init; }
}

// ── RESPONSE MODELS ────────────────────────────────────────────────────────────

public record ScoreResponse
{
    public Guid     Id           { get; init; }
    public Guid     EventId      { get; init; }
    public Guid     TeamId       { get; init; }
    public string   TeamName     { get; init; } = string.Empty;
    public short    HoleNumber   { get; init; }
    public short    GrossScore   { get; init; }
    public short?   Putts        { get; init; }
    public string   DeviceId     { get; init; } = string.Empty;
    public DateTime SubmittedAt  { get; init; }
    public DateTime? SyncedAt   { get; init; }
    public string   Source       { get; init; } = string.Empty;
    public bool     IsConflicted { get; init; }
}

/// <summary>
/// Full scorecard for a team: one row per hole with par + score side by side.
/// Used by the admin scorecard view and the leaderboard detail panel.
/// </summary>
public record ScorecardResponse
{
    public Guid   TeamId        { get; init; }
    public string TeamName      { get; init; } = string.Empty;
    public List<ScorecardHoleEntry> Holes { get; init; } = new();
    public int    GrossTotal    { get; init; }
    public int    ParTotal      { get; init; }
    public int    ToPar         { get; init; }
    public int    HolesComplete { get; init; }
    public bool   HasConflicts  { get; init; }
}

public record ScorecardHoleEntry
{
    public short  HoleNumber  { get; init; }
    public short  Par         { get; init; }
    public short? GrossScore  { get; init; }
    public short? Putts       { get; init; }
    public bool   HasConflict { get; init; }
}
