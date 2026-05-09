using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace GolfFundraiserPro.Api.Features.Auction;

/// <summary>
/// Admin CRUD for auction items + public read endpoint.
/// </summary>
[ApiController]
public class AuctionItemsController : ControllerBase
{
    private readonly AuctionService _auction;

    public AuctionItemsController(AuctionService auction) => _auction = auction;

    // ── ADMIN CRUD ────────────────────────────────────────────────────────────

    [HttpGet("api/v1/events/{eventId:guid}/auction/items")]
    [Authorize(Policy = "EventStaff")]
    public async Task<IActionResult> GetItems([FromRoute] Guid eventId, CancellationToken ct)
    {
        var orgId = GetOrgId();
        var items = await _auction.GetItemsAsync(orgId, eventId, ct);
        return Ok(items);
    }

    [HttpPost("api/v1/events/{eventId:guid}/auction/items")]
    [Authorize(Policy = "EventStaff")]
    public async Task<IActionResult> CreateItem(
        [FromRoute] Guid eventId,
        [FromBody] CreateAuctionItemRequest req,
        CancellationToken ct)
    {
        var orgId = GetOrgId();
        var item = await _auction.CreateItemAsync(orgId, eventId, req, ct);
        return CreatedAtAction(nameof(GetItems), new { eventId }, item);
    }

    [HttpPatch("api/v1/events/{eventId:guid}/auction/items/{itemId:guid}")]
    [Authorize(Policy = "EventStaff")]
    public async Task<IActionResult> UpdateItem(
        [FromRoute] Guid eventId,
        [FromRoute] Guid itemId,
        [FromBody] UpdateAuctionItemRequest req,
        CancellationToken ct)
    {
        var orgId = GetOrgId();
        var item = await _auction.UpdateItemAsync(orgId, eventId, itemId, req, ct);
        return Ok(item);
    }

    [HttpPost("api/v1/events/{eventId:guid}/auction/items/{itemId:guid}/photos")]
    [Authorize(Policy = "EventStaff")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UploadPhoto(
        [FromRoute] Guid eventId,
        [FromRoute] Guid itemId,
        IFormFile file,
        CancellationToken ct)
    {
        var orgId  = GetOrgId();
        var result = await _auction.UploadItemPhotoAsync(orgId, eventId, itemId, file, ct);
        return Ok(result);
    }

    [HttpDelete("api/v1/events/{eventId:guid}/auction/items/{itemId:guid}")]
    [Authorize(Policy = "EventStaff")]
    public async Task<IActionResult> DeleteItem(
        [FromRoute] Guid eventId,
        [FromRoute] Guid itemId,
        CancellationToken ct)
    {
        var orgId = GetOrgId();
        await _auction.DeleteItemAsync(orgId, eventId, itemId, ct);
        return NoContent();
    }

    // ── PUBLIC READ (no auth) ──────────────────────────────────────────────────

    [HttpGet("api/v1/events/{eventId:guid}/auction/items/public")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPublicItems([FromRoute] Guid eventId, CancellationToken ct)
    {
        var items = await _auction.GetPublicItemsAsync(eventId, ct);
        return Ok(items);
    }

    private Guid GetOrgId() =>
        Guid.Parse(User.FindFirstValue("orgId")
            ?? throw new UnauthorizedAccessException("No orgId claim in token."));
}
