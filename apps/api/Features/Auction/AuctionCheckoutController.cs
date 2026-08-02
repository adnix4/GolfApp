using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace GolfFundraiserPro.Api.Features.Auction;

/// <summary>
/// The auction checkout desk: staff settle winners and hand items over, and a
/// golfer can confirm their own card from the app before they get there.
/// </summary>
[ApiController]
public class AuctionCheckoutController : ControllerBase
{
    private readonly AuctionCheckoutService _checkout;

    public AuctionCheckoutController(AuctionCheckoutService checkout) => _checkout = checkout;

    // ── STAFF ─────────────────────────────────────────────────────────────────

    /// <summary>The checkout queue — one row per winning golfer.</summary>
    [HttpGet("api/v1/events/{eventId:guid}/auction/checkout")]
    [Authorize(Policy = "EventStaff")]
    public async Task<IActionResult> GetDesk([FromRoute] Guid eventId, CancellationToken ct)
    {
        var rows = await _checkout.GetDeskAsync(GetOrgId(), eventId, ct);
        return Ok(rows);
    }

    /// <summary>One golfer's itemised cart.</summary>
    [HttpGet("api/v1/events/{eventId:guid}/auction/checkout/{playerId:guid}")]
    [Authorize(Policy = "EventStaff")]
    public async Task<IActionResult> GetCart(
        [FromRoute] Guid eventId, [FromRoute] Guid playerId, CancellationToken ct)
    {
        var cart = await _checkout.GetCartAsync(GetOrgId(), eventId, playerId, ct);
        return Ok(cart);
    }

    /// <summary>Settles everything a golfer owes — card on file, cash, or check.</summary>
    [HttpPost("api/v1/events/{eventId:guid}/auction/checkout/{playerId:guid}/settle")]
    [Authorize(Policy = "EventStaff")]
    public async Task<IActionResult> Settle(
        [FromRoute] Guid eventId,
        [FromRoute] Guid playerId,
        [FromBody] SettleCheckoutRequest req,
        CancellationToken ct)
    {
        var result = await _checkout.SettleAsync(
            GetOrgId(), eventId, playerId, req, GetUserId(), ct);
        return Ok(result);
    }

    /// <summary>Marks one item handed over, independently of payment.</summary>
    [HttpPost("api/v1/auction/winners/{winnerId:guid}/pickup")]
    [Authorize(Policy = "EventStaff")]
    public async Task<IActionResult> MarkPickedUp([FromRoute] Guid winnerId, CancellationToken ct)
    {
        await _checkout.MarkPickedUpAsync(GetOrgId(), winnerId, ct);
        return Ok();
    }

    // ── GOLFER (session token, no account) ────────────────────────────────────

    /// <summary>What this golfer won and still owes.</summary>
    [HttpGet("api/v1/players/{playerId:guid}/auction/checkout")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPlayerCart(
        [FromRoute] Guid playerId,
        [FromQuery] string? sessionToken,
        CancellationToken ct)
    {
        var cart = await _checkout.GetPlayerCartAsync(playerId, sessionToken, ct);
        return Ok(cart);
    }

    /// <summary>The golfer confirms their saved card and pays for what they won.</summary>
    [HttpPost("api/v1/players/{playerId:guid}/auction/checkout/confirm")]
    [AllowAnonymous]
    public async Task<IActionResult> ConfirmPlayerCheckout(
        [FromRoute] Guid playerId,
        [FromBody] ConfirmCheckoutRequest req,
        CancellationToken ct)
    {
        var result = await _checkout.ConfirmPlayerCheckoutAsync(playerId, req.SessionToken, ct);
        return Ok(result);
    }

    private Guid GetOrgId() =>
        Guid.Parse(User.FindFirstValue("orgId")
            ?? throw new UnauthorizedAccessException("No orgId claim in token."));

    /// <summary>The staff member settling, recorded on the winner row. Null if the claim is absent.</summary>
    private Guid? GetUserId() =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub"),
            out var id) ? id : null;
}
