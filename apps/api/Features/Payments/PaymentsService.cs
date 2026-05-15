using Microsoft.EntityFrameworkCore;
using Stripe;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;

namespace GolfFundraiserPro.Api.Features.Payments;

public class PaymentsService
{
    private readonly ApplicationDbContext _db;
    private readonly IConfiguration _config;
    private readonly ILogger<PaymentsService> _logger;

    public PaymentsService(
        ApplicationDbContext db,
        IConfiguration config,
        ILogger<PaymentsService> logger)
    {
        _db     = db;
        _config = config;
        _logger = logger;
    }

    /// <summary>
    /// Creates a Stripe SetupIntent (or reuses an existing one) and returns
    /// the client_secret for Stripe Elements on the client.
    /// Also ensures a Stripe Customer exists for this player.
    /// </summary>
    public async Task<string> CreateSetupIntentAsync(Guid playerId, CancellationToken ct = default)
    {
        var player = await _db.Players.FirstOrDefaultAsync(p => p.Id == playerId, ct)
            ?? throw new Common.Middleware.NotFoundException("Player", playerId);

        StripeConfiguration.ApiKey = _config["STRIPE_SECRET_KEY"]
            ?? throw new InvalidOperationException("STRIPE_SECRET_KEY not configured");

        // Ensure Stripe customer exists
        string stripeCustomerId;
        if (!string.IsNullOrEmpty(player.StripeCustomerId))
        {
            stripeCustomerId = player.StripeCustomerId;
        }
        else
        {
            var customerService = new CustomerService();
            var customer = await customerService.CreateAsync(new CustomerCreateOptions
            {
                Email    = player.Email,
                Name     = $"{player.FirstName} {player.LastName}",
                Metadata = new Dictionary<string, string> { ["player_id"] = player.Id.ToString() }
            });
            stripeCustomerId = customer.Id;
            player.StripeCustomerId = stripeCustomerId;
            await _db.SaveChangesAsync(ct);
        }

        var setupService = new SetupIntentService();
        var intent = await setupService.CreateAsync(new SetupIntentCreateOptions
        {
            Customer           = stripeCustomerId,
            PaymentMethodTypes = new List<string> { "card" },
            Metadata           = new Dictionary<string, string> { ["player_id"] = playerId.ToString() }
        });

        return intent.ClientSecret;
    }

    /// <summary>
    /// Confirms a SetupIntent after client-side card entry, saves the PaymentMethod
    /// to the stripe_customers table, and marks the player as having a payment method.
    /// </summary>
    public async Task ConfirmSetupAsync(Guid playerId, string setupIntentId, CancellationToken ct = default)
    {
        var player = await _db.Players.FirstOrDefaultAsync(p => p.Id == playerId, ct)
            ?? throw new Common.Middleware.NotFoundException("Player", playerId);

        StripeConfiguration.ApiKey = _config["STRIPE_SECRET_KEY"]
            ?? throw new InvalidOperationException("STRIPE_SECRET_KEY not configured");

        var setupService = new SetupIntentService();
        var intent = await setupService.GetAsync(setupIntentId);

        if (intent.Status != "succeeded")
            throw new Common.Middleware.ValidationException($"SetupIntent status is '{intent.Status}', expected 'succeeded'.");

        var pmService = new PaymentMethodService();
        var pm = await pmService.GetAsync(intent.PaymentMethodId);

        // Upsert stripe_customers record
        var existing = await _db.StripeCustomers.FirstOrDefaultAsync(sc => sc.PlayerId == playerId, ct);
        if (existing is null)
        {
            _db.StripeCustomers.Add(new StripeCustomer
            {
                Id                    = Guid.NewGuid(),
                PlayerId              = playerId,
                StripeCustomerId      = player.StripeCustomerId ?? intent.CustomerId,
                StripePaymentMethodId = pm.Id,
                CardBrand             = pm.Card?.Brand,
                CardLast4             = pm.Card?.Last4,
                CreatedAt             = DateTime.UtcNow,
            });
        }
        else
        {
            existing.StripePaymentMethodId = pm.Id;
            existing.CardBrand             = pm.Card?.Brand;
            existing.CardLast4             = pm.Card?.Last4;
        }

        player.HasPaymentMethod  = true;
        player.StripeCustomerId  = intent.CustomerId;

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Player {PlayerId} saved card (pm={PaymentMethodId})", playerId, pm.Id);
    }

