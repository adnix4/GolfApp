using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Features.Teams;

namespace GolfFundraiserPro.Api.Features.Players;

[ApiController]
[Tags("Players")]
public class PlayerController : ControllerBase
{
    private readonly PlayerService _playerService;

    public PlayerController(PlayerService playerService)
    {
        _playerService = playerService;
    }

    /// <summary>Returns all players registered for an event, sorted by last name.</summary>
    [HttpGet("api/v1/events/{eventId:guid}/players")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(List<PlayerResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<List<PlayerResponse>>> GetAll(
        [FromRoute] Guid eventId,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _playerService.GetAllAsync(orgId, eventId, ct);
        return Ok(response);
    }

    /// <summary>Returns a single player's full detail.</summary>
    [HttpGet("api/v1/events/{eventId:guid}/players/{playerId:guid}")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(PlayerResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PlayerResponse>> GetById(
        [FromRoute] Guid eventId,
        [FromRoute] Guid playerId,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _playerService.GetByIdAsync(orgId, eventId, playerId, ct);
        return Ok(response);
    }

    /// <summary>
    /// Updates player info or reassigns to a different team.
    /// To remove from team: set clearTeam = true.
    /// </summary>
    [HttpPatch("api/v1/events/{eventId:guid}/players/{playerId:guid}")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(PlayerResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PlayerResponse>> Update(
        [FromRoute] Guid eventId,
        [FromRoute] Guid playerId,
        [FromBody] UpdatePlayerRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _playerService.UpdateAsync(orgId, eventId, playerId, request, ct);
        return Ok(response);
    }

    /// <summary>
    /// Manually checks in a player. Idempotent — safe to call if already checked in.
    /// Also marks the team as Complete when the last player on the team is checked in.
    /// </summary>
    [HttpPost("api/v1/events/{eventId:guid}/players/{playerId:guid}/check-in")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(PlayerResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PlayerResponse>> CheckIn(
        [FromRoute] Guid eventId,
        [FromRoute] Guid playerId,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _playerService.CheckInAsync(orgId, eventId, playerId, ct);
        return Ok(response);
    }

    /// <summary>
    /// Removes a player from the event. Not allowed once the event is Scoring or Completed.
    /// </summary>
    [HttpDelete("api/v1/events/{eventId:guid}/players/{playerId:guid}")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Remove(
        [FromRoute] Guid eventId,
        [FromRoute] Guid playerId,
        CancellationToken ct)
    {
        var orgId = GetOrgId();
        await _playerService.RemoveAsync(orgId, eventId, playerId, ct);
        return NoContent();
    }

    private Guid GetOrgId()
    {
        var claim = User.FindFirst("orgId")?.Value;
        if (string.IsNullOrWhiteSpace(claim) || !Guid.TryParse(claim, out var orgId))
            throw new ForbiddenException("Your account is not associated with an organization.");
        return orgId;
    }
}
