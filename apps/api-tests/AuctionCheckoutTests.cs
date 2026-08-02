using Xunit;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Configuration;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Auction;
using GolfFundraiserPro.Api.Features.Payments;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests;

/// <summary>
/// The auction checkout desk.
///
/// Cash and check never touch Stripe, which is what lets these tests (and a real
/// desk on a bad network, and any environment without a Stripe key) settle a
/// winner end to end. The card path is exercised for its failure handling only —
/// there is no Stripe account behind these tests, so a card charge here is
/// expected to fail and leave the line outstanding rather than silently
/// pretending the money arrived.
/// </summary>
public class AuctionCheckoutTests
{
    private static (AuctionCheckoutService svc, GolfFundraiserPro.Api.Data.ApplicationDbContext db) Build()
    {
        var db = InMemoryDbFactory.Create();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["JWT_SECRET"] = "test-secret" })
            .Build();

        var payments = new PaymentsService(db, config, NullLogger<PaymentsService>.Instance);
        var svc      = new AuctionCheckoutService(db, payments, NullLogger<AuctionCheckoutService>.Instance);
        return (svc, db);
    }

    private static async Task<(Guid orgId, Guid eventId)> SeedEventAsync(
        GolfFundraiserPro.Api.Data.ApplicationDbContext db)
    {
        var orgId   = Guid.NewGuid();
        var eventId = Guid.NewGuid();

        db.Organizations.Add(new Organization { Id = orgId, Name = "Org", Slug = "org" });
        db.Events.Add(new Event
        {
            Id         = eventId,
            OrgId      = orgId,
            Name       = "Gala",
            EventCode  = "CHKOUT01",
            Format     = EventFormat.Scramble,
            StartType  = EventStartType.Shotgun,
            Holes      = 18,
            Status     = EventStatus.Completed,
            ConfigJson = "{}",
        });

        await db.SaveChangesAsync();
        return (orgId, eventId);
    }

    private static Player AddPlayer(
        GolfFundraiserPro.Api.Data.ApplicationDbContext db, Guid eventId,
        bool hasPayment = false, string? sessionToken = null)
    {
        var p = new Player
        {
            Id               = Guid.NewGuid(),
            EventId          = eventId,
            FirstName        = "Dana",
            LastName         = "Winner",
            Email            = $"{Guid.NewGuid()}@t.com",
            HasPaymentMethod = hasPayment,
            CheckInStatus    = CheckInStatus.CheckedIn,
            RegistrationType = RegistrationType.FullTeam,
            SessionToken     = sessionToken,
        };
        db.Players.Add(p);
        return p;
    }

    private static AuctionItem AddItem(
        GolfFundraiserPro.Api.Data.ApplicationDbContext db, Guid eventId,
        AuctionType type = AuctionType.Silent, string title = "Lot",
        AuctionItemStatus status = AuctionItemStatus.Closed)
    {
        var item = new AuctionItem
        {
            Id                   = Guid.NewGuid(),
            EventId              = eventId,
            Title                = title,
            Description          = "",
            PhotoUrlsJson        = "[]",
            AuctionType          = type,
            Status               = status,
            StartingBidCents     = 1000,
            BidIncrementCents    = 500,
            CurrentHighBidCents  = 0,
            MaxExtensionMin      = 10,
            FairMarketValueCents = 1000,
            CreatedAt            = DateTime.UtcNow,
        };
        db.AuctionItems.Add(item);
        return item;
    }

    private static AuctionWinner AddWinner(
        GolfFundraiserPro.Api.Data.ApplicationDbContext db,
        Guid itemId, Guid playerId, int amountCents,
        ChargeStatus status = ChargeStatus.Pending)
    {
        var w = new AuctionWinner
        {
            Id            = Guid.NewGuid(),
            AuctionItemId = itemId,
            PlayerId      = playerId,
            AmountCents   = amountCents,
            ChargeStatus  = status,
            CreatedAt     = DateTime.UtcNow,
        };
        db.AuctionWinners.Add(w);
        return w;
    }

    // ── Cash and check settle without Stripe ──────────────────────────────────

    [Fact]
    public async Task Settling_by_cash_records_the_money_without_calling_Stripe()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId);
        var item   = AddItem(db, eventId);
        var winner = AddWinner(db, item.Id, player.Id, 7500);
        await db.SaveChangesAsync();

        var result = await svc.SettleAsync(
            orgId, eventId, player.Id,
            new SettleCheckoutRequest { Method = SettlementMethod.Cash, MarkPickedUp = true },
            settledByUserId: Guid.NewGuid());

        var saved = await db.AuctionWinners.FindAsync(winner.Id);
        Assert.Equal(ChargeStatus.Succeeded,   saved!.ChargeStatus);
        Assert.Equal(SettlementMethod.Cash,    saved.SettlementMethod);
        Assert.NotNull(saved.CheckedOutAt);
        Assert.NotNull(saved.PickedUpAt);
        Assert.NotNull(saved.SettledByUserId);
        Assert.Null(saved.StripePaymentIntentId);   // never went near Stripe

        Assert.Equal(1, result.Settled);
        Assert.Equal(0, result.Failed);
        Assert.Equal(7500, result.SettledCents);
        Assert.Equal(0, result.Cart.OutstandingCents);
    }

    [Fact]
    public async Task Settling_by_check_covers_every_lot_the_winner_took()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId);
        var a = AddItem(db, eventId, title: "Driver");
        var b = AddItem(db, eventId, title: "Weekend away");
        AddWinner(db, a.Id, player.Id, 5000);
        AddWinner(db, b.Id, player.Id, 12000);
        await db.SaveChangesAsync();

        var result = await svc.SettleAsync(
            orgId, eventId, player.Id,
            new SettleCheckoutRequest { Method = SettlementMethod.Check, MarkPickedUp = false },
            settledByUserId: null);

        Assert.Equal(2, result.Settled);
        Assert.Equal(17000, result.SettledCents);
        Assert.Equal(17000, result.Cart.SettledCents);
        Assert.Equal(0, result.Cart.OutstandingCents);
        // Payment is not handover — nothing was collected.
        Assert.All(result.Cart.Lines, l => Assert.Null(l.PickedUpAt));
    }

    // ── Idempotence: never take the money twice ───────────────────────────────

    [Fact]
    public async Task Settling_twice_does_not_charge_an_already_settled_winner_again()
    {
        // The desk is busy and someone will double-tap. Only Pending and Failed
        // lines are touched, so the second call has nothing left to do.
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId);
        var item   = AddItem(db, eventId);
        AddWinner(db, item.Id, player.Id, 4200);
        await db.SaveChangesAsync();

        var req = new SettleCheckoutRequest { Method = SettlementMethod.Cash, MarkPickedUp = false };
        await svc.SettleAsync(orgId, eventId, player.Id, req, null);
        var second = await svc.SettleAsync(orgId, eventId, player.Id, req, null);

        Assert.Equal(0, second.Settled);
        Assert.Equal(0, second.SettledCents);
        Assert.Equal(4200, second.Cart.SettledCents);
    }

    [Fact]
    public async Task A_waived_charge_is_treated_as_settled_and_left_alone()
    {
        // The organizer already decided nothing is owed; the desk must stop
        // chasing it rather than quietly collecting anyway.
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId);
        var item   = AddItem(db, eventId);
        var winner = AddWinner(db, item.Id, player.Id, 6000, ChargeStatus.Waived);
        await db.SaveChangesAsync();

        var result = await svc.SettleAsync(
            orgId, eventId, player.Id,
            new SettleCheckoutRequest { Method = SettlementMethod.Cash, MarkPickedUp = false }, null);

        Assert.Equal(0, result.Settled);
        Assert.Equal(0, result.Cart.OutstandingCents);
        Assert.Equal(ChargeStatus.Waived, (await db.AuctionWinners.FindAsync(winner.Id))!.ChargeStatus);
    }

    // ── Card failure leaves the debt visible ──────────────────────────────────

    [Fact]
    public async Task A_failed_card_charge_leaves_the_line_outstanding()
    {
        // No Stripe customer exists, so the charge cannot succeed. The important
        // part is that the desk is told, and the money is still owed.
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId, hasPayment: true);
        var item   = AddItem(db, eventId);
        var winner = AddWinner(db, item.Id, player.Id, 8800);
        await db.SaveChangesAsync();

        var result = await svc.SettleAsync(
            orgId, eventId, player.Id,
            new SettleCheckoutRequest { Method = SettlementMethod.Card, MarkPickedUp = false }, null);

        Assert.Equal(0, result.Settled);
        Assert.Equal(1, result.Failed);
        Assert.Equal(8800, result.Cart.OutstandingCents);

        var saved = await db.AuctionWinners.FindAsync(winner.Id);
        Assert.Equal(ChargeStatus.Failed, saved!.ChargeStatus);
        Assert.Null(saved.CheckedOutAt);       // not settled, so not stamped
        Assert.Null(saved.SettlementMethod);
    }

    // ── Handover is independent of payment ────────────────────────────────────

    [Fact]
    public async Task An_item_can_be_handed_over_before_it_is_paid_for()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId);
        var item   = AddItem(db, eventId);
        var winner = AddWinner(db, item.Id, player.Id, 3000);
        await db.SaveChangesAsync();

        await svc.MarkPickedUpAsync(orgId, winner.Id);

        var saved = await db.AuctionWinners.FindAsync(winner.Id);
        Assert.NotNull(saved!.PickedUpAt);
        Assert.Equal(ChargeStatus.Pending, saved.ChargeStatus); // still owes
    }

    [Fact]
    public async Task Marking_a_pickup_twice_keeps_the_first_handover_time()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId);
        var item   = AddItem(db, eventId);
        var winner = AddWinner(db, item.Id, player.Id, 3000);
        await db.SaveChangesAsync();

        await svc.MarkPickedUpAsync(orgId, winner.Id);
        var first = (await db.AuctionWinners.FindAsync(winner.Id))!.PickedUpAt;
        await svc.MarkPickedUpAsync(orgId, winner.Id);

        Assert.Equal(first, (await db.AuctionWinners.FindAsync(winner.Id))!.PickedUpAt);
    }

    // ── The desk queue ────────────────────────────────────────────────────────

    [Fact]
    public async Task The_desk_groups_every_lot_a_winner_took_into_one_row()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId);
        var a = AddItem(db, eventId, title: "A");
        var b = AddItem(db, eventId, title: "B");
        AddWinner(db, a.Id, player.Id, 5000);
        AddWinner(db, b.Id, player.Id, 2500, ChargeStatus.Succeeded);
        await db.SaveChangesAsync();

        var row = Assert.Single(await svc.GetDeskAsync(orgId, eventId));

        Assert.Equal(2, row.ItemsWon);
        Assert.Equal(7500, row.TotalCents);
        Assert.Equal(2500, row.SettledCents);
        Assert.Equal(5000, row.OutstandingCents);
        Assert.False(row.IsComplete);
        Assert.False(row.HasPaymentMethod);
        Assert.Equal("Dana Winner", row.PlayerName);
    }

    [Fact]
    public async Task Fund_a_Need_pledges_never_reach_the_checkout_desk()
    {
        // They are charged on close and there is nothing to collect, so sending
        // a pledger to a desk to claim nothing would be pure friction.
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var player   = AddPlayer(db, eventId);
        var pledge   = AddItem(db, eventId, AuctionType.DonationSilent, "Fund a Need");
        AddWinner(db, pledge.Id, player.Id, 10000, ChargeStatus.Succeeded);
        await db.SaveChangesAsync();

        Assert.Empty(await svc.GetDeskAsync(orgId, eventId));
    }

    [Fact]
    public async Task A_cancelled_lot_is_not_collectable()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId);
        var item   = AddItem(db, eventId, status: AuctionItemStatus.Cancelled);
        AddWinner(db, item.Id, player.Id, 4000);
        await db.SaveChangesAsync();

        Assert.Empty(await svc.GetDeskAsync(orgId, eventId));
    }

    [Fact]
    public async Task A_row_is_complete_only_when_it_is_both_paid_and_collected()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId);
        var item   = AddItem(db, eventId);
        var winner = AddWinner(db, item.Id, player.Id, 4000, ChargeStatus.Succeeded);
        await db.SaveChangesAsync();

        Assert.False((await svc.GetDeskAsync(orgId, eventId)).Single().IsComplete);

        await svc.MarkPickedUpAsync(orgId, winner.Id);

        Assert.True((await svc.GetDeskAsync(orgId, eventId)).Single().IsComplete);
    }

    [Fact]
    public async Task The_desk_refuses_an_event_belonging_to_another_org()
    {
        var (svc, db) = Build();
        var (_, eventId) = await SeedEventAsync(db);

        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.GetDeskAsync(Guid.NewGuid(), eventId));
    }

    // ── Golfer self-service ───────────────────────────────────────────────────

    [Fact]
    public async Task A_golfer_can_read_their_own_cart_with_their_session_token()
    {
        var (svc, db) = Build();
        var (_, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId, sessionToken: "tok-abc");
        var item   = AddItem(db, eventId, title: "Putter");
        AddWinner(db, item.Id, player.Id, 9000);
        await db.SaveChangesAsync();

        var cart = await svc.GetPlayerCartAsync(player.Id, "tok-abc");

        Assert.Equal(9000, cart.OutstandingCents);
        Assert.Equal("Putter", Assert.Single(cart.Lines).ItemTitle);
    }

    [Fact]
    public async Task A_wrong_session_token_cannot_read_someone_elses_cart()
    {
        // Golfers have no password, so the token is the whole authorization. It
        // fails closed, and gives the same answer as an unknown id so it cannot
        // be used to probe for real players.
        var (svc, db) = Build();
        var (_, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId, sessionToken: "tok-abc");
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.GetPlayerCartAsync(player.Id, "tok-wrong"));
        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.GetPlayerCartAsync(player.Id, null));
    }

    [Fact]
    public async Task A_golfer_with_no_card_is_told_to_add_one_rather_than_silently_failing()
    {
        var (svc, db) = Build();
        var (_, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId, hasPayment: false, sessionToken: "tok-abc");
        var item   = AddItem(db, eventId);
        AddWinner(db, item.Id, player.Id, 5000);
        await db.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<ValidationException>(
            () => svc.ConfirmPlayerCheckoutAsync(player.Id, "tok-abc"));
        Assert.Equal("NO_PAYMENT_METHOD", ex.Message);
    }
}
