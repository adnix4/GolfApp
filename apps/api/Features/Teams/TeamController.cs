// ─────────────────────────────────────────────────────────────────────────────
// Features/Teams/TeamController.cs — Team & Registration HTTP Endpoints
// ─────────────────────────────────────────────────────────────────────────────
//
// ENDPOINTS:
//   POST /api/v1/events/{eventId}/register/team        — Mode 1: full team
//   POST /api/v1/events/{eventId}/register/join        — Mode 2: join via invite
//   POST /api/v1/events/{eventId}/register/free-agent  — Mode 3: free agent pool
//
//   GET  /api/v1/events/{eventId}/teams                — list all teams (admin)
//   GET  /api/v1/events/{eventId}/teams/{id}           — team detail (admin)
//   PATCH /api/v1/events/{eventId}/teams/{id}          — update team (admin)
//   POST /api/v1/events/{eventId}/teams/{id}/invite/regenerate — new invite link
//   GET  /api/v1/events/{eventId}/teams/{id}/invite    — invite preview (public)
//
//   GET  /api/v1/events/{eventId}/free-agents          — free agent board
//   POST /api/v1/events/{eventId}/free-agents/assign   — manual assignment
//   POST /api/v1/events/{eventId}/free-agents/auto-pair — snake-draft auto-pair
//
// AUTH NOTES:
//   Registration endpoints (register/*) are [AllowAnonymous] — the event's
//   open/closed status is enforced inside the service, not by auth middleware.
//   Admin endpoints require [Authorize(Policy = "EventStaff")] or "OrgAdmin".
// ─────────────────────────────────────────────────────────────────────────────

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common.Middleware;

namespace GolfFundraiserPro.Api.Features.Teams;

[ApiController]
[Tags("Teams & Registration")]
public class TeamController : ControllerBase
{
    private readonly TeamService _teamService;

    public TeamController(TeamService teamService)
    {
        _teamService = teamService;
    }

    // ── REGISTRATION ENDPOINTS (public — no auth required) ────────────────────

