using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace GolfFundraiserPro.Api.Features.Auction;

[ApiController]
public class AuctionSessionsController : ControllerBase
{
    private readonly AuctionService _auction;

    public AuctionSessionsController(AuctionService auction) => _auction = auction;

    /// <summary>
    /// POST /api/v1/events/{id}/auction/sessions/start
    /// Admin: starts a live auction session. Fires LiveAuctionStarted to all clients.
    /// </summary>
    [HttpPost("api/v1/events/{eventId:guid}/auction/sessions/start")]
    [Authorize(Policy = "EventStaff")]
    public async Task<IActionResult> StartSession(
        [FromRoute] Guid eventId, CancellationToken ct)
    {
        var orgId = GetOrgId();
        var session = await _auction.StartSessionAsync(orgId, eventId, ct);
        return Ok(session);
    }

    /// <summary>
    /// POST /api/v1/events/{id}/auction/sessions/next-item
    /// Admin: advance to the next live item. Fires LiveItemAdvanced.
    /// </summary>
    [HttpPost("api/v1/events/{eventId:guid}/auction/sessions/next-item")]
    [Authorize(Policy = "EventStaff")]
    public async Task<IActionResult> NextItem(
        [FromRoute] Guid eventId, CancellationToken ct)
    {
        var orgId = GetOrgId();
        var session = await _auction.AdvanceItemAsync(orgId, eventId, ct);
        return Ok(session);
    }

    /// <summary>
    /// POST /api/v1/events/{id}/auction/sessions/called-amount
    /// Admin: update the verbally called bid amount. Fires AuctionAmountUpdated.
    /// Body: { amountCents }
    /// </summary>
    [HttpPost("api/v1/events/{eventId:guid}/auction/sessions/called-amount")]
    [Authorize(Policy = "EventStaff")]
    public async Task<IActionResult> UpdateCalledAmount(
        [FromRoute] Guid eventId,
        [FromBody] UpdateCalledAmountRequest req,
        CancellationToken ct)
    {
        var orgId = GetOrgId();
        var session = await _auction.UpdateCalledAmountAsync(orgId, eventId, req.AmountCents, ct);
        return Ok(session);
    }

    /// <summary>
    /// GET /api/v1/events/{id}/auction/sessions/active
    /// Returns the active session (if any) for attendee screens.
    /// </summary>
    [HttpGet("api/v1/events/{eventId:guid}/auction/sessions/active")]
    [AllowAnonymous]
    public async Task<IActionResult> GetActiveSession(
        [FromRoute] Guid eventId, CancellationToken ct)
    {
        var session = await _auction.GetActiveSessionAsync(eventId, ct);
        if (session is null) return NoContent();
        return Ok(session);
    }

    private Guid GetOrgId() =>
        Guid.Parse(User.FindFirstValue("orgId")
            ?? throw new UnauthorizedAccessException("No orgId claim in token."));
}
