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

    [HttpGet("api/v1/orgs/me")]
    [Authorize(Policy = "OrgAdmin")]
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

    private Guid GetOrgId()
    {
        var claim = User.FindFirst("orgId")?.Value;
        if (string.IsNullOrWhiteSpace(claim) || !Guid.TryParse(claim, out var orgId))
            throw new ForbiddenException("Your account is not associated with an organization.");
        return orgId;
    }
}
