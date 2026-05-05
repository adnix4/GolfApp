namespace GolfFundraiserPro.Api.Features.SuperAdmin;

public record OrgAdminDto
{
    public Guid     Id         { get; init; }
    public string   Name       { get; init; } = string.Empty;
    public string   Slug       { get; init; } = string.Empty;
    public bool     Is501c3    { get; init; }
    public int      EventCount { get; init; }
    public DateTime CreatedAt  { get; init; }
}

public record AllEventDto
{
    public Guid    Id        { get; init; }
    public string  Name      { get; init; } = string.Empty;
    public string  Status    { get; init; } = string.Empty;
    public string  EventCode { get; init; } = string.Empty;
    public Guid    OrgId     { get; init; }
    public string  OrgName   { get; init; } = string.Empty;
    public string  OrgSlug   { get; init; } = string.Empty;
    public int     TeamCount { get; init; }
    public DateTime? StartAt { get; init; }
}
