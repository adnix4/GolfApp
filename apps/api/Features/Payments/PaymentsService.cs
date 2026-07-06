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
    public async Task<string> CreateSetupIntentAsync(
        Guid playerId, string sessionToken, CancellationToken ct = default)
    {
        var player = await _db.Players.FirstOrDefaultAsync(p => p.Id == playerId, ct)
            ?? throw new Common.Middleware.NotFoundException("Player", playerId);

        // Authorization: only the player themselves (proven by the /join session
        // token) may attach a card to their Stripe customer.
        if (!Common.PlayerSessionAuth.Matches(player.SessionToken, sessionToken))
            throw new Common.Middleware.NotFoundException("Player", playerId);

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
    public async Task ConfirmSetupAsync(
        Guid playerId, string setupIntentId, string sessionToken, CancellationToken ct = default)
    {
        var player = await _db.Players.FirstOrDefaultAsync(p => p.Id == playerId, ct)
            ?? throw new Common.Middleware.NotFoundException("Player", playerId);

        // Authorization: same session-token gate as CreateSetupIntent.
        if (!Common.PlayerSessionAuth.Matches(player.SessionToken, sessionToken))
            throw new Common.Middleware.NotFoundException("Player", playerId);

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
    /// Creates a Stripe PaymentIntent covering the per-golfer entry fee for one or
    /// more players (the registering golfer pays for everyone they registered).
    /// The Stripe Customer is created for the payer (first player). Returns the
    /// client_secret so the mobile app can confirm it with the Stripe card field.
    /// </summary>
    public async Task<string> CreateEntryFeePaymentIntentAsync(
        IReadOnlyList<Guid> playerIds, int feePerPlayerCents, string eventName, CancellationToken ct = default)
    {
        if (playerIds.Count == 0)
            throw new ArgumentException("At least one player is required.", nameof(playerIds));

        var payer = await _db.Players.FirstOrDefaultAsync(p => p.Id == playerIds[0], ct)
            ?? throw new Common.Middleware.NotFoundException("Player", playerIds[0]);

        StripeConfiguration.ApiKey = _config["STRIPE_SECRET_KEY"]
            ?? throw new InvalidOperationException("STRIPE_SECRET_KEY not configured");

        // Ensure Stripe customer exists for the payer
        if (string.IsNullOrEmpty(payer.StripeCustomerId))
        {
            var customerService = new CustomerService();
            var customer = await customerService.CreateAsync(new CustomerCreateOptions
            {
                Email    = payer.Email,
                Name     = $"{payer.FirstName} {payer.LastName}",
                Metadata = new Dictionary<string, string> { ["player_id"] = payer.Id.ToString() }
            });
            payer.StripeCustomerId = customer.Id;
            await _db.SaveChangesAsync(ct);
        }

        var piService = new PaymentIntentService();
        var pi = await piService.CreateAsync(new PaymentIntentCreateOptions
        {
            Amount             = feePerPlayerCents * playerIds.Count,
            Currency           = "usd",
            Customer           = payer.StripeCustomerId,
            PaymentMethodTypes = new List<string> { "card" },
            Metadata           = new Dictionary<string, string>
            {
                ["entry_fee"]      = "true",
                ["player_ids"]     = string.Join(",", playerIds),
                ["fee_per_player"] = feePerPlayerCents.ToString(),
                ["event_name"]     = eventName,
            },
            Description        = $"Entry fee — {eventName} ({playerIds.Count} golfer{(playerIds.Count == 1 ? "" : "s")})",
        });

        return pi.ClientSecret!;
    }

    /// <summary>
    /// Marks every golfer covered by a succeeded entry-fee PaymentIntent as paid.
    /// Called from the Stripe webhook and from the client confirm endpoint (the
    /// intent is always re-fetched/verified server-side first, so a caller can
    /// never mark players paid without a real Stripe payment). Idempotent.
    /// </summary>
    public async Task<bool> ApplyEntryFeePaymentAsync(PaymentIntent pi, CancellationToken ct = default)
    {
        if (pi.Status != "succeeded") return false;
        if (!pi.Metadata.TryGetValue("entry_fee", out var flag) || flag != "true") return false;
        if (!pi.Metadata.TryGetValue("player_ids", out var idsRaw)) return false;

        var playerIds = idsRaw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => Guid.TryParse(s, out var g) ? g : Guid.Empty)
            .Where(g => g != Guid.Empty)
            .ToList();
        if (playerIds.Count == 0) return false;

        var feePerPlayer = pi.Metadata.TryGetValue("fee_per_player", out var feeRaw)
                           && int.TryParse(feeRaw, out var fee)
            ? fee
            : (int)(pi.Amount / playerIds.Count);

        var players = await _db.Players.Where(p => playerIds.Contains(p.Id)).ToListAsync(ct);
        foreach (var player in players.Where(p => p.EntryFeePaidCents == 0))
        {
            player.EntryFeePaidCents = feePerPlayer;
            player.EntryFeePaidAt    = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Entry fee recorded for {Count} golfer(s) at {Fee}¢ each (pi={Pi})",
            players.Count, feePerPlayer, pi.Id);
        return true;
    }

    /// <summary>
    /// Client-driven confirmation fallback: the mobile app calls this right after
    /// Stripe confirms the card payment, so paid status appears immediately even
    /// before the webhook arrives. The intent is fetched from Stripe and verified
    /// there — the caller supplies only an id, never payment state.
    /// </summary>
    public async Task<bool> ConfirmEntryFeeAsync(string paymentIntentId, CancellationToken ct = default)
    {
        StripeConfiguration.ApiKey = _config["STRIPE_SECRET_KEY"]
            ?? throw new InvalidOperationException("STRIPE_SECRET_KEY not configured");

        var pi = await new PaymentIntentService().GetAsync(paymentIntentId, cancellationToken: ct);
        return await ApplyEntryFeePaymentAsync(pi, ct);
    }
}
