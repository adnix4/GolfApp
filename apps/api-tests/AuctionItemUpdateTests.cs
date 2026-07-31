using Xunit;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Configuration;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Auction;
using GolfFundraiserPro.Api.Features.Emails;
using GolfFundraiserPro.Api.Features.Notifications;
using GolfFundraiserPro.Api.Features.Payments;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests;

/// <summary>
/// Unit/integration tests for AuctionService.UpdateItemAsync's auction-type rule:
/// the type may change only while the item is still Open with no bids. Uses an
/// in-memory DB.
/// </summary>
public class AuctionItemUpdateTests
{
    private static (AuctionService svc, ApplicationDbContext db) Build()
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

    private static (Guid orgId, Guid eventId) SeedEvent(ApplicationDbContext db)
    {
        var orgId   = Guid.NewGuid();
        var eventId = Guid.NewGuid();
        db.Organizations.Add(new Organization { Id = orgId, Name = "Org", Slug = "org" });
        db.Events.Add(new Event
        {
            Id = eventId, OrgId = orgId, Name = "Gala", EventCode = "AUCTUPD",
            Format = EventFormat.Scramble, StartType = EventStartType.Shotgun,
            Holes = 18, Status = EventStatus.Active, ConfigJson = "{}",
        });
        return (orgId, eventId);
    }

    private static AuctionItem AddItem(ApplicationDbContext db, Guid eventId,
        AuctionType type = AuctionType.Silent, AuctionItemStatus status = AuctionItemStatus.Open)
    {
        var item = new AuctionItem
        {
            Id = Guid.NewGuid(), EventId = eventId, Title = "Test Item", Description = "",
            PhotoUrlsJson = "[]", AuctionType = type, Status = status,
            StartingBidCents = 1000, BidIncrementCents = 500, CurrentHighBidCents = 0,
            MaxExtensionMin = 10, FairMarketValueCents = 1000, CreatedAt = DateTime.UtcNow,
        };
        db.AuctionItems.Add(item);
        return item;
    }

    [Fact]
    public async Task Changes_type_when_open_with_no_bids()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = SeedEvent(db);
        var item = AddItem(db, eventId, AuctionType.Silent);
        await db.SaveChangesAsync();

        var result = await svc.UpdateItemAsync(orgId, eventId, item.Id,
            new UpdateAuctionItemRequest { AuctionType = "Live" }, CancellationToken.None);

        Assert.Equal("Live", result.AuctionType);
        var stored = await db.AuctionItems.FindAsync(item.Id);
        Assert.Equal(AuctionType.Live, stored!.AuctionType);
    }

    [Fact]
    public async Task Rejects_type_change_when_item_has_bids()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = SeedEvent(db);
        var item = AddItem(db, eventId, AuctionType.Silent);
        item.CurrentHighBidCents = 5000;
        db.Bids.Add(new Bid
        {
            Id = Guid.NewGuid(), AuctionItemId = item.Id, PlayerId = Guid.NewGuid(),
            AmountCents = 5000, PlacedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<ValidationException>(() =>
            svc.UpdateItemAsync(orgId, eventId, item.Id,
                new UpdateAuctionItemRequest { AuctionType = "Live" }, CancellationToken.None));
        Assert.Contains("already has bids", ex.Message);

        var stored = await db.AuctionItems.FindAsync(item.Id);
        Assert.Equal(AuctionType.Silent, stored!.AuctionType); // unchanged
    }

    [Fact]
    public async Task Rejects_type_change_when_item_closed()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = SeedEvent(db);
        var item = AddItem(db, eventId, AuctionType.Silent, AuctionItemStatus.Closed);
        await db.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<ValidationException>(() =>
            svc.UpdateItemAsync(orgId, eventId, item.Id,
                new UpdateAuctionItemRequest { AuctionType = "Live" }, CancellationToken.None));
        Assert.Contains("closed or awarded", ex.Message);
    }

    [Fact]
    public async Task Allows_other_edits_on_a_bid_on_item_when_type_is_unchanged()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = SeedEvent(db);
        var item = AddItem(db, eventId, AuctionType.Silent);
        item.CurrentHighBidCents = 5000;
        db.Bids.Add(new Bid
        {
            Id = Guid.NewGuid(), AuctionItemId = item.Id, PlayerId = Guid.NewGuid(),
            AmountCents = 5000, PlacedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        // Resends the same type (as the admin form always does) plus a title edit.
        var result = await svc.UpdateItemAsync(orgId, eventId, item.Id,
            new UpdateAuctionItemRequest { Title = "Renamed", AuctionType = "Silent" },
            CancellationToken.None);

        Assert.Equal("Renamed", result.Title);
        Assert.Equal("Silent", result.AuctionType);
    }
}
