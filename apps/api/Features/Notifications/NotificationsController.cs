using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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
    /// AllowAnonymous: golfers are identified by player ID, not JWT.
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
        if (player is null) return NotFound(new { error = "Player not found." });

        player.ExpoPushToken = string.IsNullOrWhiteSpace(request.Token)
            ? null
            : request.Token.Trim();

        await _db.SaveChangesAsync(ct);
        return Ok(new { registered = player.ExpoPushToken is not null });
    }
}

public sealed record RegisterPushTokenRequest(string? Token);
