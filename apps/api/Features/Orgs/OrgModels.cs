namespace GolfFundraiserPro.Api.Features.Orgs;

public record OrgResponse
{
    public Guid    Id               { get; init; }
    public string  Name             { get; init; } = string.Empty;
    public string  Slug             { get; init; } = string.Empty;
    public string? LogoUrl          { get; init; }
    public string? MissionStatement { get; init; }
    public bool    Is501c3          { get; init; }
    public string? ThemeJson        { get; init; }
    public DateTime CreatedAt       { get; init; }
}

/// <summary>
/// PATCH /api/v1/orgs/me — all fields optional; only provided fields are updated.
/// ThemeJson must be a valid GFPTheme JSON object; primary/surface pair must pass WCAG AA.
/// </summary>
public record UpdateOrgRequest
{
    public string? Name             { get; init; }
    public string? LogoUrl          { get; init; }
    public string? MissionStatement { get; init; }
    public bool?   Is501c3          { get; init; }
    public string? ThemeJson        { get; init; }
}

/// <summary>POST /api/v1/orgs/me/logo response.</summary>
public record LogoUploadResponse
{
    /// <summary>Root-relative URL e.g. /uploads/logos/org-id.png</summary>
    public string LogoUrl { get; init; } = string.Empty;
    /// <summary>Absolute URL including scheme+host for convenience.</summary>
    public string FullUrl { get; init; } = string.Empty;
}
