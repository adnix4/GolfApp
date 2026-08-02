using Xunit;
using Microsoft.Extensions.Logging.Abstractions;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Events;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Services;

/// <summary>
/// Tests for EventService's public sponsor read path (GetPublicSponsorsAsync):
/// tier/name ordering, hole-number extraction from placements JSON, version
/// pass-through, and the Draft/Cancelled/unknown → 404 rules. This is the
/// endpoint the mobile scorer refetches after a SponsorsChanged signal.
/// </summary>
public class EventServiceTests
{
    private sealed class Ctx
    {
        public ApplicationDbContext Db = null!;
        public EventService Svc = null!;
        public Guid EventId;
        public Guid OrgId;
    }

    private static Ctx Build(EventStatus status = EventStatus.Registration, int sponsorsVersion = 0)
    {
        var db      = InMemoryDbFactory.Create();
        var orgId   = Guid.NewGuid();
        var eventId = Guid.NewGuid();

        db.Organizations.Add(new Organization { Id = orgId, Name = "Acme", Slug = "acme" });
        db.Events.Add(new Event
        {
            Id = eventId, OrgId = orgId, Name = "Gala", EventCode = "GALA0001",
            Format = EventFormat.Scramble, StartType = EventStartType.Shotgun,
            Holes = 18, Status = status, ConfigJson = "{}", SponsorsVersion = sponsorsVersion,
        });
        db.SaveChanges();

        var testData = new TestDataService(db, NullLogger<TestDataService>.Instance);
        var svc      = new EventService(db, NullLogger<EventService>.Instance, testData);
        return new Ctx { Db = db, Svc = svc, EventId = eventId, OrgId = orgId };
    }

    private static void AddSponsor(Ctx c, string name, SponsorTier tier, string placementsJson)
    {
        c.Db.Sponsors.Add(new Sponsor
        {
            Id = Guid.NewGuid(), EventId = c.EventId, Name = name,
            LogoUrl = $"/logos/{name}.png", Tier = tier, PlacementsJson = placementsJson,
        });
        c.Db.SaveChanges();
    }

    [Fact]
    public async Task GetPublicSponsors_orders_by_tier_then_name_and_maps_hole_numbers()
    {
        var c = Build(sponsorsVersion: 5);
        AddSponsor(c, "Beta",  SponsorTier.Title, "{\"holeNumbers\":[4]}");
        AddSponsor(c, "Alpha", SponsorTier.Title, "{\"holeNumbers\":[7,14]}");
        AddSponsor(c, "Zeta",  SponsorTier.Gold,  "{}");

        var resp = await c.Svc.GetPublicSponsorsAsync("GALA0001");

        // Version passes through from the event row.
        Assert.Equal(5, resp.SponsorsVersion);
        // Title(0) before Gold; within Title, Alpha before Beta.
        Assert.Equal(new[] { "Alpha", "Beta", "Zeta" }, resp.Sponsors.Select(s => s.Name).ToArray());
        // Hole numbers extracted from placements JSON.
        Assert.Equal(new[] { 7, 14 }, resp.Sponsors[0].HoleNumbers.ToArray());
        Assert.Equal(new[] { 4 },     resp.Sponsors[1].HoleNumbers.ToArray());
        Assert.Empty(resp.Sponsors[2].HoleNumbers);
    }

    [Fact]
    public async Task GetPublicSponsors_is_case_insensitive_on_event_code()
    {
        var c = Build();
        AddSponsor(c, "Solo", SponsorTier.Gold, "{}");

        var resp = await c.Svc.GetPublicSponsorsAsync("gala0001");

        Assert.Single(resp.Sponsors);
    }

    [Theory]
    [InlineData(EventStatus.Draft)]
    [InlineData(EventStatus.Cancelled)]
    public async Task GetPublicSponsors_hidden_for_draft_and_cancelled(EventStatus status)
    {
        var c = Build(status);
        await Assert.ThrowsAsync<NotFoundException>(() => c.Svc.GetPublicSponsorsAsync("GALA0001"));
    }

