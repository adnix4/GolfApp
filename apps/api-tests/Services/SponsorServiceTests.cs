using Xunit;
using Microsoft.Extensions.Logging.Abstractions;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Sponsors;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Services;

/// <summary>
/// Tests for SponsorService: event-ownership enforcement, sponsor CRUD + placement
/// round-trip, hole-challenge create/upsert-by-hole, challenge results, and donations.
/// </summary>
public class SponsorServiceTests
{
    /// <summary>Captures SponsorsChanged broadcasts so tests can assert the version bump fired.</summary>
    private sealed class CapturingRealTimeService : NullRealTimeService
    {
        public int Count { get; private set; }
        public int LastVersion { get; private set; }
        public override Task SendSponsorsChangedAsync(string eventCode, int version, CancellationToken ct = default)
        {
            Count++;
            LastVersion = version;
            return Task.CompletedTask;
        }
    }

    private sealed class Ctx
    {
        public ApplicationDbContext Db = null!;
        public SponsorService Svc = null!;
        public CapturingRealTimeService RealTime = null!;
        public Guid OrgId;
        public Guid EventId;
    }

    private static Ctx Build()
    {
        var db = InMemoryDbFactory.Create();
        var orgId = Guid.NewGuid();
        var eventId = Guid.NewGuid();
        db.Organizations.Add(new Organization { Id = orgId, Name = "Acme", Slug = "acme" });
        db.Events.Add(new Event
        {
            Id = eventId, OrgId = orgId, Name = "Gala", EventCode = "GALA0001",
            Format = EventFormat.Scramble, StartType = EventStartType.Shotgun,
            Holes = 18, Status = EventStatus.Registration, ConfigJson = "{}",
        });
        db.SaveChanges();
        var realTime = new CapturingRealTimeService();
        return new Ctx { Db = db, Svc = new SponsorService(db, new FakeFileStorage(), NullLogger<SponsorService>.Instance, realTime), RealTime = realTime, OrgId = orgId, EventId = eventId };
    }

