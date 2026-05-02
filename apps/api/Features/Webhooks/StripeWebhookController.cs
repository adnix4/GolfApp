using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Stripe;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.Webhooks;

[ApiController]
[Route("api/v1/webhooks/stripe")]
[AllowAnonymous]
public class StripeWebhookController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly IConfiguration _config;
    private readonly ILogger<StripeWebhookController> _logger;

    public StripeWebhookController(
        ApplicationDbContext db,
        IConfiguration config,
        ILogger<StripeWebhookController> logger)
    {
        _db     = db;
        _config = config;
        _logger = logger;
    }

    [HttpPost]
    [Consumes("application/json")]
    public async Task<IActionResult> HandleWebhook(CancellationToken ct)
    {
        var json = await new StreamReader(Request.Body).ReadToEndAsync(ct);

        var webhookSecret = _config["STRIPE_WEBHOOK_SECRET"];
        if (string.IsNullOrEmpty(webhookSecret))
        {
            _logger.LogWarning("STRIPE_WEBHOOK_SECRET not configured — skipping signature validation");
        }

        Event stripeEvent;
        try
        {
            stripeEvent = string.IsNullOrEmpty(webhookSecret)
                ? EventUtility.ParseEvent(json)
                : EventUtility.ConstructEvent(json,
                    Request.Headers["Stripe-Signature"],
                    webhookSecret);
        }
        catch (StripeException ex)
        {
            _logger.LogWarning(ex, "Stripe webhook signature validation failed");
            return BadRequest("Invalid Stripe signature");
        }

        switch (stripeEvent.Type)
        {
            case Stripe.Events.PaymentIntentSucceeded:
                await HandlePaymentSucceededAsync(stripeEvent, ct);
                break;

            case Stripe.Events.PaymentIntentPaymentFailed:
                await HandlePaymentFailedAsync(stripeEvent, ct);
                break;

            case Stripe.Events.SetupIntentSucceeded:
                // Setup intents are confirmed synchronously in PaymentsService.ConfirmSetupAsync.
                // This webhook is a secondary acknowledgement — no action needed.
                _logger.LogInformation("SetupIntent succeeded: {Id}", stripeEvent.Id);
                break;

            default:
                _logger.LogDebug("Unhandled Stripe event type: {Type}", stripeEvent.Type);
                break;
        }

        return Ok();
    }

    private async Task HandlePaymentSucceededAsync(Event stripeEvent, CancellationToken ct)
    {
        var pi = stripeEvent.Data.Object as PaymentIntent;
        if (pi is null) return;

        if (!pi.Metadata.TryGetValue("winner_id", out var winnerIdStr)
            || !Guid.TryParse(winnerIdStr, out var winnerId))
        {
            _logger.LogInformation("payment_intent.succeeded without winner_id metadata: {Pi}", pi.Id);
            return;
        }

        var winner = await _db.AuctionWinners.FirstOrDefaultAsync(w => w.Id == winnerId, ct);
        if (winner is null) return;

        winner.ChargeStatus = ChargeStatus.Succeeded;
        winner.ReceiptSent  = true;
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Auction winner {WinnerId} charged successfully (pi={Pi})", winnerId, pi.Id);
    }

    private async Task HandlePaymentFailedAsync(Event stripeEvent, CancellationToken ct)
    {
        var pi = stripeEvent.Data.Object as PaymentIntent;
        if (pi is null) return;

        if (!pi.Metadata.TryGetValue("winner_id", out var winnerIdStr)
            || !Guid.TryParse(winnerIdStr, out var winnerId))
            return;

        var winner = await _db.AuctionWinners.FirstOrDefaultAsync(w => w.Id == winnerId, ct);
        if (winner is null) return;

        winner.ChargeStatus = ChargeStatus.Failed;
        await _db.SaveChangesAsync(ct);

        _logger.LogWarning(
            "Auction winner {WinnerId} charge FAILED (pi={Pi}). Manual resolution required.",
            winnerId, pi.Id);
    }
}
