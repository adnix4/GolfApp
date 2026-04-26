using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using GolfFundraiserPro.Api.Common.Middleware;

namespace GolfFundraiserPro.Api.Features.Scores;

[ApiController]
[Tags("Scores")]
public class ScoreController : ControllerBase
{
    private readonly ScoreService _scoreService;

    public ScoreController(ScoreService scoreService)
    {
        _scoreService = scoreService;
    }

    /// <summary>
    /// Submits a score for a team on a specific hole (Phase 1: admin entry).
    /// If the same team/hole already has a score, the behaviour depends on the submitting device:
    ///   same device → overwrites cleanly
    ///   different device + different score → marks is_conflicted = true for admin resolution
    /// </summary>
    [HttpPost("api/v1/events/{eventId:guid}/scores")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(ScoreResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ScoreResponse>> Submit(
        [FromRoute] Guid eventId,
        [FromBody] SubmitScoreRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _scoreService.SubmitAsync(orgId, eventId, request, ct);
        return StatusCode(StatusCodes.Status201Created, response);
    }

    /// <summary>Returns all scores for an event, ordered by team then hole number.</summary>
    [HttpGet("api/v1/events/{eventId:guid}/scores")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(List<ScoreResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<List<ScoreResponse>>> GetAll(
        [FromRoute] Guid eventId,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _scoreService.GetAllAsync(orgId, eventId, ct);
        return Ok(response);
    }

    /// <summary>
    /// Returns the full scorecard for a specific team: one row per hole (scored or not),
    /// with par, gross score, putts, and conflict flag for each.
    /// </summary>
    [HttpGet("api/v1/events/{eventId:guid}/teams/{teamId:guid}/scorecard")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(ScorecardResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ScorecardResponse>> GetScorecard(
        [FromRoute] Guid eventId,
        [FromRoute] Guid teamId,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _scoreService.GetScorecardAsync(orgId, eventId, teamId, ct);
        return Ok(response);
    }

    /// <summary>Corrects an existing score. Clearing the conflict flag on update.</summary>
    [HttpPatch("api/v1/events/{eventId:guid}/scores/{scoreId:guid}")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(ScoreResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ScoreResponse>> Update(
        [FromRoute] Guid eventId,
        [FromRoute] Guid scoreId,
        [FromBody] UpdateScoreRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _scoreService.UpdateAsync(orgId, eventId, scoreId, request, ct);
        return Ok(response);
    }

    /// <summary>
    /// Resolves a score conflict by accepting one authoritative score value.
    /// Only works on scores where is_conflicted = true.
    /// </summary>
    [HttpPost("api/v1/events/{eventId:guid}/scores/{scoreId:guid}/resolve")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(ScoreResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ScoreResponse>> ResolveConflict(
        [FromRoute] Guid eventId,
        [FromRoute] Guid scoreId,
        [FromBody] ResolveConflictRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _scoreService.ResolveConflictAsync(orgId, eventId, scoreId, request, ct);
        return Ok(response);
    }

    private Guid GetOrgId()
    {
        var claim = User.FindFirst("orgId")?.Value;
        if (string.IsNullOrWhiteSpace(claim) || !Guid.TryParse(claim, out var orgId))
            throw new ForbiddenException("Your account is not associated with an organization.");
        return orgId;
    }
}
