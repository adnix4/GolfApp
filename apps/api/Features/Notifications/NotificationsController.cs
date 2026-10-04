using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common;
using GolfFundraiserPro.Api.Data;

namespace GolfFundraiserPro.Api.Features.Notifications;

[ApiController]
[Route("api/v1/players")]
public class NotificationsController : ControllerBase
{
    private readonly ApplicationDbContext _db;

    public NotificationsController(ApplicationDbContext db) => _db = db;

    /// <summary>
    /// POST /api/v1/players/{id}/push-token
    /// Registers or updates the Expo push token for a player.
    /// AllowAnonymous: golfers have no JWT. They prove who they are with the
    /// session token minted at /join, like every other golfer self-action
    /// (profile, sync, bids, payments). Player ids are public (the Stroke Play
    /// board lists them), so without it anyone could clear a golfer's token
    /// (silencing their outbid alerts) or swap in their own and receive that
    /// golfer's alerts. A mismatch answers 404, like an unknown player, so the
    /// endpoint does not confirm which ids exist (problemList D5).
    /// Send { token: null } to opt out.
    /// </summary>
    [HttpPost("{id:guid}/push-token")]
    [AllowAnonymous]
    public async Task<IActionResult> RegisterPushToken(
        Guid id,
        [FromBody] RegisterPushTokenRequest request,
        CancellationToken ct)
    {
        var player = await _db.Players.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (player is null || !PlayerSessionAuth.Matches(player.SessionToken, request.SessionToken))
            return NotFound(new { error = "Player not found." });

        player.ExpoPushToken = string.IsNullOrWhiteSpace(request.Token)
            ? null
            : request.Token.Trim();

        await _db.SaveChangesAsync(ct);
        return Ok(new { registered = player.ExpoPushToken is not null });
    }
}

public sealed record RegisterPushTokenRequest(string? Token, string? SessionToken);
