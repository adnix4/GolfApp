using Xunit;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Configuration;
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
/// A golfer's own bid history.
///
/// This read used to be reachable with nothing but a player GUID, which leaked
/// that golfer's private Silent maxima — the ceiling proxy bidding depends on
/// staying secret — and it was the last player-scoped endpoint without the
/// per-player session token every sibling requires. The mobile auction screen
/// polls it after every refresh, so it is continuously exercised. These tests pin
/// the token requirement and, just as importantly, that a bad token is
/// indistinguishable from a bad id.
/// </summary>
public class AuctionBidHistoryTests
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

    private static async Task<Guid> SeedEventAsync(GolfFundraiserPro.Api.Data.ApplicationDbContext db)
    {
        var orgId   = Guid.NewGuid();
        var eventId = Guid.NewGuid();

        db.Organizations.Add(new Organization { Id = orgId, Name = "Org", Slug = "org" });
        db.Events.Add(new Event
        {
            Id         = eventId,
            OrgId      = orgId,
            Name       = "Gala",
            EventCode  = "BIDHIST1",
            Format     = EventFormat.Scramble,
            StartType  = EventStartType.Shotgun,
            Holes      = 18,
            Status     = EventStatus.Active,
            ConfigJson = "{}",
        });

        await db.SaveChangesAsync();
        return eventId;
    }

    private static Player AddPlayer(
        GolfFundraiserPro.Api.Data.ApplicationDbContext db, Guid eventId, string? sessionToken)
    {
        var p = new Player
        {
            Id               = Guid.NewGuid(),
            EventId          = eventId,
            FirstName        = "Dana",
            LastName         = "Bidder",
            Email            = $"{Guid.NewGuid()}@t.com",
            CheckInStatus    = CheckInStatus.CheckedIn,
            RegistrationType = RegistrationType.FullTeam,
            SessionToken     = sessionToken,
        };
        db.Players.Add(p);
        return p;
    }

    private static AuctionItem AddItem(
        GolfFundraiserPro.Api.Data.ApplicationDbContext db, Guid eventId)
    {
        var item = new AuctionItem
        {
            Id                   = Guid.NewGuid(),
            EventId              = eventId,
            Title                = "Signed Flag",
            Description          = "",
            PhotoUrlsJson        = "[]",
            AuctionType          = AuctionType.Silent,
            Status               = AuctionItemStatus.Open,
            StartingBidCents     = 1000,
            BidIncrementCents    = 500,
            CurrentHighBidCents  = 4000,
            MaxExtensionMin      = 10,
            FairMarketValueCents = 1000,
            CreatedAt            = DateTime.UtcNow,
        };
        db.AuctionItems.Add(item);
        return item;
    }

    /// <summary>A golfer with one standing bid, and the token that authorizes reading it.</summary>
    private static async Task<(AuctionService svc, Player player)> SeedBidderAsync(string token)
    {
        var (svc, db) = Build();
        var eventId = await SeedEventAsync(db);
        var player  = AddPlayer(db, eventId, token);
        var item    = AddItem(db, eventId);
        db.Bids.Add(new Bid
        {
            Id            = Guid.NewGuid(),
            AuctionItemId = item.Id,
            PlayerId      = player.Id,
            AmountCents   = 6500,
            PlacedAt      = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
        return (svc, player);
    }

    [Fact]
    public async Task The_golfer_reads_their_own_history_with_their_token()
    {
        var (svc, player) = await SeedBidderAsync("tok-abc");

        var history = await svc.GetPlayerBidsAsync(player.Id, "tok-abc", default);

        var row = Assert.Single(history);
        Assert.Equal("Signed Flag", row.ItemTitle);
        Assert.Equal(6500, row.AmountCents);
    }

    [Fact]
    public async Task A_wrong_or_missing_session_token_cannot_read_a_bid_history()
    {
        // The amount above is a PRIVATE maximum sitting over the public price, so
        // this is the leak that mattered: anyone holding the GUID could read it.
        var (svc, player) = await SeedBidderAsync("tok-abc");

        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.GetPlayerBidsAsync(player.Id, "tok-wrong", default));
        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.GetPlayerBidsAsync(player.Id, null, default));
        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.GetPlayerBidsAsync(player.Id, "", default));
    }

    [Fact]
    public async Task A_player_with_no_token_at_all_is_still_refused()
    {
        // Fail closed: a null stored token must not make every request match.
        var (svc, player) = await SeedBidderAsync(null!);

        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.GetPlayerBidsAsync(player.Id, "anything", default));
        await Assert.ThrowsAsync<NotFoundException>(
            () => svc.GetPlayerBidsAsync(player.Id, null, default));
    }

    [Fact]
    public async Task An_unknown_player_answers_exactly_as_a_bad_token_does()
    {
        // Same exception either way, so the endpoint cannot be used to discover
        // which player GUIDs are real. Each message names the id the CALLER
        // supplied — which tells them nothing they did not already have — so the
        // two are compared as templates rather than as literals.
        var (svc, player) = await SeedBidderAsync("tok-abc");
        var unknownId = Guid.NewGuid();

        var badToken = await Assert.ThrowsAsync<NotFoundException>(
            () => svc.GetPlayerBidsAsync(player.Id, "tok-wrong", default));
        var badId = await Assert.ThrowsAsync<NotFoundException>(
            () => svc.GetPlayerBidsAsync(unknownId, "tok-abc", default));

        Assert.Equal($"Player with id '{player.Id}' was not found.", badToken.Message);
        Assert.Equal($"Player with id '{unknownId}' was not found.", badId.Message);
    }
}
