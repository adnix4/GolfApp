using System.ComponentModel.DataAnnotations;

namespace GolfFundraiserPro.Api.Features.Mobile;

// ── REQUEST MODELS ─────────────────────────────────────────────────────────────

/// <summary>
/// POST /api/v1/events/{eventCode}/join
/// Golfer identifies themselves by email against a pre-registered player record.
/// Returns the full event_cache payload the mobile app stores in SQLite at round start.
/// </summary>
public record JoinEventRequest
{
    /// <summary>Email the golfer registered with. Used to look up their player record.</summary>
    [Required]
    [EmailAddress]
    [MaxLength(254)]
    public string Email { get; init; } = string.Empty;

    /// <summary>Stable device identifier for score conflict detection.</summary>
    [MaxLength(100)]
    public string DeviceId { get; init; } = "mobile-app";
}

/// <summary>
/// POST /api/v1/sync/scores
/// Mobile app submits a batch of pending scores that were queued in SQLite while offline.
/// Each item is processed independently — partial success is allowed.
/// The API returns a conflict list for any holes where two devices disagree.
/// </summary>
public record BatchSyncRequest
{
    [Required]
    public Guid EventId { get; init; }

    [Required]
    public Guid TeamId { get; init; }

    [MaxLength(100)]
    public string DeviceId { get; init; } = "mobile-app";

    [Required]
    [MinLength(1)]
    public List<PendingScoreInput> Scores { get; init; } = new();
}

/// <summary>One queued score from the mobile app's pending_scores SQLite table.</summary>
public record PendingScoreInput
{
    [Required, Range(1, 18)]
    public short HoleNumber { get; init; }

    [Required, Range(1, 20)]
    public short GrossScore { get; init; }

    [Range(0, 10)]
    public short? Putts { get; init; }

    /// <summary>
    /// Per-player shot breakdown: { "player-uuid": drivesUsed }.
    /// Stored in scores.player_shots JSONB. Null if not tracked.
    /// </summary>
    public string? PlayerShotsJson { get; init; }

    /// <summary>Unix ms timestamp when the score was first written to SQLite on-device.</summary>
    public long? ClientTimestampMs { get; init; }
}

// ── RESPONSE MODELS ───────────────────────────────────────────────────────────

/// <summary>
/// Response to POST /events/{eventCode}/join.
/// Contains everything the mobile app needs to pre-populate its SQLite event_cache
/// so scoring can proceed fully offline.
/// </summary>
public record JoinEventResponse
{
    public EventCacheDto          Event   { get; init; } = null!;
    public TeamCacheDto           Team    { get; init; } = null!;
    public PlayerCacheDto         Player  { get; init; } = null!;
    public OrgCacheDto            Org     { get; init; } = null!;
    public CourseCacheDto?        Course  { get; init; }
    public List<SponsorCacheDto>  Sponsors { get; init; } = new();
}

public record EventCacheDto
{
    public Guid      Id        { get; init; }
    public string    Name      { get; init; } = string.Empty;
    public string    EventCode { get; init; } = string.Empty;
    public string    Format    { get; init; } = string.Empty;
    public string    StartType { get; init; } = string.Empty;
    public short     Holes     { get; init; }
    public string    Status    { get; init; } = string.Empty;
    public DateTime? StartAt   { get; init; }
}

public record TeamCacheDto
{
    public Guid              Id           { get; init; }
    public string            Name         { get; init; } = string.Empty;
    public short?            StartingHole { get; init; }
    public DateTime?         TeeTime      { get; init; }
    public List<PlayerCacheDto> Players   { get; init; } = new();
}

public record PlayerCacheDto
{
    public Guid   Id        { get; init; }
    public string FirstName { get; init; } = string.Empty;
    public string LastName  { get; init; } = string.Empty;
    public string Email     { get; init; } = string.Empty;
}

public record OrgCacheDto
{
    public Guid    Id        { get; init; }
    public string  Name      { get; init; } = string.Empty;
    public string  Slug      { get; init; } = string.Empty;
    public string? LogoUrl   { get; init; }
    /// <summary>Raw theme JSONB — the mobile app reads this into ThemeContext.</summary>
    public string? ThemeJson { get; init; }
}

public record CourseCacheDto
{
    public Guid              Id    { get; init; }
    public string            Name  { get; init; } = string.Empty;
    public string            City  { get; init; } = string.Empty;
    public string            State { get; init; } = string.Empty;
    public List<HoleCacheDto> Holes { get; init; } = new();
}

public record HoleCacheDto
{
    public short  HoleNumber    { get; init; }
    public short  Par           { get; init; }
    public short  HandicapIndex { get; init; }
    public int?   YardageWhite  { get; init; }
    public int?   YardageBlue   { get; init; }
    public int?   YardageRed    { get; init; }
    /// <summary>
    /// Hole-sponsor name shown at the top of the hole screen on the mobile scorecard.
    /// Null if no hole sponsor is configured for this hole number.
    /// </summary>
    public string? SponsorName    { get; init; }
    public string? SponsorLogoUrl { get; init; }
}

public record SponsorCacheDto
{
    public Guid         Id         { get; init; }
    public string       Name       { get; init; } = string.Empty;
    public string       LogoUrl    { get; init; } = string.Empty;
    public string?      WebsiteUrl { get; init; }
    public string       Tier       { get; init; } = string.Empty;
    /// <summary>Hole numbers this sponsor is associated with (for hole-sponsor display).</summary>
    public List<int>    HoleNumbers { get; init; } = new();
}

/// <summary>Response to POST /api/v1/sync/scores.</summary>
public record BatchSyncResponse
{
    /// <summary>Number of scores successfully written to the server.</summary>
    public int Accepted { get; init; }

    /// <summary>
    /// Number of scores that were skipped because a conflict was detected.
    /// The admin dashboard will surface these for manual resolution.
    /// </summary>
    public int Conflicts { get; init; }

    /// <summary>Per-hole detail for any conflicting scores.</summary>
    public List<SyncConflictDto> ConflictDetails { get; init; } = new();
}

public record SyncConflictDto
{
    public short  HoleNumber      { get; init; }
    public short  ExistingScore   { get; init; }
    public short  SubmittedScore  { get; init; }
    public string ExistingDeviceId { get; init; } = string.Empty;
}
