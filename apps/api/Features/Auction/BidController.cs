using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace GolfFundraiserPro.Api.Features.Auction;

/// <summary>
/// Player-facing bidding endpoints, plus the staff-only live-auction award.
///
/// The player routes are AllowAnonymous per ACTION, not on the class: players
/// authenticate with the per-player session token in the body or query (same as
/// mobile score sync). A class-level [AllowAnonymous] overrides any [Authorize]
/// on an action, which is how Award was once reachable without a login.
/// </summary>
[ApiController]
public class BidController : ControllerBase
{
    private readonly AuctionService _auction;

    public BidController(AuctionService auction) => _auction = auction;

    /// <summary>
    /// POST /api/v1/auction/items/{id}/bid
    /// Body: { playerId, amountCents }
    /// Silent auction bid. Validates eligibility, minimum, timing, extension.
    /// </summary>
    [HttpPost("api/v1/auction/items/{itemId:guid}/bid")]
    [AllowAnonymous]
    public async Task<IActionResult> PlaceBid(
        [FromRoute] Guid itemId,
        [FromBody] PlaceBidRequest req,
        CancellationToken ct)
    {
        var result = await _auction.PlaceBidAsync(itemId, req, ct);
        return Ok(result);
    }

    /// <summary>
    /// POST /api/v1/auction/items/{id}/buy-now
    /// Instant-win at buy_now_price. Closes item immediately.
    /// </summary>
    [HttpPost("api/v1/auction/items/{itemId:guid}/buy-now")]
    [AllowAnonymous]
    public async Task<IActionResult> BuyNow(
        [FromRoute] Guid itemId,
        [FromBody] PlaceBidRequest req,
        CancellationToken ct)
    {
        var result = await _auction.PlaceBidAsync(itemId, req, ct);
        return Ok(result);
    }

    /// <summary>
    /// POST /api/v1/auction/items/{id}/pledge
    /// Donation item pledge. Multiple winners allowed.
    /// </summary>
    [HttpPost("api/v1/auction/items/{itemId:guid}/pledge")]
    [AllowAnonymous]
    public async Task<IActionResult> Pledge(
        [FromRoute] Guid itemId,
        [FromBody] PledgeRequest req,
        CancellationToken ct)
    {
        var result = await _auction.PledgeAsync(itemId, req, ct);
        return Ok(result);
    }

    /// <summary>
    /// POST /api/v1/auction/items/{id}/award
    /// Staff: assign a live auction winner. Body: { playerId, amountCents }.
    /// Scoped to the caller's org; the winner must be a golfer in the item's event.
    /// </summary>
    [HttpPost("api/v1/auction/items/{itemId:guid}/award")]
    [Authorize(Policy = "EventStaff")]
    public async Task<IActionResult> Award(
        [FromRoute] Guid itemId,
        [FromBody] AwardRequest req,
        CancellationToken ct)
    {
        await _auction.AwardItemAsync(GetOrgId(), itemId, req, ct);
        return Ok(new { awarded = true });
    }

    /// <summary>
    /// GET /api/v1/players/{id}/bids
    /// Player's own bid history. Requires the per-player session token minted at
    /// /join — the history exposes private Silent maxima, so a player GUID alone
    /// is not enough to read it. Same shape as GetPlayerCart on the checkout
    /// controller: anonymous route, token in the query string.
    /// </summary>
    [HttpGet("api/v1/players/{playerId:guid}/bids")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPlayerBids(
        [FromRoute] Guid playerId,
        [FromQuery] string? sessionToken,
        CancellationToken ct)
    {
        var history = await _auction.GetPlayerBidsAsync(playerId, sessionToken, ct);
        return Ok(history);
    }

    private Guid GetOrgId() =>
        Guid.Parse(User.FindFirstValue("orgId")
            ?? throw new UnauthorizedAccessException("No orgId claim in token."));
}