    /// <summary>
    /// Charges an auction winner off-session using their saved card.
    /// Creates a Stripe PaymentIntent with confirm:true, off_session:true.
    /// </summary>
    public async Task<string> ChargeWinnerAsync(
        Guid winnerId, CancellationToken ct = default)
    {
        var winner = await _db.AuctionWinners
            .Include(w => w.Player)
            .FirstOrDefaultAsync(w => w.Id == winnerId, ct)
            ?? throw new Common.Middleware.NotFoundException("AuctionWinner", winnerId);

        var sc = await _db.StripeCustomers.FirstOrDefaultAsync(s => s.PlayerId == winner.PlayerId, ct)
            ?? throw new Common.Middleware.ValidationException("Player has no saved payment method.");

        StripeConfiguration.ApiKey = _config["STRIPE_SECRET_KEY"]
            ?? throw new InvalidOperationException("STRIPE_SECRET_KEY not configured");

        var piService = new PaymentIntentService();
        var pi = await piService.CreateAsync(new PaymentIntentCreateOptions
        {
            Amount              = winner.AmountCents,
            Currency            = "usd",
            Customer            = sc.StripeCustomerId,
            PaymentMethod       = sc.StripePaymentMethodId,
            Confirm             = true,
            OffSession          = true,
            Metadata            = new Dictionary<string, string>
            {
                ["winner_id"]        = winnerId.ToString(),
                ["auction_item_id"]  = winner.AuctionItemId.ToString(),
                ["player_id"]        = winner.PlayerId.ToString(),
            }
        });

        winner.StripePaymentIntentId = pi.Id;

        if (pi.Status == "succeeded")
            winner.ChargeStatus = Domain.Enums.ChargeStatus.Succeeded;
        else if (pi.Status == "requires_action")
            winner.ChargeStatus = Domain.Enums.ChargeStatus.Failed;

        await _db.SaveChangesAsync(ct);

        return pi.Id;
    }

    /// <summary>
    /// Creates a Stripe PaymentIntent for an event entry fee, ensuring a Stripe Customer exists.
    /// Returns the PaymentIntent client_secret so the mobile app can confirm it with Stripe Elements.
    /// </summary>
    public async Task<string> CreateEntryFeePaymentIntentAsync(
        Guid playerId, int amountCents, string eventName, CancellationToken ct = default)
    {
        var player = await _db.Players.FirstOrDefaultAsync(p => p.Id == playerId, ct)
            ?? throw new Common.Middleware.NotFoundException("Player", playerId);

        StripeConfiguration.ApiKey = _config["STRIPE_SECRET_KEY"]
            ?? throw new InvalidOperationException("STRIPE_SECRET_KEY not configured");

        // Ensure Stripe customer exists
        if (string.IsNullOrEmpty(player.StripeCustomerId))
        {
            var customerService = new CustomerService();
            var customer = await customerService.CreateAsync(new CustomerCreateOptions
            {
                Email    = player.Email,
                Name     = $"{player.FirstName} {player.LastName}",
                Metadata = new Dictionary<string, string> { ["player_id"] = player.Id.ToString() }
            });
            player.StripeCustomerId = customer.Id;
            await _db.SaveChangesAsync(ct);
        }

        var piService = new PaymentIntentService();
        var pi = await piService.CreateAsync(new PaymentIntentCreateOptions
        {
            Amount             = amountCents,
            Currency           = "usd",
            Customer           = player.StripeCustomerId,
            PaymentMethodTypes = new List<string> { "card" },
            Metadata           = new Dictionary<string, string>
            {
                ["player_id"]  = playerId.ToString(),
                ["entry_fee"]  = "true",
                ["event_name"] = eventName,
            },
            Description        = $"Entry fee — {eventName}",
        });

        return pi.ClientSecret!;
    }
}
