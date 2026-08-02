using Xunit;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Configuration;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Auction;
using GolfFundraiserPro.Api.Features.Emails;
using GolfFundraiserPro.Api.Features.Notifications;
using GolfFundraiserPro.Api.Features.Payments;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests;

/// <summary>
/// End Auction — the organizer's end-of-night settlement.
///
/// Before this existed the auction never really ended: silent lots closed on
/// their own timers, but a Live lot carries no ClosesAt so nothing ever swept it
/// up, and "End Auction" only ended the live SESSION while leaving every item
/// Open. These tests pin the settlement behaviour and, importantly, that the
/// preview promises exactly what the commit then does.
/// </summary>
public class AuctionEndTests
{
    private static (AuctionService svc, GolfFundraiserPro.Api.Data.ApplicationDbContext db) Build()
    {
        var db = InMemoryDbFactory.Create();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["JWT_SECRET"] = "test-secret" })
            .Build();

        var payments = new PaymentsService(db, config, NullLogger<PaymentsService>.Instance);
        var email    = new EmailService(db, config, NullLogger<EmailService>.Instance);
        var push     = new PushNotificationService(new NullHttpClientFactory(), NullLogger<PushNotificationService>.Instance);
        var svc      = new AuctionService(db, new NullRealTimeService(), payments, email, push,
                                          new FakeFileStorage(), NullLogger<AuctionService>.Instance);
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
            EventCode  = "ENDTEST1",
            Format     = EventFormat.Scramble,
            StartType  = EventStartType.Shotgun,
            Holes      = 18,
            Status     = EventStatus.Active,
            ConfigJson = "{}",
        });

        await db.SaveChangesAsync();
        return (orgId, eventId);
    }

    private static Player AddPlayer(
        GolfFundraiserPro.Api.Data.ApplicationDbContext db, Guid eventId, bool hasPayment = true)
    {
        var p = new Player
        {
            Id               = Guid.NewGuid(),
            EventId          = eventId,
            FirstName        = "Test",
            LastName         = "Player",
            Email            = $"{Guid.NewGuid()}@t.com",
            HasPaymentMethod = hasPayment,
            CheckInStatus    = CheckInStatus.CheckedIn,
            RegistrationType = RegistrationType.FullTeam,
        };
        db.Players.Add(p);
        return p;
    }

    private static AuctionItem AddItem(
        GolfFundraiserPro.Api.Data.ApplicationDbContext db,
        Guid eventId, AuctionType type, DateTime? closesAt, string title = "Lot")
    {
        var item = new AuctionItem
        {
            Id                   = Guid.NewGuid(),
            EventId              = eventId,
            Title                = title,
            Description          = "",
            PhotoUrlsJson        = "[]",
            AuctionType          = type,
            Status               = AuctionItemStatus.Open,
            StartingBidCents     = 1000,
            BidIncrementCents    = 500,
            CurrentHighBidCents  = 0,
            ClosesAt             = closesAt,
            OriginalClosesAt     = closesAt,
            MaxExtensionMin      = 10,
            FairMarketValueCents = 1000,
            CreatedAt            = DateTime.UtcNow,
        };
        db.AuctionItems.Add(item);
        return item;
    }

    private static void AddBid(
        GolfFundraiserPro.Api.Data.ApplicationDbContext db, Guid itemId, Guid playerId, int amountCents)
    {
        db.Bids.Add(new Bid
        {
            Id            = Guid.NewGuid(),
            AuctionItemId = itemId,
            PlayerId      = playerId,
            AmountCents   = amountCents,
            PlacedAt      = DateTime.UtcNow,
        });
    }

    // ── Closing early ─────────────────────────────────────────────────────────

    [Fact]
    public async Task EndAuction_closes_a_silent_lot_whose_timer_has_not_expired()
    {
        // The organizer is calling time; the timer is irrelevant once they do.
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId);
        var item   = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddHours(2));
        item.CurrentHighBidCents = 4000; // what bidding leaves behind on the item
        AddBid(db, item.Id, player.Id, 4000);
        await db.SaveChangesAsync();

        var summary = await svc.EndAuctionAsync(orgId, eventId);

        Assert.Equal(AuctionItemStatus.Closed, (await db.AuctionItems.FindAsync(item.Id))!.Status);
        Assert.Equal(1, summary.LotsClosed);
        Assert.Equal(1, summary.LotsSold);
        Assert.Equal(0, summary.LotsUnsold);
        Assert.Equal(1, summary.WinnersCreated);
        Assert.Equal(4000, summary.OutstandingCents);
    }

    [Fact]
    public async Task EndAuction_marks_lots_with_no_bids_Unsold_and_counts_them_separately()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId);
        var sold   = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddHours(1), "Sold");
        var unsold = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddHours(1), "Unsold");
        AddBid(db, sold.Id, player.Id, 6000);
        await db.SaveChangesAsync();

        var summary = await svc.EndAuctionAsync(orgId, eventId);

        Assert.Equal(AuctionItemStatus.Closed, (await db.AuctionItems.FindAsync(sold.Id))!.Status);
        Assert.Equal(AuctionItemStatus.Unsold, (await db.AuctionItems.FindAsync(unsold.Id))!.Status);
        Assert.Equal(2, summary.LotsClosed);
        Assert.Equal(1, summary.LotsSold);
        Assert.Equal(1, summary.LotsUnsold);
    }

    // ── Live lots are parked, never force-closed ──────────────────────────────

    [Fact]
    public async Task EndAuction_parks_an_unawarded_live_lot_instead_of_closing_it()
    {
        // On-stage bidding is tracked by called amount, not by real bid rows, so
        // the highest recorded bid may belong to someone who dropped out long
        // before the hammer. Awarding that automatically would sell to the wrong
        // person, so the host has to decide.
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId);
        var live   = AddItem(db, eventId, AuctionType.Live, closesAt: null, title: "Signed Driver");
        live.CurrentHighBidCents = 25000;
        AddBid(db, live.Id, player.Id, 25000);
        await db.SaveChangesAsync();

        var summary = await svc.EndAuctionAsync(orgId, eventId);

        Assert.Equal(AuctionItemStatus.Open, (await db.AuctionItems.FindAsync(live.Id))!.Status);
        Assert.Empty(db.AuctionWinners.Where(w => w.AuctionItemId == live.Id));
        Assert.Equal(0, summary.LotsClosed);

        var parked = Assert.Single(summary.LiveLotsAwaitingAward);
        Assert.Equal(live.Id, parked.ItemId);
        Assert.Equal("Signed Driver", parked.Title);
        Assert.Equal(25000, parked.CurrentHighBidCents);
    }

    [Fact]
    public async Task EndAuction_closes_a_live_lot_that_was_given_a_timer()
    {
        // A Live lot with a ClosesAt was being bid on against a clock, and the
        // clock is what the bidders were watching — so it closes like any other
        // timed lot rather than waiting for a hammer that is not coming.
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId);
        var item   = AddItem(db, eventId, AuctionType.Live, DateTime.UtcNow.AddMinutes(30));
        AddBid(db, item.Id, player.Id, 7000);
        await db.SaveChangesAsync();

        var summary = await svc.EndAuctionAsync(orgId, eventId);

        Assert.Equal(AuctionItemStatus.Closed, (await db.AuctionItems.FindAsync(item.Id))!.Status);
        Assert.Empty(summary.LiveLotsAwaitingAward);
    }

    // ── Cardless winners are surfaced before settlement ───────────────────────

    [Fact]
    public async Task EndAuction_counts_winners_with_no_card_on_file()
    {
        // Check-in waives the saved-card requirement for bidding, so a golfer can
        // win with no card at all. The organizer needs to know before they start
        // settling, not after the charge fails.
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var withCard    = AddPlayer(db, eventId, hasPayment: true);
        var withoutCard = AddPlayer(db, eventId, hasPayment: false);

        var a = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddHours(1), "A");
        var b = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddHours(1), "B");
        AddBid(db, a.Id, withCard.Id,    5000);
        AddBid(db, b.Id, withoutCard.Id, 5000);
        await db.SaveChangesAsync();

        var summary = await svc.EndAuctionAsync(orgId, eventId);

        Assert.Equal(2, summary.WinnersCreated);
        Assert.Equal(1, summary.WinnersWithoutCard);
    }

    [Fact]
    public async Task EndAuction_excludes_Fund_a_Need_pledges_from_the_amount_owed_at_checkout()
    {
        // Pledges charge on close and have nothing to collect, so counting them
        // as outstanding would overstate what the desk has to take.
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId);

        var lot     = AddItem(db, eventId, AuctionType.Silent,         DateTime.UtcNow.AddHours(1), "Lot");
        var fundNeed = AddItem(db, eventId, AuctionType.DonationSilent, DateTime.UtcNow.AddHours(1), "Fund a Need");
        lot.CurrentHighBidCents = 3000;
        AddBid(db, lot.Id,      player.Id, 3000);
        AddBid(db, fundNeed.Id, player.Id, 9900);
        await db.SaveChangesAsync();

        var summary = await svc.EndAuctionAsync(orgId, eventId);

        Assert.Equal(2, summary.WinnersCreated);
        Assert.Equal(3000, summary.OutstandingCents); // the pledge is not owed at the desk
    }

    // ── Preview tells the truth ───────────────────────────────────────────────

    [Fact]
    public async Task Preview_changes_nothing_and_matches_what_ending_then_does()
    {
        // The preview is what the organizer reads before committing to an
        // irreversible settlement, so it has to be the same number.
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var p1 = AddPlayer(db, eventId);
        var p2 = AddPlayer(db, eventId, hasPayment: false);

        var sold   = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddHours(1), "Sold");
        var unsold = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddHours(1), "Unsold");
        var live   = AddItem(db, eventId, AuctionType.Live,   closesAt: null, title: "On stage");
        AddBid(db, sold.Id, p1.Id, 4000);
        AddBid(db, sold.Id, p2.Id, 8000);
        await db.SaveChangesAsync();

        var preview = await svc.PreviewEndAuctionAsync(orgId, eventId);

        // Nothing moved.
        Assert.Equal(AuctionItemStatus.Open, (await db.AuctionItems.FindAsync(sold.Id))!.Status);
        Assert.Equal(AuctionItemStatus.Open, (await db.AuctionItems.FindAsync(unsold.Id))!.Status);
        Assert.Empty(db.AuctionWinners);

        var actual = await svc.EndAuctionAsync(orgId, eventId);

        Assert.Equal(preview.LotsClosed,           actual.LotsClosed);
        Assert.Equal(preview.LotsSold,             actual.LotsSold);
        Assert.Equal(preview.LotsUnsold,           actual.LotsUnsold);
        Assert.Equal(preview.WinnersCreated,       actual.WinnersCreated);
        Assert.Equal(preview.OutstandingCents,     actual.OutstandingCents);
        Assert.Equal(preview.WinnersWithoutCard,   actual.WinnersWithoutCard);
        Assert.Equal(
            preview.LiveLotsAwaitingAward.Select(l => l.ItemId),
            actual.LiveLotsAwaitingAward.Select(l => l.ItemId));
        Assert.Equal(live.Id, actual.LiveLotsAwaitingAward.Single().ItemId);
    }

    // ── Idempotence + ownership ───────────────────────────────────────────────

    [Fact]
    public async Task Ending_an_already_ended_auction_is_a_harmless_no_op()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId);
        var item   = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddHours(1));
        AddBid(db, item.Id, player.Id, 5000);
        await db.SaveChangesAsync();

        await svc.EndAuctionAsync(orgId, eventId);
        var second = await svc.EndAuctionAsync(orgId, eventId);

        Assert.Equal(0, second.LotsClosed);
        Assert.Equal(0, second.WinnersCreated);
        // Critically, the first winner was not duplicated.
        Assert.Single(db.AuctionWinners.Where(w => w.AuctionItemId == item.Id));
    }

    [Fact]
    public async Task EndAuction_refuses_an_event_belonging_to_another_org()
    {
        var (svc, db) = Build();
        var (_, eventId) = await SeedEventAsync(db);

        await Assert.ThrowsAsync<GolfFundraiserPro.Api.Common.Middleware.NotFoundException>(
            () => svc.EndAuctionAsync(Guid.NewGuid(), eventId));
    }
}