    /// <summary>
    /// Mode 1: Register a full team with all players at once.
    /// The first player in the players array is the captain.
    /// Returns a registration confirmation with the team and an invite link.
    /// </summary>
    [HttpPost("api/v1/events/{eventId:guid}/register/team")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(RegistrationConfirmResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RegistrationConfirmResponse>> RegisterTeam(
        [FromRoute] Guid eventId,
        [FromBody] RegisterTeamRequest request,
        CancellationToken ct)
    {
        var orgId    = await GetOrgIdForEventAsync(eventId, ct);
        var response = await _teamService.RegisterTeamAsync(orgId, eventId, request, ct);
        return StatusCode(StatusCodes.Status201Created, response);
    }

    /// <summary>
    /// Mode 2: Join an existing team using an invite token from the invite link.
    /// The invite token is the query parameter from the captain's shared link.
    /// </summary>
    [HttpPost("api/v1/events/{eventId:guid}/register/join")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(RegistrationConfirmResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RegistrationConfirmResponse>> JoinTeam(
        [FromRoute] Guid eventId,
        [FromBody] JoinTeamRequest request,
        CancellationToken ct)
    {
        var orgId    = await GetOrgIdForEventAsync(eventId, ct);
        var response = await _teamService.JoinTeamAsync(orgId, eventId, request, ct);
        return StatusCode(StatusCodes.Status201Created, response);
    }

    /// <summary>
    /// Mode 3: Register as a free agent (solo player, awaiting team assignment).
    /// Only available when the event has freeAgentEnabled = true in its config.
    /// </summary>
    [HttpPost("api/v1/events/{eventId:guid}/register/free-agent")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(RegistrationConfirmResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RegistrationConfirmResponse>> RegisterFreeAgent(
        [FromRoute] Guid eventId,
        [FromBody] RegisterFreeAgentRequest request,
        CancellationToken ct)
    {
        var orgId    = await GetOrgIdForEventAsync(eventId, ct);
        var response = await _teamService.RegisterFreeAgentAsync(orgId, eventId, request, ct);
        return StatusCode(StatusCodes.Status201Created, response);
    }

    // ── INVITE PREVIEW (public — token is the auth) ───────────────────────────

    /// <summary>
    /// Returns a preview of the team for the invite link landing page.
    /// Called before the player submits the join form so they can confirm the team.
    /// The invite token in the query string is the only auth required.
    /// </summary>
    [HttpGet("api/v1/events/{eventId:guid}/teams/{teamId:guid}/invite")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(TeamInvitePreviewResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TeamInvitePreviewResponse>> GetInvitePreview(
        [FromRoute] Guid eventId,
        [FromRoute] Guid teamId,
        [FromQuery] string token,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(token))
            return BadRequest(new ErrorResponse
            {
                Error = "An invite token is required.",
                Code  = "VALIDATION_ERROR",
            });

        var response = await _teamService.GetInvitePreviewAsync(eventId, token, ct);
        return Ok(response);
    }

    // ── ADMIN TEAM MANAGEMENT (requires EventStaff or OrgAdmin) ──────────────

    /// <summary>Returns all teams for an event with full player rosters.</summary>
    [HttpGet("api/v1/events/{eventId:guid}/teams")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(List<TeamResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<TeamResponse>>> GetAllTeams(
        [FromRoute] Guid eventId,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _teamService.GetAllTeamsAsync(orgId, eventId, ct);
        return Ok(response);
    }

    /// <summary>Returns a single team with its full player roster.</summary>
    [HttpGet("api/v1/events/{eventId:guid}/teams/{teamId:guid}")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(TeamResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TeamResponse>> GetTeam(
        [FromRoute] Guid eventId,
        [FromRoute] Guid teamId,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _teamService.GetTeamAsync(orgId, eventId, teamId, ct);
        return Ok(response);
    }

    /// <summary>
    /// Updates team name, entry fee status, or max player count.
    /// Only provided (non-null) fields are updated.
    /// </summary>
    [HttpPatch("api/v1/events/{eventId:guid}/teams/{teamId:guid}")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(TeamResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TeamResponse>> UpdateTeam(
        [FromRoute] Guid eventId,
        [FromRoute] Guid teamId,
        [FromBody] UpdateTeamRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _teamService.UpdateTeamAsync(orgId, eventId, teamId, request, ct);
        return Ok(response);
    }

    /// <summary>Marks a team as checked in.</summary>
    [HttpPost("api/v1/events/{eventId:guid}/teams/{teamId:guid}/check-in")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(TeamResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TeamResponse>> CheckInTeam(
        [FromRoute] Guid eventId,
        [FromRoute] Guid teamId,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _teamService.CheckInTeamAsync(orgId, eventId, teamId, ct);
        return Ok(response);
    }

    /// <summary>Marks a team's entry fee as paid.</summary>
    [HttpPost("api/v1/events/{eventId:guid}/teams/{teamId:guid}/fee-paid")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(TeamResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TeamResponse>> MarkFeePaid(
        [FromRoute] Guid eventId,
        [FromRoute] Guid teamId,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _teamService.MarkFeePaidAsync(orgId, eventId, teamId, ct);
        return Ok(response);
    }

    /// <summary>
    /// Regenerates the invite token for a team.
    /// Use this when a token has expired or needs to be invalidated.
    /// </summary>
    [HttpPost("api/v1/events/{eventId:guid}/teams/{teamId:guid}/invite/regenerate")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(RegenerateInviteResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<RegenerateInviteResponse>> RegenerateInvite(
        [FromRoute] Guid eventId,
        [FromRoute] Guid teamId,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _teamService.RegenerateInviteAsync(orgId, eventId, teamId, ct);
        return Ok(response);
    }

    // ── FREE AGENT BOARD (admin only) ─────────────────────────────────────────

    /// <summary>
    /// Returns all unassigned free agents for the Free Agent Board kanban.
    /// Sorted by skill level then handicap index for easy visual scanning.
    /// </summary>
    [HttpGet("api/v1/events/{eventId:guid}/free-agents")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(List<FreeAgentResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<FreeAgentResponse>>> GetFreeAgents(
        [FromRoute] Guid eventId,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _teamService.GetFreeAgentsAsync(orgId, eventId, ct);
        return Ok(response);
    }

    /// <summary>
    /// Manually assigns a free agent to a specific team.
    /// The player must be currently unassigned and the team must have capacity.
    /// </summary>
    [HttpPost("api/v1/events/{eventId:guid}/free-agents/assign")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(TeamResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TeamResponse>> AssignFreeAgent(
        [FromRoute] Guid eventId,
        [FromBody] AssignFreeAgentRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _teamService.AssignFreeAgentAsync(orgId, eventId, request, ct);
        return Ok(response);
    }

    /// <summary>
    /// Runs the snake-draft auto-pair algorithm on all unassigned free agents.
    /// Creates new teams and assigns agents to them in one operation.
    /// Returns a preview of what was created for admin review.
    /// </summary>
    [HttpPost("api/v1/events/{eventId:guid}/free-agents/auto-pair")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(AutoPairResultResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<AutoPairResultResponse>> AutoPair(
        [FromRoute] Guid eventId,
        [FromBody] AutoPairRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _teamService.AutoPairAsync(orgId, eventId, request, ct);
        return Ok(response);
    }

    // ── PRIVATE HELPERS ───────────────────────────────────────────────────────

    /// <summary>
    /// Reads orgId from JWT claim — used by authenticated admin endpoints.
    /// </summary>
    private Guid GetOrgId()
    {
        var claim = User.FindFirst("orgId")?.Value;
        if (string.IsNullOrWhiteSpace(claim) || !Guid.TryParse(claim, out var orgId))
            throw new ForbiddenException("Your account is not associated with an organization.");
        return orgId;
    }

    /// <summary>
    /// For public registration endpoints (no JWT), we look up the org by the event's
    /// OrgId directly. The event ID is public knowledge (it's in the URL from QR codes).
    /// </summary>
    private async Task<Guid> GetOrgIdForEventAsync(Guid eventId, CancellationToken ct)
    {
        // Inject db context for this lookup
        var httpContext = HttpContext.RequestServices;
        var db = httpContext.GetRequiredService<GolfFundraiserPro.Api.Data.ApplicationDbContext>();
        var evt = await db.Events
            .Where(e => e.Id == eventId)
            .Select(e => new { e.OrgId })
            .FirstOrDefaultAsync(ct);

        if (evt is null)
            throw new Common.Middleware.NotFoundException("Event", eventId);

        return evt.OrgId;
    }
}
