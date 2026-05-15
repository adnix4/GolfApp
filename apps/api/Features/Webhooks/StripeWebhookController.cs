using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Stripe;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Emails;

namespace GolfFundraiserPro.Api.Features.Webhooks;

[ApiController]
[Route("api/v1/webhooks/stripe")]
[AllowAnonymous]
public class StripeWebhookController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly IConfiguration _config;
    private readonly EmailService _email;
    private readonly ILogger<StripeWebhookController> _logger;

    public StripeWebhookController(
        ApplicationDbContext db,
        IConfiguration config,
        EmailService email,
        ILogger<StripeWebhookController> logger)
    {
        _db     = db;
        _config = config;
        _email  = email;
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

        var winner = await _db.AuctionWinners
            .Include(w => w.AuctionItem).ThenInclude(i => i.Event)
            .Include(w => w.Player)
            .FirstOrDefaultAsync(w => w.Id == winnerId, ct);
        if (winner is null) return;

        winner.ChargeStatus = ChargeStatus.Succeeded;
        winner.ReceiptSent  = true;
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Auction winner {WinnerId} charged successfully (pi={Pi})", winnerId, pi.Id);

        await SendAuctionReceiptAsync(winner, ct);
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

    private async Task SendAuctionReceiptAsync(
        Domain.Entities.AuctionWinner winner, CancellationToken ct)
    {
        try
        {
            var player = winner.Player;
            var item   = winner.AuctionItem;
            if (player is null || item is null) return;

            var amount    = $"${winner.AmountCents / 100.0:F2}";
            var fmv       = item.FairMarketValueCents > 0
                ? $"${item.FairMarketValueCents / 100.0:F2}"
                : "N/A";
            var deductible = winner.AmountCents > item.FairMarketValueCents
                ? $"${(winner.AmountCents - item.FairMarketValueCents) / 100.0:F2}"
                : "$0.00";

            var org = await _db.Organizations
                .FirstOrDefaultAsync(o => o.Id == winner.AuctionItem.Event.OrgId, ct);
            var is501c3 = org?.Is501c3 ?? false;

            var deductibilitySection = is501c3
                ? $"""
                   <p><strong>Tax Deductibility (501(c)(3)):</strong><br/>
                   Fair Market Value of item: {fmv}<br/>
                   Potentially deductible portion: {deductible}<br/>
                   <em>Please consult your tax advisor. No goods or services were provided in exchange
                   beyond the item received.</em></p>
                   """
                : string.Empty;

            var html = $"""
                <p>Hi {player.FirstName},</p>
                <p>Thank you for your winning bid! Here is your receipt:</p>
                <table style="border-collapse:collapse;width:100%;max-width:480px">
                  <tr><td style="padding:6px 12px;font-weight:600">Item</td><td style="padding:6px 12px">{item.Title}</td></tr>
                  <tr style="background:#f5f5f5"><td style="padding:6px 12px;font-weight:600">Amount Paid</td><td style="padding:6px 12px">{amount}</td></tr>
                  <tr><td style="padding:6px 12px;font-weight:600">Fair Market Value</td><td style="padding:6px 12px">{fmv}</td></tr>
                </table>
                {deductibilitySection}
                <p>Thank you for supporting our fundraiser!</p>
                """;

            await _email.SendTransactionalAsync(
                player.Email,
                $"{player.FirstName} {player.LastName}",
                $"Your auction receipt — {item.Title}",
                html,
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to send auction receipt for winner {WinnerId}", winner.Id);
        }
    }
}