    [Fact]
    public async Task GetPublicSponsors_throws_for_unknown_code()
    {
        var c = Build();
        await Assert.ThrowsAsync<NotFoundException>(() => c.Svc.GetPublicSponsorsAsync("NOPE9999"));
    }

    // ── Draft (test-mode) session-token gate (problemList S4) ────────────────
    // Draft events 404 anonymously, but a player who already joined THIS event
    // can fetch sponsors with their per-player session token so test-mode
    // previews pick up live sponsor edits.

    private static Guid AddSessionPlayer(Ctx c, Guid eventId, string? token)
    {
        var id = Guid.NewGuid();
        c.Db.Players.Add(new Player { Id = id, EventId = eventId, SessionToken = token });
        c.Db.SaveChanges();
        return id;
    }

    [Fact]
    public async Task GetPublicSponsors_draft_served_to_joined_player_with_valid_token()
    {
        var c = Build(EventStatus.Draft, sponsorsVersion: 3);
        AddSponsor(c, "Solo", SponsorTier.Gold, "{}");
        var playerId = AddSessionPlayer(c, c.EventId, "tok-secret");

        var resp = await c.Svc.GetPublicSponsorsAsync("GALA0001", playerId, "tok-secret");

        Assert.Equal(3, resp.SponsorsVersion);
        Assert.Single(resp.Sponsors);
    }

    [Fact]
    public async Task GetPublicSponsors_draft_rejects_wrong_or_missing_token()
    {
        var c = Build(EventStatus.Draft);
        var playerId = AddSessionPlayer(c, c.EventId, "tok-secret");

        await Assert.ThrowsAsync<NotFoundException>(
            () => c.Svc.GetPublicSponsorsAsync("GALA0001", playerId, "tok-WRONG"));
        await Assert.ThrowsAsync<NotFoundException>(
            () => c.Svc.GetPublicSponsorsAsync("GALA0001", playerId, null));
        // Player seeded before Phase11 (null stored token) fails closed too.
        var legacyId = AddSessionPlayer(c, c.EventId, null);
        await Assert.ThrowsAsync<NotFoundException>(
            () => c.Svc.GetPublicSponsorsAsync("GALA0001", legacyId, "anything"));
    }

    [Fact]
    public async Task GetPublicSponsors_draft_rejects_player_from_another_event()
    {
        var c = Build(EventStatus.Draft);
        var otherEvent = Guid.NewGuid();
        c.Db.Events.Add(new Event
        {
            Id = otherEvent, OrgId = c.OrgId, Name = "Other", EventCode = "OTHR0001",
            Format = EventFormat.Scramble, StartType = EventStartType.Shotgun,
            Holes = 18, Status = EventStatus.Registration, ConfigJson = "{}",
        });
        c.Db.SaveChanges();
        var outsiderId = AddSessionPlayer(c, otherEvent, "tok-outsider");

        await Assert.ThrowsAsync<NotFoundException>(
            () => c.Svc.GetPublicSponsorsAsync("GALA0001", outsiderId, "tok-outsider"));
    }

    [Fact]
    public async Task GetPublicSponsors_cancelled_stays_hidden_even_with_valid_token()
    {
        var c = Build(EventStatus.Cancelled);
        var playerId = AddSessionPlayer(c, c.EventId, "tok-secret");

        await Assert.ThrowsAsync<NotFoundException>(
            () => c.Svc.GetPublicSponsorsAsync("GALA0001", playerId, "tok-secret"));
    }

    // ── Counts projection (perf refactor: no Teams/Players/Scores Includes) ──

