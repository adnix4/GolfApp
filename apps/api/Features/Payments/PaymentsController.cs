using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GolfFundraiserPro.Api.Features.Payments;

/// <summary>
/// Stripe payment endpoints for the mobile app.
/// AllowAnonymous — players don't have JWT accounts; identity is passed in the body.
/// The player_id is validated to belong to a real player.
/// </summary>
[ApiController]
[Route("api/v1/payments")]
[AllowAnonymous]
public class PaymentsController : ControllerBase
{
    private readonly PaymentsService _payments;

    public PaymentsController(PaymentsService payments) => _payments = payments;

    /// <summary>
    /// POST /api/v1/payments/setup-intent
    /// Body: { playerId }
    /// Returns { clientSecret } for Stripe Elements card entry form.
    /// </summary>
    [HttpPost("setup-intent")]
    public async Task<IActionResult> CreateSetupIntent(
        [FromBody] SetupIntentRequest request, CancellationToken ct)
    {
        var clientSecret = await _payments.CreateSetupIntentAsync(
            request.PlayerId, request.SessionToken, ct);
        return Ok(new { clientSecret });
    }

    /// <summary>
    /// POST /api/v1/payments/confirm-setup
    /// Body: { playerId, setupIntentId }
    /// Confirms SetupIntent and saves PaymentMethod. Sets player.has_payment_method = true.
    /// </summary>
    [HttpPost("confirm-setup")]
    public async Task<IActionResult> ConfirmSetup(
        [FromBody] ConfirmSetupRequest request, CancellationToken ct)
    {
        await _payments.ConfirmSetupAsync(
            request.PlayerId, request.SetupIntentId, request.SessionToken, ct);
        return Ok(new { hasPaymentMethod = true });
    }

    /// <summary>
    /// POST /api/v1/payments/confirm-entry-fee
    /// Body: { paymentIntentId }
    /// Called by the mobile app right after the card payment succeeds so the
    /// golfers show as paid immediately; the Stripe webhook is the backstop.
    /// No session token needed: the server re-fetches the intent from Stripe and
    /// only records it if Stripe says it succeeded, so the call can't forge a payment.
    /// </summary>
    [HttpPost("confirm-entry-fee")]
    public async Task<IActionResult> ConfirmEntryFee(
        [FromBody] ConfirmEntryFeeRequest request, CancellationToken ct)
    {
        var recorded = await _payments.ConfirmEntryFeeAsync(request.PaymentIntentId, ct);
        return Ok(new { recorded });
    }
}

// SessionToken (minted at /join) authorizes the call so nobody can attach a card
// to — or flip has_payment_method on — another player's account.
public record SetupIntentRequest(Guid PlayerId, string SessionToken);
public record ConfirmSetupRequest(Guid PlayerId, string SetupIntentId, string SessionToken);
public record ConfirmEntryFeeRequest(string PaymentIntentId);