    // ── Ownership ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Create_for_event_owned_by_another_org_throws_NotFound()
    {
        var c = Build();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            c.Svc.CreateSponsorAsync(Guid.NewGuid(), c.EventId, new CreateSponsorRequest { Name = "X", Tier = SponsorTier.Gold }));
    }

    // ── Sponsor CRUD ────────────────────────────────────────────────────────────

    [Fact]
    public async Task Create_then_get_round_trips_placements()
    {
        var c = Build();
        var created = await c.Svc.CreateSponsorAsync(c.OrgId, c.EventId, new CreateSponsorRequest
        {
            Name = "Big Co", Tier = SponsorTier.Title,
            Placements = new SponsorPlacementsDto { Leaderboard = true, HoleNumbers = new() { 7, 14 } },
        });

        Assert.Equal("Title", created.Tier);
        var all = await c.Svc.GetAllSponsorsAsync(c.OrgId, c.EventId);
        var fetched = Assert.Single(all);
        Assert.Equal("Big Co", fetched.Name);
        Assert.Equal(new[] { 7, 14 }, fetched.Placements.HoleNumbers!.ToArray());
        Assert.True(fetched.Placements.Leaderboard);
    }

    [Fact]
    public async Task Sponsor_mutations_bump_version_and_broadcast()
    {
        var c = Build();

        var created = await c.Svc.CreateSponsorAsync(c.OrgId, c.EventId,
            new CreateSponsorRequest { Name = "Big Co", Tier = SponsorTier.Title });

        // Create bumps 0 → 1 and broadcasts the new version.
        Assert.Equal(1, c.Db.Events.Single(e => e.Id == c.EventId).SponsorsVersion);
        Assert.Equal(1, c.RealTime.Count);
        Assert.Equal(1, c.RealTime.LastVersion);

        await c.Svc.UpdateSponsorAsync(c.OrgId, c.EventId, created.Id,
            new UpdateSponsorRequest { Name = "Renamed" });
        await c.Svc.DeleteSponsorAsync(c.OrgId, c.EventId, created.Id);

        // Update and delete each bump + broadcast again.
        Assert.Equal(3, c.Db.Events.Single(e => e.Id == c.EventId).SponsorsVersion);
        Assert.Equal(3, c.RealTime.Count);
        Assert.Equal(3, c.RealTime.LastVersion);
    }

    [Fact]
    public async Task GetAll_orders_by_tier_then_name()
    {
        var c = Build();
        await c.Svc.CreateSponsorAsync(c.OrgId, c.EventId, new CreateSponsorRequest { Name = "Zeta", Tier = SponsorTier.Title });
        await c.Svc.CreateSponsorAsync(c.OrgId, c.EventId, new CreateSponsorRequest { Name = "Alpha", Tier = SponsorTier.Bronze });
        await c.Svc.CreateSponsorAsync(c.OrgId, c.EventId, new CreateSponsorRequest { Name = "Beta", Tier = SponsorTier.Title });

        var all = await c.Svc.GetAllSponsorsAsync(c.OrgId, c.EventId);
        // Title(0) before Bronze(4); within Title, Beta before Zeta.
        Assert.Equal(new[] { "Beta", "Zeta", "Alpha" }, all.Select(s => s.Name).ToArray());
    }

    [Fact]
    public async Task Update_changes_only_provided_fields()
    {
        var c = Build();
        var created = await c.Svc.CreateSponsorAsync(c.OrgId, c.EventId, new CreateSponsorRequest { Name = "Orig", Tier = SponsorTier.Silver, Tagline = "keep" });

        var updated = await c.Svc.UpdateSponsorAsync(c.OrgId, c.EventId, created.Id, new UpdateSponsorRequest { Name = "Renamed" });

        Assert.Equal("Renamed", updated.Name);
        Assert.Equal("keep", updated.Tagline); // untouched
    }

    [Fact]
    public async Task Delete_removes_the_sponsor()
    {
        var c = Build();
        var created = await c.Svc.CreateSponsorAsync(c.OrgId, c.EventId, new CreateSponsorRequest { Name = "Gone", Tier = SponsorTier.Bronze });
        await c.Svc.DeleteSponsorAsync(c.OrgId, c.EventId, created.Id);
        Assert.Empty(await c.Svc.GetAllSponsorsAsync(c.OrgId, c.EventId));
    }

    [Fact]
    public async Task Update_unknown_sponsor_throws_NotFound()
    {
        var c = Build();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            c.Svc.UpdateSponsorAsync(c.OrgId, c.EventId, Guid.NewGuid(), new UpdateSponsorRequest { Name = "x" }));
    }

    // ── Challenges ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task CreateChallenge_with_unknown_sponsor_throws_NotFound()
    {
        var c = Build();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            c.Svc.CreateChallengeAsync(c.OrgId, c.EventId, new CreateChallengeRequest
            {
                ChallengeType = ChallengeType.ClosestToPin, Description = "CTP", HoleNumber = 3,
                SponsorId = Guid.NewGuid(),
            }));
    }

    [Fact]
    public async Task CreateChallenge_succeeds()
    {
        var c = Build();
        var res = await c.Svc.CreateChallengeAsync(c.OrgId, c.EventId, new CreateChallengeRequest
        {
            ChallengeType = ChallengeType.LongestDrive, Description = "LD", HoleNumber = 5,
        });
        Assert.Equal("LongestDrive", res.ChallengeType);
        Assert.Equal((short)5, res.HoleNumber);
    }

    [Fact]
    public async Task UpsertChallengeByHole_is_idempotent_per_hole()
    {
        var c = Build();
        await c.Svc.UpsertChallengeByHoleAsync(c.OrgId, c.EventId, 7,
            new UpsertChallengeByHoleRequest { Description = "First" });
        var second = await c.Svc.UpsertChallengeByHoleAsync(c.OrgId, c.EventId, 7,
            new UpsertChallengeByHoleRequest { Description = "Updated" });

        Assert.Equal("Updated", second.Description);
        var all = await c.Svc.GetAllChallengesAsync(c.OrgId, c.EventId);
        Assert.Single(all); // updated, not duplicated
    }

    [Fact]
    public async Task RecordResult_for_team_not_in_event_throws_NotFound()
    {
        var c = Build();
        var challenge = await c.Svc.CreateChallengeAsync(c.OrgId, c.EventId, new CreateChallengeRequest
        {
            ChallengeType = ChallengeType.ClosestToPin, Description = "CTP", HoleNumber = 3,
        });
        await Assert.ThrowsAsync<NotFoundException>(() =>
            c.Svc.RecordResultAsync(c.OrgId, c.EventId, challenge.Id,
                new RecordChallengeResultRequest { TeamId = Guid.NewGuid(), ResultValue = 12.5f }));
    }

    // ── Donations ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task RecordDonation_lowercases_email_and_lists()
    {
        var c = Build();
        var res = await c.Svc.RecordDonationAsync(c.OrgId, c.EventId, new RecordDonationRequest
        {
            DonorName = "Pat Donor", DonorEmail = "PAT@Example.COM", AmountCents = 5000,
        });
        Assert.Equal("pat@example.com", res.DonorEmail);

        var all = await c.Svc.GetAllDonationsAsync(c.OrgId, c.EventId);
        Assert.Single(all);
    }
}
