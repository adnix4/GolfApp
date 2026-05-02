using Xunit;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Configuration;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Auction;
using GolfFundraiserPro.Api.Features.Payments;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests;

/// <summary>
/// Integration tests for AuctionService.ProcessExpiredItemsAsync (the Hangfire close job).
/// Uses an in-memory DB — no raw SQL, so no FOR-UPDATE issues.
/// Verifies:
///   • Expired Open items get closed
///   • Silent items: top bid becomes the winner
///   • Donation items: every bidder becomes a winner
///   • Non-expired items are untouched
/// </summary>
public class AuctionCloseJobIntegrationTests
{
    private static (AuctionService svc, GolfFundraiserPro.Api.Data.ApplicationDbContext db) Build()
    {
        var db  = InMemoryDbFactory.Create();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["JWT_SECRET"] = "test-secret" })
            .Build();

        var payments = new PaymentsService(db, config, NullLogger<PaymentsService>.Instance);
        var svc      = new AuctionService(db, new NullRealTimeService(), payments,
                                          NullLogger<AuctionService>.Instance);
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
            EventCode  = "AUCTTEST",
            Format     = EventFormat.Scramble,
            StartType  = EventStartType.Shotgun,
            Holes      = 18,
            Status     = EventStatus.Active,
            ConfigJson = "{}",
        });

        await db.SaveChangesAsync();
        return (orgId, eventId);
    }

    private static Player AddPlayer(GolfFundraiserPro.Api.Data.ApplicationDbContext db, Guid eventId, bool hasPayment = true)
    {
        var p = new Player
        {
            Id              = Guid.NewGuid(),
            EventId         = eventId,
            FirstName       = "Test",
            LastName        = "Player",
            Email           = $"{Guid.NewGuid()}@t.com",
            HasPaymentMethod = hasPayment,
            CheckInStatus   = CheckInStatus.CheckedIn,
            RegistrationType = RegistrationType.FullTeam,
        };
        db.Players.Add(p);
        return p;
    }

    private static AuctionItem AddItem(
        GolfFundraiserPro.Api.Data.ApplicationDbContext db,
        Guid eventId,
        AuctionType type,
        DateTime? closesAt,
        int startingBidCents = 1000,
        int bidIncrementCents = 500)
    {
        var item = new AuctionItem
        {
            Id                = Guid.NewGuid(),
            EventId           = eventId,
            Title             = "Test Item",
            Description       = "",
            PhotoUrlsJson     = "[]",
            AuctionType       = type,
            Status            = AuctionItemStatus.Open,
            StartingBidCents  = startingBidCents,
            BidIncrementCents = bidIncrementCents,
            CurrentHighBidCents = 0,
            ClosesAt          = closesAt,
            OriginalClosesAt  = closesAt,
            MaxExtensionMin   = 10,
            FairMarketValueCents = startingBidCents,
            CreatedAt         = DateTime.UtcNow,
        };
        db.AuctionItems.Add(item);
        return item;
    }

    private static Bid AddBid(GolfFundraiserPro.Api.Data.ApplicationDbContext db,
        Guid itemId, Guid playerId, int amountCents)
    {
        var bid = new Bid
        {
            Id            = Guid.NewGuid(),
            AuctionItemId = itemId,
            PlayerId      = playerId,
            AmountCents   = amountCents,
            PlacedAt      = DateTime.UtcNow,
        };
        db.Bids.Add(bid);
        return bid;
    }

    // ── Expired item gets closed ──────────────────────────────────────────────

    [Fact]
    public async Task ProcessExpiredItemsAsync_closes_an_expired_open_item()
    {
        var (svc, db) = Build();
        var (_, eventId) = await SeedEventAsync(db);
        var item = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddMinutes(-5));
        await db.SaveChangesAsync();

        await svc.ProcessExpiredItemsAsync();

        var closed = await db.AuctionItems.FindAsync(item.Id);
        Assert.Equal(AuctionItemStatus.Closed, closed!.Status);
    }

    // ── Non-expired item is untouched ─────────────────────────────────────────

    [Fact]
    public async Task ProcessExpiredItemsAsync_ignores_a_non_expired_item()
    {
        var (svc, db) = Build();
        var (_, eventId) = await SeedEventAsync(db);
        var item = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddHours(1));
        await db.SaveChangesAsync();

        await svc.ProcessExpiredItemsAsync();

        var stillOpen = await db.AuctionItems.FindAsync(item.Id);
        Assert.Equal(AuctionItemStatus.Open, stillOpen!.Status);
    }

    // ── Silent auction: top bid wins ──────────────────────────────────────────

    [Fact]
    public async Task ProcessExpiredItemsAsync_creates_one_winner_for_silent_item_with_top_bid()
    {
        var (svc, db) = Build();
        var (_, eventId) = await SeedEventAsync(db);
        var p1   = AddPlayer(db, eventId);
        var p2   = AddPlayer(db, eventId);
        var item = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddMinutes(-1));
        item.CurrentHighBidCents = 8000;

        AddBid(db, item.Id, p1.Id, 5000);
        AddBid(db, item.Id, p2.Id, 8000); // highest
        await db.SaveChangesAsync();

        await svc.ProcessExpiredItemsAsync();

        var winners = db.AuctionWinners
            .Where(w => w.AuctionItemId == item.Id)
            .ToList();

        Assert.Single(winners);
        Assert.Equal(p2.Id,  winners[0].PlayerId);
        Assert.Equal(8000,   winners[0].AmountCents);
    }

    // ── Donation item: every bidder wins ─────────────────────────────────────

    [Fact]
    public async Task ProcessExpiredItemsAsync_creates_one_winner_per_bidder_for_donation_items()
    {
        var (svc, db) = Build();
        var (_, eventId) = await SeedEventAsync(db);
        var p1   = AddPlayer(db, eventId);
        var p2   = AddPlayer(db, eventId);
        var p3   = AddPlayer(db, eventId);
        var item = AddItem(db, eventId, AuctionType.DonationSilent, DateTime.UtcNow.AddMinutes(-1));

        AddBid(db, item.Id, p1.Id, 5000);
        AddBid(db, item.Id, p2.Id, 10000);
        AddBid(db, item.Id, p3.Id, 2500);
        await db.SaveChangesAsync();

        await svc.ProcessExpiredItemsAsync();

        var winners = db.AuctionWinners
            .Where(w => w.AuctionItemId == item.Id)
            .ToList();

        Assert.Equal(3, winners.Count);
        Assert.Contains(winners, w => w.PlayerId == p1.Id && w.AmountCents == 5000);
        Assert.Contains(winners, w => w.PlayerId == p2.Id && w.AmountCents == 10000);
        Assert.Contains(winners, w => w.PlayerId == p3.Id && w.AmountCents == 2500);
    }

    // ── Silent item with no bids gets closed but creates no winner ────────────

    [Fact]
    public async Task ProcessExpiredItemsAsync_closes_silent_item_with_no_bids_and_no_winner()
    {
        var (svc, db) = Build();
        var (_, eventId) = await SeedEventAsync(db);
        var item = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddMinutes(-1));
        await db.SaveChangesAsync();

        await svc.ProcessExpiredItemsAsync();

        Assert.Equal(AuctionItemStatus.Closed, (await db.AuctionItems.FindAsync(item.Id))!.Status);
        Assert.Empty(db.AuctionWinners.Where(w => w.AuctionItemId == item.Id));
    }

    // ── Multiple expired items are all processed in one pass ─────────────────

    [Fact]
    public async Task ProcessExpiredItemsAsync_closes_all_expired_items_in_one_pass()
    {
        var (svc, db) = Build();
        var (_, eventId) = await SeedEventAsync(db);

        var past = DateTime.UtcNow.AddMinutes(-5);
        var i1 = AddItem(db, eventId, AuctionType.Silent, past);
        var i2 = AddItem(db, eventId, AuctionType.Silent, past);
        var i3 = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddHours(1)); // not expired
        await db.SaveChangesAsync();

        await svc.ProcessExpiredItemsAsync();

        Assert.Equal(AuctionItemStatus.Closed, (await db.AuctionItems.FindAsync(i1.Id))!.Status);
        Assert.Equal(AuctionItemStatus.Closed, (await db.AuctionItems.FindAsync(i2.Id))!.Status);
        Assert.Equal(AuctionItemStatus.Open,   (await db.AuctionItems.FindAsync(i3.Id))!.Status);
    }
}
