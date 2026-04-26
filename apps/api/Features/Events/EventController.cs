// ─────────────────────────────────────────────────────────────────────────────
// Features/Events/EventController.cs — Event HTTP Endpoints
// ─────────────────────────────────────────────────────────────────────────────
//
// ENDPOINTS:
//   POST   /api/v1/events                           — create event
//   GET    /api/v1/events                           — list org events
//   GET    /api/v1/events/{id}                      — get event detail
//   PATCH  /api/v1/events/{id}                      — update event / transition status
//   POST   /api/v1/events/{id}/course               — attach course + holes
//   POST   /api/v1/events/{id}/shotgun-assignments  — assign starting holes
//   POST   /api/v1/events/{id}/tee-times            — assign tee times
//   GET    /api/v1/events/{id}/leaderboard          — computed standings
//   GET    /api/v1/events/{id}/fundraising          — revenue totals
//   GET    /api/v1/pub/events/{eventCode}           — public landing page (no auth)
//
// ORG SCOPING:
//   Every protected endpoint reads the orgId from the JWT "orgId" claim.
//   This means an OrgAdmin can only see and modify their own org's events.
//   They cannot guess another org's event UUID and access it.
//
// CONTROLLER RULE: No business logic here.
//   The controller only reads HTTP inputs, calls EventService, and maps
//   the result to an HTTP response.
// ─────────────────────────────────────────────────────────────────────────────

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using GolfFundraiserPro.Api.Common.Middleware;

namespace GolfFundraiserPro.Api.Features.Events;

[ApiController]
[Tags("Events")]
public class EventController : ControllerBase
{
    private readonly EventService _eventService;
    private readonly ILogger<EventController> _logger;

    public EventController(EventService eventService, ILogger<EventController> logger)
    {
        _eventService = eventService;
        _logger       = logger;
    }

