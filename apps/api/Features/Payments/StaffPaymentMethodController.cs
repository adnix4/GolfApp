using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace GolfFundraiserPro.Api.Features.Payments;

/// <summary>
/// Saving a card on a golfer's behalf, for the one who cannot or will not use
/// the app. Staff key it in at the registration desk or at auction checkout,
/// with the cardholder standing there.
/// </summary>
/// <remarks>
/// Deliberately a separate controller from PaymentsController rather than two
/// more actions on it. PaymentsController is marked [AllowAnonymous] at the
/// class level because golfers have no accounts — and in ASP.NET Core a
/// class-level AllowAnonymous short-circuits authorization for every action
/// inside it, so an [Authorize] attribute on an action there would be silently
/// ignored and these endpoints would be wide open.
///
/// The card number itself goes from the browser straight to Stripe via Elements
/// and never reaches this API.
/// </remarks>
[ApiController]
[Authorize(Policy = "EventStaff")]
public class StaffPaymentMethodController : ControllerBase
{
    private readonly PaymentsService _payments;

    public StaffPaymentMethodController(PaymentsService payments) => _payments = payments;

    /// <summary>Returns { clientSecret } for the admin card form.</summary>
    [HttpPost("api/v1/events/{eventId:guid}/players/{playerId:guid}/payment-method/setup-intent")]
    public async Task<IActionResult> CreateSetupIntent(
        [FromRoute] Guid eventId, [FromRoute] Guid playerId, CancellationToken ct)
    {
        var clientSecret = await _payments.CreateSetupIntentForStaffAsync(
            GetOrgId(), eventId, playerId, ct);
        return Ok(new { clientSecret });
    }

    /// <summary>Saves the entered card and flips has_payment_method.</summary>
    [HttpPost("api/v1/events/{eventId:guid}/players/{playerId:guid}/payment-method/confirm")]
    public async Task<IActionResult> ConfirmSetup(
        [FromRoute] Guid eventId,
        [FromRoute] Guid playerId,
        [FromBody] StaffConfirmSetupRequest request,
        CancellationToken ct)
    {
        await _payments.ConfirmSetupForStaffAsync(
            GetOrgId(), eventId, playerId, request.SetupIntentId, ct);
        return Ok(new { hasPaymentMethod = true });
    }

    private Guid GetOrgId() =>
        Guid.Parse(User.FindFirstValue("orgId")
            ?? throw new UnauthorizedAccessException("No orgId claim in token."));
}

/// <summary>No session token: the staff member's JWT plus org ownership is the authorization.</summary>
public record StaffConfirmSetupRequest(string SetupIntentId);
