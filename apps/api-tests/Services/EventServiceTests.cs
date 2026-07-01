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
        return new Ctx { Db = db, Svc = svc, EventId = eventId };
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
}