    // ── CREATE ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Creates a new event in Draft status.
    /// Returns the full event response including generated event code.
    /// </summary>
    [HttpPost("api/v1/events")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(EventResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<EventResponse>> Create(
        [FromBody] CreateEventRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _eventService.CreateAsync(orgId, request, ct);
        return StatusCode(StatusCodes.Status201Created, response);
    }

    // ── LIST ──────────────────────────────────────────────────────────────────

    /// <summary>
    /// Returns all events for the authenticated organizer's org.
    /// Sorted by StartAt descending (most recent first).
    /// </summary>
    [HttpGet("api/v1/events")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(List<EventSummaryResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<EventSummaryResponse>>> GetAll(CancellationToken ct)
    {
        var orgId = GetOrgId();
        var list  = await _eventService.GetAllAsync(orgId, ct);
        return Ok(list);
    }

    // ── GET BY ID ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Returns full event detail including course and dashboard counts.
    /// </summary>
    [HttpGet("api/v1/events/{id:guid}")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(EventResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<EventResponse>> GetById(
        [FromRoute] Guid id,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _eventService.GetByIdAsync(orgId, id, ct);
        return Ok(response);
    }

    // ── UPDATE ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Partial update for event fields and status transitions.
    /// Only provided (non-null) fields are applied.
    /// To transition status: include "status": "Registration" (or next valid status).
    /// </summary>
    [HttpPatch("api/v1/events/{id:guid}")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(EventResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<EventResponse>> Update(
        [FromRoute] Guid id,
        [FromBody] UpdateEventRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _eventService.UpdateAsync(orgId, id, request, ct);
        return Ok(response);
    }

    // ── ATTACH COURSE ─────────────────────────────────────────────────────────

    /// <summary>
    /// Attaches a course (with per-hole metadata) to an event.
    /// Replaces any previously attached course.
    /// The hole count in the request must match the event's configured holes (9 or 18).
    /// </summary>
    [HttpPost("api/v1/events/{id:guid}/course")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(EventResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<EventResponse>> AttachCourse(
        [FromRoute] Guid id,
        [FromBody] AttachCourseRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _eventService.AttachCourseAsync(orgId, id, request, ct);
        return Ok(response);
    }

    // ── SHOTGUN ASSIGNMENTS ───────────────────────────────────────────────────

    /// <summary>
    /// Assigns starting holes to teams for shotgun-start events.
    /// Provide an array of { teamId, startingHole } pairs.
    /// No two teams can share the same starting hole.
    /// </summary>
    [HttpPost("api/v1/events/{id:guid}/shotgun-assignments")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> AssignShotgun(
        [FromRoute] Guid id,
        [FromBody] ShotgunAssignmentsRequest request,
        CancellationToken ct)
    {
        var orgId = GetOrgId();
        await _eventService.AssignShotgunAsync(orgId, id, request, ct);
        return NoContent();
    }

    // ── TEE TIMES ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Assigns tee times to teams for tee_times-start events.
    /// Provide an array of { teamId, teeTime (UTC ISO 8601) } pairs.
    /// </summary>
    [HttpPost("api/v1/events/{id:guid}/tee-times")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> AssignTeeTimes(
        [FromRoute] Guid id,
        [FromBody] TeeTimesRequest request,
        CancellationToken ct)
    {
        var orgId = GetOrgId();
        await _eventService.AssignTeeTimesAsync(orgId, id, request, ct);
        return NoContent();
    }

    // ── LEADERBOARD ───────────────────────────────────────────────────────────

    /// <summary>
    /// Returns the computed leaderboard for an event.
    /// Sorted by score (best first). Teams with no scores rank last with rank 0.
    /// Available to EventStaff during scoring; also used by the public leaderboard
    /// page (which has its own public endpoint).
    /// </summary>
    [HttpGet("api/v1/events/{id:guid}/leaderboard")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(List<LeaderboardEntryResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<List<LeaderboardEntryResponse>>> GetLeaderboard(
        [FromRoute] Guid id,
        CancellationToken ct)
    {
        var orgId = GetOrgId();
        var board = await _eventService.GetLeaderboardAsync(orgId, id, ct);
        return Ok(board);
    }

    // ── FUNDRAISING ───────────────────────────────────────────────────────────

    /// <summary>
    /// Returns aggregated fundraising totals: entry fees, donations, grand total.
    /// Used by the admin fundraising thermometer dashboard widget.
    /// </summary>
    [HttpGet("api/v1/events/{id:guid}/fundraising")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(FundraisingResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<FundraisingResponse>> GetFundraising(
        [FromRoute] Guid id,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _eventService.GetFundraisingAsync(orgId, id, ct);
        return Ok(response);
    }

    // ── PUBLIC LANDING PAGE (no auth) ─────────────────────────────────────────

    /// <summary>
    /// Returns public event data for the landing page and donation widget.
    /// Looked up by event code (printed on flyers, encoded in QR).
    /// No authentication required — this is the public-facing endpoint.
    ///
    /// Returns 404 for Draft and Cancelled events (not publicly visible).
    /// </summary>
    [HttpGet("api/v1/pub/events/{eventCode}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(PublicEventResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PublicEventResponse>> GetPublicEvent(
        [FromRoute] string eventCode,
        CancellationToken ct)
    {
        var response = await _eventService.GetPublicEventAsync(eventCode, ct);
        return Ok(response);
    }

    // ── PUBLIC LEADERBOARD (no auth) ─────────────────────────────────────────

    /// <summary>
    /// Public live leaderboard for display boards, mobile spectators, and event websites.
    /// No authentication required. Returns team names and scores — no financial data or emails.
    /// 404 for Draft and Cancelled events.
    /// </summary>
    [HttpGet("api/v1/pub/events/{eventCode}/leaderboard")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(PublicLeaderboardResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PublicLeaderboardResponse>> GetPublicLeaderboard(
        [FromRoute] string eventCode,
        CancellationToken ct)
    {
        var response = await _eventService.GetPublicLeaderboardAsync(eventCode, ct);
        return Ok(response);
    }

    // ── PUBLIC CHALLENGES (no auth) ───────────────────────────────────────────

    /// <summary>
    /// Public challenges live view: all hole contests and recorded results.
    /// No authentication required.
    /// 404 for Draft and Cancelled events.
    /// </summary>
    [HttpGet("api/v1/pub/events/{eventCode}/challenges")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(PublicChallengesResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PublicChallengesResponse>> GetPublicChallenges(
        [FromRoute] string eventCode,
        CancellationToken ct)
    {
        var response = await _eventService.GetPublicChallengesAsync(eventCode, ct);
        return Ok(response);
    }

    // ── PUBLIC FUNDRAISING (no auth) ──────────────────────────────────────────

    /// <summary>
    /// Public fundraising thermometer data: total donations + entry fees.
    /// No authentication required. No individual donor details.
    /// 404 for Draft and Cancelled events.
    /// </summary>
    [HttpGet("api/v1/pub/events/{eventCode}/fundraising")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(PublicFundraisingInfo), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PublicFundraisingInfo>> GetPublicFundraising(
        [FromRoute] string eventCode,
        CancellationToken ct)
    {
        var response = await _eventService.GetPublicFundraisingAsync(eventCode, ct);
        return Ok(response);
    }

    // ── PRIVATE HELPERS ───────────────────────────────────────────────────────

    /// <summary>
    /// Reads the orgId from the "orgId" JWT claim set in TokenService.
    /// Throws if the claim is missing (should never happen for authenticated users).
    /// </summary>
    private Guid GetOrgId()
    {
        var orgIdClaim = User.FindFirst("orgId")?.Value;
        if (string.IsNullOrWhiteSpace(orgIdClaim) || !Guid.TryParse(orgIdClaim, out var orgId))
        {
            throw new ForbiddenException(
                "Your account is not associated with an organization.");
        }
        return orgId;
    }
}
