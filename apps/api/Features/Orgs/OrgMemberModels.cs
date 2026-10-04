using System.ComponentModel.DataAnnotations;

namespace GolfFundraiserPro.Api.Features.Orgs;

// ── Org members and staff invites (problemList D20) ─────────────────────────

public record CreateInviteRequest
{
    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; init; } = string.Empty;

    /// <summary>"EventStaff" (desk volunteer, the default) or "OrgAdmin" (co-organizer).</summary>
    [MaxLength(32)]
    public string Role { get; init; } = "EventStaff";
}

public record OrgMemberDto
{
    public string UserId      { get; init; } = string.Empty;
    public string Email       { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public string Role        { get; init; } = string.Empty;
    /// <summary>True for the signed-in user, who cannot remove themselves.</summary>
    public bool   IsYou       { get; init; }
}

public record OrgInviteDto
{
    public Guid     Id        { get; init; }
    public string   Email     { get; init; } = string.Empty;
    public string   Role      { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
    public DateTime ExpiresAt { get; init; }
}

public record OrgMembersResponse
{
    public List<OrgMemberDto> Members { get; init; } = new();
    /// <summary>Invites not yet accepted, revoked or expired.</summary>
    public List<OrgInviteDto> Invites { get; init; } = new();
}

public record CreateInviteResponse
{
    public OrgInviteDto Invite { get; init; } = new();
    /// <summary>
    /// The accept link. Returned to the organizer so it can be shared directly
    /// when email is not set up or does not arrive; it is the organizer's own
    /// invite, so handing it back discloses nothing new.
    /// </summary>
    public string InviteUrl { get; init; } = string.Empty;
    public bool   EmailSent { get; init; }
}
