using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Data;

namespace GolfFundraiserPro.Api.Features.SuperAdmin;

[ApiController]
[Route("api/v1/super-admin")]
[Authorize(Roles = "SuperAdmin")]
[Tags("Super Admin")]
public class SuperAdminController : ControllerBase
{
    private readonly ApplicationDbContext _db;

    public SuperAdminController(ApplicationDbContext db) => _db = db;

    /// <summary>
    /// Returns all organizations with event counts.
    /// Only accessible to SuperAdmin users.
    /// </summary>
    [HttpGet("organizations")]
    [ProducesResponseType(typeof(List<OrgAdminDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<OrgAdminDto>>> GetOrganizations(CancellationToken ct)
    {
        var orgs = await _db.Organizations
            .Where(o => o.Slug != "gfp-platform-admin")
            .Select(o => new OrgAdminDto
            {
                Id         = o.Id,
                Name       = o.Name,
                Slug       = o.Slug,
                Is501c3    = o.Is501c3,
                EventCount = o.Events.Count,
                CreatedAt  = o.CreatedAt,
            })
            .OrderBy(o => o.Name)
            .ToListAsync(ct);

        return Ok(orgs);
    }

    /// <summary>
    /// Returns all events across all organizations.
    /// Only accessible to SuperAdmin users.
    /// </summary>
    [HttpGet("events")]
    [ProducesResponseType(typeof(List<AllEventDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<AllEventDto>>> GetAllEvents(CancellationToken ct)
    {
        var events = await _db.Events
            .Where(e => e.Organization.Slug != "gfp-platform-admin")
            .Select(e => new AllEventDto
            {
                Id        = e.Id,
                Name      = e.Name,
                Status    = e.Status.ToString(),
                EventCode = e.EventCode,
                OrgId     = e.OrgId,
                OrgName   = e.Organization.Name,
                OrgSlug   = e.Organization.Slug,
                TeamCount = e.Teams.Count,
                StartAt   = e.StartAt,
            })
            .OrderByDescending(e => e.StartAt)
            .ToListAsync(ct);

        return Ok(events);
    }
}