    private static void SeedRoster(Ctx c)
    {
        var t1 = Guid.NewGuid();
        var t2 = Guid.NewGuid();
        c.Db.Teams.AddRange(
            new Team { Id = t1, EventId = c.EventId, Name = "Eagles", CheckInStatus = CheckInStatus.CheckedIn },
            new Team { Id = t2, EventId = c.EventId, Name = "Bogeys", CheckInStatus = CheckInStatus.Pending });
        c.Db.Players.AddRange(
            new Player { Id = Guid.NewGuid(), EventId = c.EventId, TeamId = t1 },
            new Player { Id = Guid.NewGuid(), EventId = c.EventId, TeamId = t1 },
            new Player { Id = Guid.NewGuid(), EventId = c.EventId, TeamId = t2 });
        c.Db.Scores.AddRange(
            new Score { Id = Guid.NewGuid(), EventId = c.EventId, TeamId = t1, HoleNumber = 1, GrossScore = 4 },
            new Score { Id = Guid.NewGuid(), EventId = c.EventId, TeamId = t1, HoleNumber = 2, GrossScore = 5 },
            // Second team scores hole 1 too — HolesScored counts DISTINCT holes
            new Score { Id = Guid.NewGuid(), EventId = c.EventId, TeamId = t2, HoleNumber = 1, GrossScore = 3 });
        c.Db.SaveChanges();
    }

    [Fact]
    public async Task GetById_computes_dashboard_counts_db_side()
    {
        var c = Build();
        SeedRoster(c);

        var resp = await c.Svc.GetByIdAsync(c.OrgId, c.EventId);

        Assert.Equal(2, resp.Counts.TeamsRegistered);
        Assert.Equal(3, resp.Counts.PlayersRegistered);
        Assert.Equal(1, resp.Counts.TeamsCheckedIn);
        Assert.Equal(2, resp.Counts.HolesScored);
    }

    // ── Public event projection ───────────────────────────────────────────────

    [Fact]
    public async Task GetPublicEvent_projects_counts_donations_and_branding_fallback()
    {
        var c = Build();
        SeedRoster(c);
        var evt = c.Db.Events.Single(e => e.Id == c.EventId);
        evt.ConfigJson = """{"maxTeams":5}""";
        var org = c.Db.Organizations.Single(o => o.Id == c.OrgId);
        org.ThemeJson = """{"primary":"#31572c"}""";
        c.Db.Donations.AddRange(
            new Donation { Id = Guid.NewGuid(), EventId = c.EventId, AmountCents = 2500 },
            new Donation { Id = Guid.NewGuid(), EventId = c.EventId, AmountCents = 1500 });
        c.Db.SaveChanges();

        var resp = await c.Svc.GetPublicEventAsync("GALA0001");

        Assert.Equal(3, resp.SpotsRemaining);                    // 5 max − 2 teams
        Assert.Equal(4000, resp.Fundraising.DonationsCents);
        Assert.Equal("""{"primary":"#31572c"}""", resp.ResolvedThemeJson); // org fallback
        Assert.Equal("Acme", resp.OrgName);
    }

    [Fact]
    public async Task GetPublicEvent_sums_to_zero_with_no_donations()
    {
        var c = Build();
        var resp = await c.Svc.GetPublicEventAsync("GALA0001");
        Assert.Equal(0, resp.Fundraising.DonationsCents);
        Assert.Null(resp.SpotsRemaining); // no maxTeams configured
    }

    // ── Donation collection rule ──────────────────────────────────────────────
    //
    // Online donations are written PENDING (intent id set, paid_at null) and must
    // not count until Stripe confirms. Offline donations recorded by the organizer
    // have no intent id and always count.

    /// <summary>Seeds one of each donation shape; only 2500 + 1500 should count.</summary>
    private static void SeedMixedDonations(Ctx c)
    {
        c.Db.Donations.AddRange(
            // Offline / organizer-recorded — counts.
            new Donation { Id = Guid.NewGuid(), EventId = c.EventId, AmountCents = 2500 },
            // Online, Stripe confirmed — counts.
            new Donation
            {
                Id = Guid.NewGuid(), EventId = c.EventId, AmountCents = 1500,
                StripePaymentIntentId = "pi_paid", PaidAt = DateTime.UtcNow,
            },
            // Online, still pending / abandoned — must NOT count.
            new Donation
            {
                Id = Guid.NewGuid(), EventId = c.EventId, AmountCents = 9900,
                StripePaymentIntentId = "pi_pending", PaidAt = null,
            });
        c.Db.SaveChanges();
    }

