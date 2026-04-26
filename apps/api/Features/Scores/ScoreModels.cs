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

/// <summary>
/// POST /api/v1/events/{eventId}/scores/qr-collect
/// Admin submits a QR-scanned scorecard payload after scanning a golfer's phone at the 18th green.
/// The payload is a Base64-encoded, HMAC-SHA256-signed JSON object (spec Phase 2 §5.2).
///
/// SIGNING KEY: UTF-8 bytes of "{event_code}:{team_id}"
/// SIGNED MESSAGE: compact JSON of the payload with all fields EXCEPT "sig", keys in definition order.
/// ALGORITHM: HMAC-SHA256
/// </summary>
public record QrCollectRequest
{
    /// <summary>
    /// Base64-encoded QR payload string. The mobile app generates this at round end.
    /// The API decodes it, verifies the HMAC signature, and imports the scores.
    /// </summary>
    [Required]
    public string Payload { get; init; } = string.Empty;
}

/// <summary>Summary of scores imported from a QR scorecard scan.</summary>
public record QrCollectResponse
{
    public Guid   TeamId       { get; init; }
    public string TeamName     { get; init; } = string.Empty;
    public int    ScoresImported { get; init; }
    public int    Conflicts    { get; init; }
    public List<QrCollectConflictDto> ConflictDetails { get; init; } = new();
}

public record QrCollectConflictDto
{
    public short  HoleNumber     { get; init; }
    public short  ExistingScore  { get; init; }
    public short  QrScore        { get; init; }
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
