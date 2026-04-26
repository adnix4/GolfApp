using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.Sponsors;

// ── SPONSORS ──────────────────────────────────────────────────────────────────

public record CreateSponsorRequest
{
    [Required, MaxLength(200)]
    public string Name { get; init; } = string.Empty;

    [Required, MaxLength(500)]
    public string LogoUrl { get; init; } = string.Empty;

    [MaxLength(500)]
    public string? WebsiteUrl { get; init; }

    [MaxLength(200)]
    public string? Tagline { get; init; }

    [Required]
    public SponsorTier Tier { get; init; }

    /// <summary>
    /// Controls where this sponsor's logo appears.
    /// e.g. { "leaderboard": true, "landingPage": true, "holeNumbers": [7, 14] }
    /// </summary>
    public SponsorPlacementsDto Placements { get; init; } = new();
}

public record UpdateSponsorRequest
{
    [MaxLength(200)] public string? Name       { get; init; }
    [MaxLength(500)] public string? LogoUrl    { get; init; }
    [MaxLength(500)] public string? WebsiteUrl { get; init; }
    [MaxLength(200)] public string? Tagline    { get; init; }
    public SponsorTier?         Tier       { get; init; }
    public SponsorPlacementsDto? Placements { get; init; }
}

public class SponsorPlacementsDto
{
    [JsonPropertyName("leaderboard")]  public bool? Leaderboard  { get; set; }
    [JsonPropertyName("landingPage")]  public bool? LandingPage  { get; set; }
    [JsonPropertyName("emailHeader")]  public bool? EmailHeader  { get; set; }
    [JsonPropertyName("holeNumbers")] public List<int>? HoleNumbers { get; set; }
}

public record SponsorResponse
{
    public Guid   Id         { get; init; }
    public Guid   EventId    { get; init; }
    public string Name       { get; init; } = string.Empty;
    public string LogoUrl    { get; init; } = string.Empty;
    public string? WebsiteUrl { get; init; }
    public string? Tagline   { get; init; }
    public string Tier       { get; init; } = string.Empty;
    public SponsorPlacementsDto Placements { get; init; } = new();
}

// ── HOLE CHALLENGES ───────────────────────────────────────────────────────────

public record CreateChallengeRequest
{
    /// <summary>Hole number 1–18. Null = all-day challenge (e.g. hole-in-one on any hole).</summary>
    [Range(1, 18)]
    public short? HoleNumber { get; init; }

    [Required]
    public ChallengeType ChallengeType { get; init; }

    [Required, MaxLength(500)]
    public string Description { get; init; } = string.Empty;

    [MaxLength(500)]
    public string? PrizeDescription { get; init; }

    /// <summary>Optional sponsor funding this challenge's prize.</summary>
    public Guid? SponsorId { get; init; }
}

public record UpdateChallengeRequest
{
    [Range(1, 18)]
    public short? HoleNumber { get; init; }
    public ChallengeType? ChallengeType { get; init; }
    [MaxLength(500)] public string? Description      { get; init; }
    [MaxLength(500)] public string? PrizeDescription { get; init; }
    public Guid? SponsorId { get; init; }
}

public record ChallengeResponse
{
    public Guid    Id               { get; init; }
    public Guid    EventId          { get; init; }
    public short?  HoleNumber       { get; init; }
    public string  ChallengeType    { get; init; } = string.Empty;
    public string  Description      { get; init; } = string.Empty;
    public string? PrizeDescription { get; init; }
    public Guid?   SponsorId        { get; init; }
    public string? SponsorName      { get; init; }
    public List<ChallengeResultResponse> Results { get; init; } = new();
}

// ── CHALLENGE RESULTS ─────────────────────────────────────────────────────────

public record RecordChallengeResultRequest
{
    [Required]
    public Guid TeamId { get; init; }

    public Guid? PlayerId { get; init; }

    /// <summary>
    /// Numeric result value. Semantics depend on challenge type:
    ///   closest_to_pin / longest_drive → distance in yards
    ///   putting → total putts
    /// </summary>
    public float? ResultValue { get; init; }

    [MaxLength(500)]
    public string? ResultNotes { get; init; }
}

public record ChallengeResultResponse
{
    public Guid      Id            { get; init; }
    public Guid      ChallengeId   { get; init; }
    public Guid      TeamId        { get; init; }
    public string    TeamName      { get; init; } = string.Empty;
    public Guid?     PlayerId      { get; init; }
    public string?   PlayerName    { get; init; }
    public float?    ResultValue   { get; init; }
    public string?   ResultNotes   { get; init; }
    public DateTime  RecordedAt    { get; init; }
}

// ── DONATIONS ─────────────────────────────────────────────────────────────────

public record RecordDonationRequest
{
    [Required, MaxLength(200)]
    public string DonorName { get; init; } = string.Empty;

    [Required, EmailAddress, MaxLength(254)]
    public string DonorEmail { get; init; } = string.Empty;

    /// <summary>Donation amount in US cents. e.g. $50 = 5000.</summary>
    [Required, Range(100, 10_000_000)]
    public int AmountCents { get; init; }
}

public record UpdateDonationRequest
{
    [MaxLength(200)] public string? DonorName  { get; init; }
    [EmailAddress, MaxLength(254)] public string? DonorEmail { get; init; }
    [Range(100, 10_000_000)] public int? AmountCents { get; init; }
    public bool? ReceiptSent { get; init; }
}

public record DonationResponse
{
    public Guid     Id          { get; init; }
    public Guid     EventId     { get; init; }
    public string   DonorName   { get; init; } = string.Empty;
    public string   DonorEmail  { get; init; } = string.Empty;
    public int      AmountCents { get; init; }
    public bool     ReceiptSent { get; init; }
    public DateTime CreatedAt   { get; init; }
}