    [Fact]
    public async Task GetPublicEvent_excludes_pending_online_donations()
    {
        var c = Build();
        SeedMixedDonations(c);

        var resp = await c.Svc.GetPublicEventAsync("GALA0001");

        Assert.Equal(4000, resp.Fundraising.DonationsCents); // 9900 pending excluded
    }

    [Fact]
    public async Task GetPublicFundraising_excludes_pending_online_donations()
    {
        var c = Build();
        SeedMixedDonations(c);

        var resp = await c.Svc.GetPublicFundraisingAsync("GALA0001");

        Assert.Equal(4000, resp.DonationsCents);
        Assert.Equal(4000, resp.GrandTotalCents);
    }

    [Fact]
    public async Task GetFundraising_excludes_pending_donations_from_total_and_count()
    {
        var c = Build();
        SeedMixedDonations(c);

        var resp = await c.Svc.GetFundraisingAsync(c.OrgId, c.EventId);

        Assert.Equal(4000, resp.DonationsCents);
        Assert.Equal(2, resp.DonationCount); // the pending row is not a donation yet
    }

    [Fact]
    public async Task CreateDonationIntent_is_rejected_when_stripe_is_not_configured()
    {
        var c = Build(); // built without a PaymentsService

        await Assert.ThrowsAsync<ValidationException>(() =>
            c.Svc.CreatePublicDonationIntentAsync("GALA0001", new PublicDonateRequest
            {
                DonorName = "Pat", DonorEmail = "pat@example.com", AmountCents = 5000,
            }));

        Assert.Empty(c.Db.Donations); // no orphan row left behind
    }

