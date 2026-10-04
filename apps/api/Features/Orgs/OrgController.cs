using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using GolfFundraiserPro.Api.Common.Middleware;

namespace GolfFundraiserPro.Api.Features.Orgs;

[ApiController]
[Tags("Organization")]
public class OrgController : ControllerBase
{
    private readonly OrgService _orgService;

    public OrgController(OrgService orgService)
    {
        _orgService = orgService;
    }

    // EventStaff can READ the org (D20): the admin app loads it on every page
    // for the org name and color theme. Changing it stays OrgAdmin-only.
    [HttpGet("api/v1/orgs/me")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(OrgResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<OrgResponse>> GetMyOrg(CancellationToken ct)
        => Ok(await _orgService.GetAsync(GetOrgId(), ct));

    [HttpPatch("api/v1/orgs/me")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(OrgResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<OrgResponse>> UpdateMyOrg(
        [FromBody] UpdateOrgRequest request,
        CancellationToken ct)
        => Ok(await _orgService.UpdateAsync(GetOrgId(), request, ct));

    /// <summary>
    /// POST /api/v1/orgs/me/logo — upload a logo image (PNG/JPEG/SVG/WebP, max 2 MB).
    /// Stores the file via IFileStorage and returns the public URL.
    /// The URL is also saved to the org record automatically.
    /// </summary>
    [HttpPost("api/v1/orgs/me/logo")]
    [Authorize(Policy = "OrgAdmin")]
    [Consumes("multipart/form-data")]
    [ProducesResponseType(typeof(LogoUploadResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<LogoUploadResponse>> UploadLogo(
        IFormFile file,
        CancellationToken ct)
    {
        var url = await _orgService.UploadLogoAsync(GetOrgId(), file, ct);
        return Ok(new LogoUploadResponse
        {
            LogoUrl    = url,
            // Blob storage returns an absolute URL; local storage a root-relative
            // one that resolves against this API host.
            FullUrl    = url.StartsWith('/') ? $"{Request.Scheme}://{Request.Host}{url}" : url,
        });
    }

    // ── MEMBERS AND STAFF INVITES (problemList D20) ──────────────────────────

    /// <summary>Everyone who can sign in to this org, plus pending invites.</summary>
    [HttpGet("api/v1/orgs/me/members")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(OrgMembersResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<OrgMembersResponse>> ListMembers(
        [FromServices] OrgMembersService members, CancellationToken ct)
        => Ok(await members.ListAsync(GetOrgId(), GetUserId(), ct));

    /// <summary>
    /// Invites someone by email as EventStaff (default) or OrgAdmin. Emails the
    /// link and also returns it, so it can be shared directly if email fails.
    /// </summary>
    [HttpPost("api/v1/orgs/me/invites")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(CreateInviteResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CreateInviteResponse>> CreateInvite(
        [FromBody] CreateInviteRequest request, [FromServices] OrgMembersService members, CancellationToken ct)
    {
        var created = await members.CreateInviteAsync(GetOrgId(), GetUserId(), request, ct);
        return StatusCode(StatusCodes.Status201Created, created);
    }

    [HttpDelete("api/v1/orgs/me/invites/{inviteId:guid}")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> RevokeInvite(
        [FromRoute] Guid inviteId, [FromServices] OrgMembersService members, CancellationToken ct)
    {
        await members.RevokeInviteAsync(GetOrgId(), inviteId, ct);
        return NoContent();
    }

    /// <summary>
    /// Removes a member: signs them out everywhere and deletes the account.
    /// Not yourself, and never the org's last organizer.
    /// </summary>
    [HttpDelete("api/v1/orgs/me/members/{userId}")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> RemoveMember(
        [FromRoute] string userId, [FromServices] OrgMembersService members, CancellationToken ct)
    {
        await members.RemoveMemberAsync(GetOrgId(), GetUserId(), userId, ct);
        return NoContent();
    }

    private string GetUserId() =>
        User.FindFirstValue(System.Security.Claims.ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")
        ?? throw new ForbiddenException("Your access token has no user id.");

    private Guid GetOrgId()
    {
        var claim = User.FindFirst("orgId")?.Value;
        if (string.IsNullOrWhiteSpace(claim) || !Guid.TryParse(claim, out var orgId))
            throw new ForbiddenException("Your account is not associated with an organization.");
        return orgId;
    }
}
