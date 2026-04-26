using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using GolfFundraiserPro.Api.Common.Middleware;

namespace GolfFundraiserPro.Api.Features.Mobile;

/// <summary>
/// Mobile-app-facing endpoints — no JWT auth required.
/// Golfers do not have user accounts; they identify by email against a pre-registered
/// player record created by the organizer in Phase 1.
/// </summary>
[ApiController]
[AllowAnonymous]
public class MobileController : ControllerBase
{
    private readonly MobileService _mobileService;

    public MobileController(MobileService mobileService)
    {
        _mobileService = mobileService;
    }

    // ── JOIN EVENT ────────────────────────────────────────────────────────────

    /// <summary>
    /// Golfer joins their event on the mobile app.
    /// Called when the golfer scans the event QR code (or types the event code)
    /// and submits their email to identify their pre-registered player record.
    ///
    /// Returns the full event_cache payload — everything the mobile app needs to
    /// pre-populate its SQLite database so scoring can proceed fully offline.
    ///
    /// NOT authenticated — golfers do not have user accounts.
    /// Rate-limited by event code (prevents brute-force email enumeration).
    /// </summary>
    [HttpPost("api/v1/events/{eventCode}/join")]
    [ProducesResponseType(typeof(JoinEventResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<JoinEventResponse>> JoinEvent(
        [FromRoute] string eventCode,
        [FromBody]  JoinEventRequest request,
        CancellationToken ct)
    {
        var response = await _mobileService.JoinAsync(eventCode, request, ct);
        return Ok(response);
    }

    // ── BATCH SCORE SYNC ──────────────────────────────────────────────────────

    /// <summary>
    /// Mobile app drains its pending_scores SQLite table.
    /// Called by the background sync task whenever connectivity is available.
    /// Processes scores in the order provided; partial success is intentional —
    /// conflicts are returned for the admin dashboard to resolve, not re-queued.
    ///
    /// NOT authenticated — identified by eventId + teamId + deviceId in the body.
    /// The event must be Active or Scoring; scores for Completed events are rejected.
    /// </summary>
    [HttpPost("api/v1/sync/scores")]
    [ProducesResponseType(typeof(BatchSyncResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<BatchSyncResponse>> BatchSync(
        [FromBody] BatchSyncRequest request,
        CancellationToken ct)
    {
        var response = await _mobileService.BatchSyncAsync(request, ct);
        return Ok(response);
    }
}
