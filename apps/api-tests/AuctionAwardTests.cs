using System.Reflection;
using Xunit;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Auction;
using GolfFundraiserPro.Api.Features.Emails;
using GolfFundraiserPro.Api.Features.Notifications;
using GolfFundraiserPro.Api.Features.Payments;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests;

/// <summary>
/// The live-auction award endpoint declares a winner and a price, so it must be
/// staff-only and confined to the caller's own org. It was once neither: a
/// class-level [AllowAnonymous] on BidController silently overrode the action's
/// [Authorize], and the service never looked at the org at all.
/// </summary>
public class AuctionAwardTests
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

    private static Guid AddEvent(GolfFundraiserPro.Api.Data.ApplicationDbContext db, Guid orgId, string code)
    {
        var eventId = Guid.NewGuid();
        db.Events.Add(new Event
        {
            Id         = eventId,
            OrgId      = orgId,
            Name       = "Gala",
            EventCode  = code,
            Format     = EventFormat.Scramble,
            StartType  = EventStartType.Shotgun,
            Holes      = 18,
            Status     = EventStatus.Active,
            ConfigJson = "{}",
        });
        return eventId;
    }

    private static Guid AddPlayer(GolfFundraiserPro.Api.Data.ApplicationDbContext db, Guid eventId)
    {
        var id = Guid.NewGuid();
        db.Players.Add(new Player
        {
            Id               = id,
            EventId          = eventId,
            FirstName        = "Test",
            LastName         = "Player",
            Email            = $"{Guid.NewGuid()}@t.com",
            HasPaymentMethod = true,
            CheckInStatus    = CheckInStatus.CheckedIn,
            RegistrationType = RegistrationType.FullTeam,
        });
        return id;
    }

    private static Guid AddLiveItem(GolfFundraiserPro.Api.Data.ApplicationDbContext db, Guid eventId)
    {
        var id = Guid.NewGuid();
        db.AuctionItems.Add(new AuctionItem
        {
            Id                   = id,
            EventId              = eventId,
            Title                = "Weekend getaway",
            Description          = "",
            PhotoUrlsJson        = "[]",
            AuctionType          = AuctionType.Live,
            Status               = AuctionItemStatus.Open,
            StartingBidCents     = 1000,
            BidIncrementCents    = 500,
            CurrentHighBidCents  = 0,
            MaxExtensionMin      = 10,
            FairMarketValueCents = 1000,
            CreatedAt            = DateTime.UtcNow,
        });
        return id;
    }

    private static async Task<(AuctionService svc, GolfFundraiserPro.Api.Data.ApplicationDbContext db,
        Guid orgId, Guid itemId, Guid playerId)> SeedAsync()
    {
        var (svc, db) = Build();
        var orgId = Guid.NewGuid();
        db.Organizations.Add(new Organization { Id = orgId, Name = "Org", Slug = "org" });
        var eventId  = AddEvent(db, orgId, "AWARD001");
        var playerId = AddPlayer(db, eventId);
        var itemId   = AddLiveItem(db, eventId);
        await db.SaveChangesAsync();
        return (svc, db, orgId, itemId, playerId);
    }

    [Fact]
    public async Task Staff_of_the_owning_org_can_award_a_live_item()
    {
        var (svc, db, orgId, itemId, playerId) = await SeedAsync();

        await svc.AwardItemAsync(orgId, itemId, new AwardRequest { PlayerId = playerId, AmountCents = 25_000 }, default);

        var item = await db.AuctionItems.SingleAsync(i => i.Id == itemId);
        Assert.Equal(AuctionItemStatus.Awarded, item.Status);
        var winner = await db.AuctionWinners.SingleAsync(w => w.AuctionItemId == itemId);
        Assert.Equal(playerId, winner.PlayerId);
        Assert.Equal(25_000, winner.AmountCents);
    }

    [Fact]
    public async Task Another_orgs_staff_get_not_found_and_change_nothing()
    {
        var (svc, db, _, itemId, playerId) = await SeedAsync();
        var otherOrg = Guid.NewGuid();

        await Assert.ThrowsAsync<NotFoundException>(() =>
            svc.AwardItemAsync(otherOrg, itemId, new AwardRequest { PlayerId = playerId, AmountCents = 100 }, default));

        Assert.Equal(AuctionItemStatus.Open, (await db.AuctionItems.SingleAsync(i => i.Id == itemId)).Status);
        Assert.Empty(db.AuctionWinners);
    }

    [Fact]
    public async Task The_winner_must_be_a_golfer_in_the_items_event()
    {
        var (svc, db, orgId, itemId, _) = await SeedAsync();
        // Same org, different tournament.
        var otherEvent  = AddEvent(db, orgId, "AWARD002");
        var otherPlayer = AddPlayer(db, otherEvent);
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<ValidationException>(() =>
            svc.AwardItemAsync(orgId, itemId, new AwardRequest { PlayerId = otherPlayer, AmountCents = 100 }, default));
        await Assert.ThrowsAsync<ValidationException>(() =>
            svc.AwardItemAsync(orgId, itemId, new AwardRequest { PlayerId = Guid.NewGuid(), AmountCents = 100 }, default));

        Assert.Empty(db.AuctionWinners);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-500)]
    public async Task The_winning_amount_must_be_positive(int amountCents)
    {
        var (svc, db, orgId, itemId, playerId) = await SeedAsync();

        await Assert.ThrowsAsync<ValidationException>(() =>
            svc.AwardItemAsync(orgId, itemId, new AwardRequest { PlayerId = playerId, AmountCents = amountCents }, default));

        Assert.Empty(db.AuctionWinners);
    }

    [Fact]
    public void Award_requires_EventStaff_and_is_not_anonymous()
    {
        var award = typeof(BidController).GetMethod(nameof(BidController.Award))!;

        var policy = award.GetCustomAttribute<AuthorizeAttribute>()?.Policy;
        Assert.Equal("EventStaff", policy);
        Assert.Null(award.GetCustomAttribute<AllowAnonymousAttribute>());
        Assert.Null(typeof(BidController).GetCustomAttribute<AllowAnonymousAttribute>());
    }

    /// <summary>
    /// [AllowAnonymous] anywhere on the path wins over [Authorize], so a
    /// class-level AllowAnonymous makes every [Authorize] action in that
    /// controller public. Guard every controller, not just BidController.
    /// </summary>
    [Fact]
    public void No_controller_hides_an_Authorize_action_behind_a_class_level_AllowAnonymous()
    {
        var offenders = typeof(BidController).Assembly.GetTypes()
            .Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract)
            .Where(t => t.GetCustomAttribute<AllowAnonymousAttribute>(inherit: true) is not null)
            .SelectMany(t => t.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                .Where(m => m.GetCustomAttributes<AuthorizeAttribute>(inherit: true).Any())
                .Select(m => $"{t.Name}.{m.Name}"))
            .ToList();

        Assert.Empty(offenders);
    }
}
