using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GolfFundraiserPro.Api.Features.Auction;

/// <summary>
/// Player-facing bidding endpoints.
/// AllowAnonymous — players use player_id in body (same as mobile score sync).
/// </summary>
[ApiController]
[AllowAnonymous]
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
    /// Admin: assign live auction winner. Body: { playerId, amountCents }.
    /// </summary>
    [HttpPost("api/v1/auction/items/{itemId:guid}/award")]
    [Authorize(Policy = "EventStaff")]
    public async Task<IActionResult> Award(
        [FromRoute] Guid itemId,
        [FromBody] AwardRequest req,
        CancellationToken ct)
    {
        await _auction.AwardItemAsync(itemId, req, ct);
        return Ok(new { awarded = true });
    }

    /// <summary>
    /// GET /api/v1/players/{id}/bids
    /// Player's bid history.
    /// </summary>
    [HttpGet("api/v1/players/{playerId:guid}/bids")]
    public async Task<IActionResult> GetPlayerBids(
        [FromRoute] Guid playerId,
        CancellationToken ct)
    {
        var history = await _auction.GetPlayerBidsAsync(playerId, ct);
        return Ok(history);
    }
}