    [Theory]
    // Unset, or one of the REPLACE_WITH placeholders the .env templates ship with:
    // non-empty but rejected by Stripe, so it must not count as configured.
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("sk_test_REPLACE_WITH_YOUR_TEST_KEY")]
    [InlineData("pk_test_a_publishable_key_by_mistake")]
    public void Placeholder_or_missing_stripe_keys_are_not_usable(string? key)
        => Assert.False(GolfFundraiserPro.Api.Features.Payments.PaymentsService.IsUsableStripeKey(key));

    [Fact]
    public void A_configured_secret_key_is_usable()
        // Deliberately NOT shaped like a real Stripe key. The predicate only
        // inspects the prefix, and a literal resembling a genuine test key
        // trips GitHub push protection even when it is entirely invented.
        // Do not "fix" this to look more authentic.
        => Assert.True(GolfFundraiserPro.Api.Features.Payments.PaymentsService
            .IsUsableStripeKey("sk_unit_test_not_a_real_key"));

    // ── Status micro-endpoint ─────────────────────────────────────────────────

    [Theory]
    [InlineData(EventStatus.Draft,     "Draft")]
    [InlineData(EventStatus.Scoring,   "Scoring")]
    [InlineData(EventStatus.Cancelled, "Cancelled")]
    public async Task GetPublicEventStatus_reports_every_lifecycle_status(EventStatus status, string expected)
    {
        // Unlike the landing endpoint, the poll endpoint must report Draft
        // (test mode) and Cancelled so devices can follow the lifecycle.
        var c = Build(status, sponsorsVersion: 7);

        var resp = await c.Svc.GetPublicEventStatusAsync("gala0001");

        Assert.Equal(expected, resp.Status);
        Assert.Equal(7, resp.SponsorsVersion);
    }

    [Fact]
    public async Task GetPublicEventStatus_resolves_theme_event_over_org()
    {
        var c = Build();
        var org = c.Db.Organizations.Single(o => o.Id == c.OrgId);
        org.ThemeJson = """{"primary":"#111111"}""";
        c.Db.SaveChanges();

        // Org fallback when the event has no override
        var resp = await c.Svc.GetPublicEventStatusAsync("GALA0001");
        Assert.Equal("""{"primary":"#111111"}""", resp.ResolvedThemeJson);

        // Event override wins
        var evt = c.Db.Events.Single(e => e.Id == c.EventId);
        evt.ThemeJson = """{"primary":"#222222"}""";
        c.Db.SaveChanges();
        resp = await c.Svc.GetPublicEventStatusAsync("GALA0001");
        Assert.Equal("""{"primary":"#222222"}""", resp.ResolvedThemeJson);
    }

    [Fact]
    public async Task GetPublicEventStatus_throws_for_unknown_code()
    {
        var c = Build();
        await Assert.ThrowsAsync<NotFoundException>(() => c.Svc.GetPublicEventStatusAsync("NOPE9999"));
    }

    // ── Status micro-endpoint: per-player block ───────────────────────────────
    //
    // This is how a device learns it was checked in. Check-in happens at the desk
    // AFTER the golfer joined, so the cached join payload is stale by definition,
    // and the check-in state is what waives the auction's saved-card requirement.

    /// <summary>Seeds a player on the built event and returns (playerId, token).</summary>
    private static (Guid PlayerId, string Token) SeedPlayer(
        Ctx c, bool checkedIn = false, bool hasCard = false, string token = "tok-abc")
    {
        var id = Guid.NewGuid();
        c.Db.Players.Add(new Player
        {
            Id = id, EventId = c.EventId, FirstName = "Pat", LastName = "Golfer",
            Email = $"{id:N}@x.com", SessionToken = token,
            HasPaymentMethod = hasCard,
            CheckInStatus = checkedIn ? CheckInStatus.CheckedIn : CheckInStatus.Pending,
        });
        c.Db.SaveChanges();
        return (id, token);
    }

    [Fact]
    public async Task GetPublicEventStatus_omits_the_player_block_when_anonymous()
    {
        var c = Build();
        SeedPlayer(c);

        var resp = await c.Svc.GetPublicEventStatusAsync("GALA0001");

        Assert.Null(resp.Player);
    }

    [Fact]
    public async Task GetPublicEventStatus_returns_the_callers_own_state()
    {
        var c = Build();
        var (playerId, token) = SeedPlayer(c, checkedIn: true, hasCard: false);

        var resp = await c.Svc.GetPublicEventStatusAsync("GALA0001", playerId, token);

        Assert.NotNull(resp.Player);
        Assert.True(resp.Player!.IsCheckedIn);
        Assert.False(resp.Player.HasPaymentMethod);
    }

    [Fact]
    public async Task GetPublicEventStatus_tracks_a_pending_golfer_with_a_card()
    {
        var c = Build();
        var (playerId, token) = SeedPlayer(c, checkedIn: false, hasCard: true);

        var resp = await c.Svc.GetPublicEventStatusAsync("GALA0001", playerId, token);

        Assert.NotNull(resp.Player);
        Assert.False(resp.Player!.IsCheckedIn);
        Assert.True(resp.Player.HasPaymentMethod);
    }

    [Fact]
    public async Task GetPublicEventStatus_fails_closed_on_a_bad_token()
    {
        // Wrong token, missing token, and an unknown player must all degrade to
        // the anonymous shape rather than leaking or erroring.
        var c = Build();
        var (playerId, _) = SeedPlayer(c, checkedIn: true);

        Assert.Null((await c.Svc.GetPublicEventStatusAsync("GALA0001", playerId, "wrong")).Player);
        Assert.Null((await c.Svc.GetPublicEventStatusAsync("GALA0001", playerId, null)).Player);
        Assert.Null((await c.Svc.GetPublicEventStatusAsync("GALA0001", playerId, "")).Player);
        Assert.Null((await c.Svc.GetPublicEventStatusAsync("GALA0001", Guid.NewGuid(), "tok-abc")).Player);
    }

    // ── Fundraising: auction revenue ──────────────────────────────────────────
    // The auction spans two storage shapes — live bids while an item is open,
    // AuctionWinner rows once it closes — and the total has to read both or it
    // sits at zero for the whole of bidding and then jumps.

    private static Guid AddItem(
        Ctx c, AuctionType type, AuctionItemStatus status, int currentHighBidCents = 0)
    {
        var id = Guid.NewGuid();
        c.Db.AuctionItems.Add(new AuctionItem
        {
            Id = id, EventId = c.EventId, Title = $"Item {id:N}",
            AuctionType = type, Status = status,
            StartingBidCents = 1000, BidIncrementCents = 500,
            CurrentHighBidCents = currentHighBidCents,
        });
        c.Db.SaveChanges();
        return id;
    }

    private static void AddBid(Ctx c, Guid itemId, int amountCents)
    {
        c.Db.Bids.Add(new Bid
        {
            Id = Guid.NewGuid(), AuctionItemId = itemId,
            PlayerId = Guid.NewGuid(), AmountCents = amountCents,
        });
        c.Db.SaveChanges();
    }

    private static void AddWinner(Ctx c, Guid itemId, int amountCents, ChargeStatus charge)
    {
        c.Db.AuctionWinners.Add(new AuctionWinner
        {
            Id = Guid.NewGuid(), AuctionItemId = itemId,
            PlayerId = Guid.NewGuid(), AmountCents = amountCents, ChargeStatus = charge,
        });
        c.Db.SaveChanges();
    }

    [Fact]
    public async Task GetFundraising_reports_zero_auction_revenue_when_there_is_no_auction()
    {
        var c = Build();

        var resp = await c.Svc.GetFundraisingAsync(c.OrgId, c.EventId);

        Assert.Equal(0, resp.AuctionCents);
        Assert.Equal(0, resp.AuctionItemsSold);
        Assert.Equal(0, resp.AuctionUncollectedCents);
    }

    [Fact]
    public async Task GetFundraising_counts_the_leading_bid_while_an_item_is_still_open()
    {
        var c = Build();
        AddItem(c, AuctionType.Silent, AuctionItemStatus.Open,     currentHighBidCents: 7500);
        AddItem(c, AuctionType.Live,   AuctionItemStatus.Extended, currentHighBidCents: 2500);

        var resp = await c.Svc.GetFundraisingAsync(c.OrgId, c.EventId);

        Assert.Equal(10000, resp.AuctionCents);
        // Nothing has closed, so nothing is sold and nothing is owed yet.
        Assert.Equal(0, resp.AuctionItemsSold);
        Assert.Equal(0, resp.AuctionUncollectedCents);
    }

    [Fact]
    public async Task GetFundraising_stacks_every_pledge_on_an_open_fund_a_need_item()
    {
        // CurrentHighBidCents is never written for donation items — reading it
        // would report zero no matter how much was pledged.
        var c    = Build();
        var item = AddItem(c, AuctionType.DonationSilent, AuctionItemStatus.Open);
        AddBid(c, item, 2500);
        AddBid(c, item, 1000);
        AddBid(c, item, 500);

        var resp = await c.Svc.GetFundraisingAsync(c.OrgId, c.EventId);

        Assert.Equal(4000, resp.AuctionCents);
    }

    [Fact]
    public async Task GetFundraising_uses_winner_rows_once_an_item_has_closed()
    {
        var c      = Build();
        var closed = AddItem(c, AuctionType.Silent, AuctionItemStatus.Closed, currentHighBidCents: 9000);
        AddWinner(c, closed, 9000, ChargeStatus.Succeeded);
        // Stray losing bids on a closed item must not be double-counted.
        AddBid(c, closed, 8500);
        AddBid(c, closed, 9000);

        var resp = await c.Svc.GetFundraisingAsync(c.OrgId, c.EventId);

        Assert.Equal(9000, resp.AuctionCents);
        Assert.Equal(1, resp.AuctionItemsSold);
        Assert.Equal(0, resp.AuctionUncollectedCents);
    }

    [Fact]
    public async Task GetFundraising_excludes_waived_charges_but_keeps_pending_and_failed()
    {
        var c = Build();
        var a = AddItem(c, AuctionType.Silent, AuctionItemStatus.Awarded);
        var b = AddItem(c, AuctionType.Silent, AuctionItemStatus.Closed);
        var d = AddItem(c, AuctionType.Silent, AuctionItemStatus.Closed);
        AddWinner(c, a, 5000, ChargeStatus.Succeeded);
        AddWinner(c, b, 3000, ChargeStatus.Failed);    // still owed — recoverable
        AddWinner(c, d, 4000, ChargeStatus.Waived);    // organizer wrote it off

        var resp = await c.Svc.GetFundraisingAsync(c.OrgId, c.EventId);

        Assert.Equal(8000, resp.AuctionCents);
        Assert.Equal(3000, resp.AuctionUncollectedCents);
        // The waived item does not count as sold either.
        Assert.Equal(2, resp.AuctionItemsSold);
    }

    [Fact]
    public async Task GetFundraising_ignores_cancelled_items_entirely()
    {
        var c         = Build();
        var cancelled = AddItem(c, AuctionType.Silent, AuctionItemStatus.Cancelled, currentHighBidCents: 6000);
        AddBid(c, cancelled, 6000);

        var resp = await c.Svc.GetFundraisingAsync(c.OrgId, c.EventId);

        Assert.Equal(0, resp.AuctionCents);
    }

    [Fact]
    public async Task GetFundraising_rolls_the_auction_into_the_grand_total()
    {
        var c = Build();
        c.Db.Sponsors.Add(new Sponsor
        {
            Id = Guid.NewGuid(), EventId = c.EventId, Name = "Acme",
            Tier = SponsorTier.Gold, DonationAmountCents = 25000, PlacementsJson = "{}",
        });
        var sold = AddItem(c, AuctionType.Silent, AuctionItemStatus.Closed);
        AddWinner(c, sold, 9000, ChargeStatus.Succeeded);
        AddItem(c, AuctionType.Silent, AuctionItemStatus.Open, currentHighBidCents: 1500);
        c.Db.SaveChanges();

        var resp = await c.Svc.GetFundraisingAsync(c.OrgId, c.EventId);

        Assert.Equal(10500, resp.AuctionCents);
        Assert.Equal(25000 + 10500, resp.GrandTotalCents);
    }

    [Fact]
    public async Task GetFundraising_counts_teams_paid_from_the_roster_not_the_legacy_flag()
    {
        // The team flag survives from before the per-golfer fee and was never
        // backfilled, so a true flag can sit over a roster that has paid nothing.
        // Counting it made teamsPaid contradict playersPaid in the same payload.
        var c    = Build();
        var full = Guid.NewGuid();
        var stale = Guid.NewGuid();
        c.Db.Teams.Add(new Team { Id = full,  EventId = c.EventId, Name = "Paid",  MaxPlayers = 4 });
        c.Db.Teams.Add(new Team { Id = stale, EventId = c.EventId, Name = "Stale", MaxPlayers = 4, EntryFeePaid = true });
        c.Db.Players.AddRange(
            new Player { Id = Guid.NewGuid(), EventId = c.EventId, TeamId = full,  FirstName = "A", LastName = "A", Email = "a@x.com", EntryFeePaidCents = 7500 },
            new Player { Id = Guid.NewGuid(), EventId = c.EventId, TeamId = full,  FirstName = "B", LastName = "B", Email = "b@x.com", EntryFeePaidCents = 7500 },
            new Player { Id = Guid.NewGuid(), EventId = c.EventId, TeamId = stale, FirstName = "C", LastName = "C", Email = "c@x.com", EntryFeePaidCents = 0 },
            new Player { Id = Guid.NewGuid(), EventId = c.EventId, TeamId = stale, FirstName = "D", LastName = "D", Email = "d@x.com", EntryFeePaidCents = 0 });
        c.Db.SaveChanges();

        var resp = await c.Svc.GetFundraisingAsync(c.OrgId, c.EventId);

        Assert.Equal(1, resp.TeamsPaid);
        Assert.Equal(2, resp.TeamsTotal);
        // The two views of the same money now agree.
        Assert.Equal(2, resp.PlayersPaid);
        Assert.Equal(4, resp.PlayersTotal);
        Assert.Equal(15000, resp.EntryFeesCents);
    }

    // ── Shotgun starting holes on going Active (U5) ──────────────────────────

    /// <summary>Going Active needs a course attached, plus some teams.</summary>
    private static void SeedCourseAndTeams(Ctx c, params string[] teamNames)
    {
        var courseId = Guid.NewGuid();
        c.Db.Courses.Add(new Course
        {
            Id = courseId, Name = "Test Links", Address = "1 Fairway",
            City = "Testville", State = "MN", Zip = "55555",
        });
        var evt = c.Db.Events.Single(e => e.Id == c.EventId);
        evt.CourseId = courseId;

        foreach (var name in teamNames)
        {
            c.Db.Teams.Add(new Team
            {
                Id = Guid.NewGuid(), EventId = c.EventId, Name = name, MaxPlayers = 4,
            });
        }
        c.Db.SaveChanges();
    }

    [Fact]
    public async Task Going_Active_assigns_starting_holes_on_a_shotgun_event()
    {
        var c = Build(EventStatus.Registration);
        SeedCourseAndTeams(c, "Alpha", "Bravo", "Charlie");

        await c.Svc.UpdateAsync(c.OrgId, c.EventId,
            new UpdateEventRequest { Status = EventStatus.Active });

        var holes = c.Db.Teams.Where(t => t.EventId == c.EventId)
            .OrderBy(t => t.Name).Select(t => t.StartingHole).ToList();

        Assert.All(holes, h => Assert.NotNull(h));
        Assert.Equal(3, holes.Distinct().Count());
    }

    [Fact]
    public async Task Going_Active_leaves_a_manually_assigned_team_alone()
    {
        var c = Build(EventStatus.Registration);
        SeedCourseAndTeams(c, "Alpha", "Bravo");
        var alpha = c.Db.Teams.Single(t => t.Name == "Alpha");
        alpha.StartingHole = 12;          // set on the admin shotgun screen
        c.Db.SaveChanges();

        await c.Svc.UpdateAsync(c.OrgId, c.EventId,
            new UpdateEventRequest { Status = EventStatus.Active });

        Assert.Equal((short)12, c.Db.Teams.Single(t => t.Name == "Alpha").StartingHole);
        Assert.NotNull(c.Db.Teams.Single(t => t.Name == "Bravo").StartingHole);
    }

    [Fact]
    public async Task Going_Active_does_not_assign_holes_on_a_tee_time_event()
    {
        // Tee-time events start every team at hole 1 in turn, so a starting
        // hole would be meaningless — and would make the scorecard lie.
        var c = Build(EventStatus.Registration);
        SeedCourseAndTeams(c, "Alpha", "Bravo");
        c.Db.Events.Single(e => e.Id == c.EventId).StartType = EventStartType.TeeTimes;
        c.Db.SaveChanges();

        await c.Svc.UpdateAsync(c.OrgId, c.EventId,
            new UpdateEventRequest { Status = EventStatus.Active });

        Assert.All(c.Db.Teams.Where(t => t.EventId == c.EventId),
                   t => Assert.Null(t.StartingHole));
    }
}
