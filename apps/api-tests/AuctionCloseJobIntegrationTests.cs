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
        Guid itemId, Guid playerId, int amountCents, DateTime? placedAt = null)
    {
        var bid = new Bid
        {
            Id            = Guid.NewGuid(),
            AuctionItemId = itemId,
            PlayerId      = playerId,
            AmountCents   = amountCents,
            PlacedAt      = placedAt ?? DateTime.UtcNow,
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
        var player = AddPlayer(db, eventId);
        var item = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddMinutes(-5));
        AddBid(db, item.Id, player.Id, 5000); // a lot that sold — see Unsold test below
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

    // ── Silent auction: proxy bidding decides who wins and at what price ──────

    [Fact]
    public async Task Silent_winner_is_charged_the_settled_price_not_their_own_maximum()
    {
        // The whole point of U4: the $200 ceiling is private. Charging it would
        // bill the winner $125 more than the board ever showed.
        var (svc, db) = Build();
        var (_, eventId) = await SeedEventAsync(db);
        var ann  = AddPlayer(db, eventId);
        var bo   = AddPlayer(db, eventId);
        var item = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddMinutes(-1),
                           startingBidCents: 5000, bidIncrementCents: 500);

        AddBid(db, item.Id, ann.Id, 20000);
        AddBid(db, item.Id, bo.Id,   7000);
        await db.SaveChangesAsync();

        await svc.ProcessExpiredItemsAsync();

        var winner = Assert.Single(db.AuctionWinners.Where(w => w.AuctionItemId == item.Id));
        Assert.Equal(ann.Id, winner.PlayerId);
        Assert.Equal(7500,   winner.AmountCents); // Bo's $70 + one $5 increment
    }

    [Fact]
    public async Task Silent_item_tied_on_maximum_is_won_by_the_earlier_bidder()
    {
        var (svc, db) = Build();
        var (_, eventId) = await SeedEventAsync(db);
        var ann  = AddPlayer(db, eventId);
        var bo   = AddPlayer(db, eventId);
        var item = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddMinutes(-1),
                           startingBidCents: 5000, bidIncrementCents: 500);

        var t0 = DateTime.UtcNow.AddMinutes(-30);
        AddBid(db, item.Id, bo.Id,  10000, t0.AddSeconds(90));
        AddBid(db, item.Id, ann.Id, 10000, t0);           // same amount, in first
        await db.SaveChangesAsync();

        await svc.ProcessExpiredItemsAsync();

        var winner = Assert.Single(db.AuctionWinners.Where(w => w.AuctionItemId == item.Id));
        Assert.Equal(ann.Id, winner.PlayerId);
        Assert.Equal(10000,  winner.AmountCents); // a tie sells at the tied amount
    }

    [Fact]
    public async Task Silent_winner_pays_the_recorded_price_when_the_item_carries_one()
    {
        // A buy-now sale posts the advertised price to CurrentHighBidCents, which
        // the bid ladder alone can't reconstruct — the column has to win.
        var (svc, db) = Build();
        var (_, eventId) = await SeedEventAsync(db);
        var ann  = AddPlayer(db, eventId);
        var item = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddMinutes(-1),
                           startingBidCents: 5000, bidIncrementCents: 500);
        item.BuyNowPriceCents    = 15000;
        item.CurrentHighBidCents = 15000;

        AddBid(db, item.Id, ann.Id, 18000); // typed a max at or above buy-now
        await db.SaveChangesAsync();

        await svc.ProcessExpiredItemsAsync();

        var winner = Assert.Single(db.AuctionWinners.Where(w => w.AuctionItemId == item.Id));
        Assert.Equal(15000, winner.AmountCents);
    }

    [Fact]
    public async Task Live_items_still_sell_for_exactly_what_was_bid()
    {
        // Proxy bidding is Silent-only — an auctioneer's hammer price is the bid.
        var (svc, db) = Build();
        var (_, eventId) = await SeedEventAsync(db);
        var ann  = AddPlayer(db, eventId);
        var bo   = AddPlayer(db, eventId);
        var item = AddItem(db, eventId, AuctionType.Live, DateTime.UtcNow.AddMinutes(-1),
                           startingBidCents: 5000, bidIncrementCents: 500);

        AddBid(db, item.Id, bo.Id,   7000);
        AddBid(db, item.Id, ann.Id, 20000);
        await db.SaveChangesAsync();

        await svc.ProcessExpiredItemsAsync();

        var winner = Assert.Single(db.AuctionWinners.Where(w => w.AuctionItemId == item.Id));
        Assert.Equal(ann.Id, winner.PlayerId);
        Assert.Equal(20000,  winner.AmountCents);
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

    // ── Silent item with no bids ends Unsold, not Closed ──────────────────────

    [Fact]
    public async Task ProcessExpiredItemsAsync_marks_a_silent_item_with_no_bids_Unsold()
    {
        // Unsold exists so the organizer can see what failed to sell and re-offer
        // it. Ending as plain Closed made a no-bid lot indistinguishable from one
        // that sold for real money.
        var (svc, db) = Build();
        var (_, eventId) = await SeedEventAsync(db);
        var item = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddMinutes(-1));
        await db.SaveChangesAsync();

        await svc.ProcessExpiredItemsAsync();

        Assert.Equal(AuctionItemStatus.Unsold, (await db.AuctionItems.FindAsync(item.Id))!.Status);
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

        // Neither expired lot drew a bid, so both end Unsold rather than Closed.
        Assert.Equal(AuctionItemStatus.Unsold, (await db.AuctionItems.FindAsync(i1.Id))!.Status);
        Assert.Equal(AuctionItemStatus.Unsold, (await db.AuctionItems.FindAsync(i2.Id))!.Status);
        Assert.Equal(AuctionItemStatus.Open,   (await db.AuctionItems.FindAsync(i3.Id))!.Status);
    }

    // ── Closing no longer charges: the winner settles at the checkout desk ────

    [Fact]
    public async Task Closing_a_competitive_lot_leaves_the_winner_Pending_and_charges_nobody()
    {
        // The whole point of the checkout desk. Charging on close billed people
        // for items they had not collected, and a 3DS challenge died unanswered
        // because nobody was there to answer it.
        var (svc, db) = Build();
        var (_, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId);
        var item   = AddItem(db, eventId, AuctionType.Silent, DateTime.UtcNow.AddMinutes(-1));
        AddBid(db, item.Id, player.Id, 9000);
        await db.SaveChangesAsync();

        await svc.ProcessExpiredItemsAsync();

        var winner = Assert.Single(db.AuctionWinners.Where(w => w.AuctionItemId == item.Id));
        Assert.Equal(ChargeStatus.Pending, winner.ChargeStatus);
        Assert.Null(winner.StripePaymentIntentId);
        Assert.Null(winner.CheckedOutAt);
        Assert.Null(winner.SettlementMethod);
        Assert.Null(winner.PickedUpAt);
    }

    [Fact]
    public async Task Closing_a_Fund_a_Need_still_charges_on_close()
    {
        // A pledge has nothing to collect, so there is no desk visit to wait for.
        // With no Stripe customer configured the attempt fails — which is itself
        // the proof that a charge WAS attempted, unlike a competitive lot.
        var (svc, db) = Build();
        var (_, eventId) = await SeedEventAsync(db);
        var player = AddPlayer(db, eventId);
        var item   = AddItem(db, eventId, AuctionType.DonationSilent, DateTime.UtcNow.AddMinutes(-1));
        AddBid(db, item.Id, player.Id, 2500);
        await db.SaveChangesAsync();

        await svc.ProcessExpiredItemsAsync();

        var winner = Assert.Single(db.AuctionWinners.Where(w => w.AuctionItemId == item.Id));
        Assert.NotEqual(ChargeStatus.Pending, winner.ChargeStatus);
    }
}
