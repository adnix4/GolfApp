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

    // ── Staff-entered cards ─────────────────────────────────────────────────────
    //
    // Staff can save a card for a golfer who cannot use the app. Authorization is
    // org+event ownership of that player instead of a session token, so these
    // guards are what stand between one organizer and another org's golfers.

    private static (Guid orgId, Guid eventId) SeedEvent(ApplicationDbContext db)
    {
        var orgId   = Guid.NewGuid();
        var eventId = Guid.NewGuid();
        db.Organizations.Add(new Organization { Id = orgId, Name = "Org", Slug = $"org-{orgId:N}" });
        db.Events.Add(new Event
        {
            Id = eventId, OrgId = orgId, Name = "Gala", EventCode = "STAFFCRD",
            Format = GolfFundraiserPro.Api.Domain.Enums.EventFormat.Scramble,
            StartType = GolfFundraiserPro.Api.Domain.Enums.EventStartType.Shotgun,
            Holes = 18, Status = GolfFundraiserPro.Api.Domain.Enums.EventStatus.Active,
            ConfigJson = "{}",
        });
        db.SaveChanges();
        return (orgId, eventId);
    }

    private static Guid SeedPlayerInEvent(ApplicationDbContext db, Guid eventId)
    {
        var id = Guid.NewGuid();
        db.Players.Add(new Player
        {
            Id = id, EventId = eventId, FirstName = "No", LastName = "Phone",
            Email = $"{id}@example.com", SessionToken = null,
        });
        db.SaveChanges();
        return id;
    }

    [Fact]
    public async Task Staff_setup_intent_refuses_an_event_belonging_to_another_org()
    {
        var (svc, db) = Build();
        var (_, eventId) = SeedEvent(db);
        var playerId = SeedPlayerInEvent(db, eventId);

        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.CreateSetupIntentForStaffAsync(Guid.NewGuid(), eventId, playerId));
    }

    [Fact]
    public async Task Staff_setup_intent_refuses_a_player_from_a_different_event()
    {
        // Same org, wrong event — the player must belong to the event in the route
        // or an organizer could card any golfer they can guess the id of.
        var (svc, db) = Build();
        var (orgId, eventId)   = SeedEvent(db);
        var (_,     otherEvent) = SeedEvent(db);
        var strangerId = SeedPlayerInEvent(db, otherEvent);

        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.CreateSetupIntentForStaffAsync(orgId, eventId, strangerId));
    }

    [Fact]
    public async Task Staff_confirm_refuses_an_event_belonging_to_another_org()
    {
        var (svc, db) = Build();
        var (_, eventId) = SeedEvent(db);
        var playerId = SeedPlayerInEvent(db, eventId);

        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.ConfirmSetupForStaffAsync(Guid.NewGuid(), eventId, playerId, "seti_x"));
    }

    [Fact]
    public async Task Staff_confirm_refuses_a_player_from_a_different_event()
    {
        var (svc, db) = Build();
        var (orgId, eventId)   = SeedEvent(db);
        var (_,     otherEvent) = SeedEvent(db);
        var strangerId = SeedPlayerInEvent(db, otherEvent);

        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.ConfirmSetupForStaffAsync(orgId, eventId, strangerId, "seti_x"));
    }

    [Fact]
    public async Task The_staff_path_does_not_weaken_the_golfers_own_session_token_gate()
    {
        // A golfer with no session token at all (the desk-entered case) still
        // cannot be carded through the self-service endpoints, which fail closed.
        var (svc, db) = Build();
        var (_, eventId) = SeedEvent(db);
        var playerId = SeedPlayerInEvent(db, eventId);   // SessionToken == null

        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.CreateSetupIntentAsync(playerId, "anything"));
        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.ConfirmSetupAsync(playerId, "seti_x", "anything"));
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
            () => svc.CreateEntryFeePaymentIntentAsync([Guid.NewGuid()], 5000, "Gala"));
    }

    [Fact]
    public async Task CreateEntryFeePaymentIntent_empty_player_list_throws()
    {
        var (svc, _) = Build();
        await Assert.ThrowsAsync<ArgumentException>(
            () => svc.CreateEntryFeePaymentIntentAsync([], 5000, "Gala"));
    }

    // ── ApplyEntryFeePayment ────────────────────────────────────────────────────

    private static Stripe.PaymentIntent EntryFeeIntent(
        string status, int amount, string? playerIds, string? feePerPlayer = null)
    {
        var metadata = new Dictionary<string, string> { ["entry_fee"] = "true" };
        if (playerIds is not null)    metadata["player_ids"]     = playerIds;
        if (feePerPlayer is not null) metadata["fee_per_player"] = feePerPlayer;
        return new Stripe.PaymentIntent { Status = status, Amount = amount, Metadata = metadata };
    }

    [Fact]
    public async Task ApplyEntryFeePayment_marks_each_covered_golfer_paid()
    {
        var (svc, db) = Build();
        var p1 = SeedPlayer(db);
        var p2 = SeedPlayer(db);

        var recorded = await svc.ApplyEntryFeePaymentAsync(
            EntryFeeIntent("succeeded", 10000, $"{p1},{p2}", "5000"));

        Assert.True(recorded);
        Assert.All(db.Players.Where(p => p.Id == p1 || p.Id == p2),
            p => { Assert.Equal(5000, p.EntryFeePaidCents); Assert.NotNull(p.EntryFeePaidAt); });
    }

    [Fact]
    public async Task ApplyEntryFeePayment_is_idempotent()
    {
        var (svc, db) = Build();
        var p1 = SeedPlayer(db);
        var pi = EntryFeeIntent("succeeded", 5000, p1.ToString(), "5000");

        await svc.ApplyEntryFeePaymentAsync(pi);
        var firstPaidAt = db.Players.Single(p => p.Id == p1).EntryFeePaidAt;
        await svc.ApplyEntryFeePaymentAsync(pi);

        Assert.Equal(firstPaidAt, db.Players.Single(p => p.Id == p1).EntryFeePaidAt);
        Assert.Equal(5000, db.Players.Single(p => p.Id == p1).EntryFeePaidCents);
    }

    [Fact]
    public async Task ApplyEntryFeePayment_ignores_non_succeeded_intents()
    {
        var (svc, db) = Build();
        var p1 = SeedPlayer(db);

        var recorded = await svc.ApplyEntryFeePaymentAsync(
            EntryFeeIntent("requires_payment_method", 5000, p1.ToString(), "5000"));

        Assert.False(recorded);
        Assert.Equal(0, db.Players.Single(p => p.Id == p1).EntryFeePaidCents);
    }

    [Fact]
    public async Task ApplyEntryFeePayment_without_player_ids_metadata_is_ignored()
    {
        var (svc, _) = Build();
        var recorded = await svc.ApplyEntryFeePaymentAsync(
            EntryFeeIntent("succeeded", 5000, playerIds: null));
        Assert.False(recorded);
    }

    [Fact]
    public async Task ApplyEntryFeePayment_derives_fee_from_amount_when_metadata_missing()
    {
        var (svc, db) = Build();
        var p1 = SeedPlayer(db);
        var p2 = SeedPlayer(db);

        var recorded = await svc.ApplyEntryFeePaymentAsync(
            EntryFeeIntent("succeeded", 12000, $"{p1},{p2}"));

        Assert.True(recorded);
        Assert.All(db.Players.Where(p => p.Id == p1 || p.Id == p2),
            p => Assert.Equal(6000, p.EntryFeePaidCents));
    }
}
