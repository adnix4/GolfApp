using Xunit;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Features.Payments;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Services;

/// <summary>
/// Tests for PaymentsService's authorization/validation guards — the logic that
/// runs BEFORE any Stripe API call (so it needs no Stripe key). These are the
/// security-critical IDOR gates on the player payment endpoints, plus the
/// "no saved card" guard on off-session winner charges.
/// </summary>
public class PaymentsServiceTests
{
    private static (PaymentsService svc, ApplicationDbContext db) Build()
    {
        var db = InMemoryDbFactory.Create();
        var config = new ConfigurationBuilder().Build(); // no STRIPE_SECRET_KEY — guards run first
        return (new PaymentsService(db, config, NullLogger<PaymentsService>.Instance), db);
    }

    private static Guid SeedPlayer(ApplicationDbContext db, string? sessionToken = "tok")
    {
        var id = Guid.NewGuid();
        db.Players.Add(new Player
        {
            Id = id, EventId = Guid.NewGuid(), FirstName = "P", LastName = "Q",
            Email = "p@example.com", SessionToken = sessionToken,
        });
        db.SaveChanges();
        return id;
    }

    // ── CreateSetupIntent ───────────────────────────────────────────────────────

    [Fact]
    public async Task CreateSetupIntent_unknown_player_throws_NotFound()
    {
        var (svc, _) = Build();
        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.CreateSetupIntentAsync(Guid.NewGuid(), "tok"));
    }

    [Fact]
    public async Task CreateSetupIntent_wrong_token_throws_NotFound()
    {
        var (svc, db) = Build();
        var playerId = SeedPlayer(db);
        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.CreateSetupIntentAsync(playerId, "wrong-token"));
    }

    // ── ConfirmSetup ────────────────────────────────────────────────────────────

    [Fact]
    public async Task ConfirmSetup_unknown_player_throws_NotFound()
    {
        var (svc, _) = Build();
        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.ConfirmSetupAsync(Guid.NewGuid(), "seti_x", "tok"));
    }

    [Fact]
    public async Task ConfirmSetup_wrong_token_throws_NotFound()
    {
        var (svc, db) = Build();
        var playerId = SeedPlayer(db);
        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.ConfirmSetupAsync(playerId, "seti_x", "wrong-token"));
    }

    // ── ChargeWinner ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task ChargeWinner_unknown_winner_throws_NotFound()
    {
        var (svc, _) = Build();
        await Assert.ThrowsAsync<NotFoundException>(() => svc.ChargeWinnerAsync(Guid.NewGuid()));
    }

    [Fact]
    public async Task ChargeWinner_without_saved_card_throws_Validation()
    {
        var (svc, db) = Build();
        var playerId = SeedPlayer(db);           // player exists, but has no StripeCustomer row
        var winnerId = Guid.NewGuid();
        db.AuctionWinners.Add(new AuctionWinner
        {
            Id = winnerId, AuctionItemId = Guid.NewGuid(), PlayerId = playerId,
            AmountCents = 5000,
        });
        db.SaveChanges();

        await Assert.ThrowsAsync<ValidationException>(() => svc.ChargeWinnerAsync(winnerId));
    }

    // ── CreateEntryFeePaymentIntent ─────────────────────────────────────────────

    [Fact]
    public async Task CreateEntryFeePaymentIntent_unknown_player_throws_NotFound()
    {
        var (svc, _) = Build();
        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.CreateEntryFeePaymentIntentAsync(Guid.NewGuid(), 5000, "Gala"));
    }
}
