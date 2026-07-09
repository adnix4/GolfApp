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
}
