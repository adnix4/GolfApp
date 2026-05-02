using Xunit;
using Microsoft.Extensions.Logging.Abstractions;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Scores;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests;

/// <summary>
/// Integration tests for ScoreService.SubmitAsync using an in-memory EF Core database.
/// These tests verify the full DB-read → conflict-detect → DB-write round-trip
/// on top of the unit-tested ScoreConflictRules logic.
/// </summary>
public class ScoreServiceIntegrationTests
{
    // ── Helpers ───────────────────────────────────────────────────────────────

    private static (ScoreService svc, GolfFundraiserPro.Api.Data.ApplicationDbContext db) Build()
    {
        var db  = InMemoryDbFactory.Create();
        var svc = new ScoreService(db, new NullRealTimeService(),
                                   NullLogger<ScoreService>.Instance);
        return (svc, db);
    }

    private static async Task<(Guid orgId, Guid eventId, Guid teamId)> SeedAsync(
        GolfFundraiserPro.Api.Data.ApplicationDbContext db)
    {
        var orgId   = Guid.NewGuid();
        var eventId = Guid.NewGuid();
        var teamId  = Guid.NewGuid();

        db.Organizations.Add(new Organization { Id = orgId, Name = "Test Org", Slug = "test" });

        db.Events.Add(new Event
        {
            Id        = eventId,
            OrgId     = orgId,
            Name      = "Test Event",
            EventCode = "ABCD1234",
            Format    = EventFormat.Scramble,
            StartType = EventStartType.Shotgun,
            Holes     = 18,
            Status    = EventStatus.Scoring,
            ConfigJson = "{}",
        });

        db.Teams.Add(new Team
        {
            Id        = teamId,
            EventId   = eventId,
            Name      = "Eagles",
            MaxPlayers = 4,
        });

        await db.SaveChangesAsync();
        return (orgId, eventId, teamId);
    }

    // ── New score ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task SubmitAsync_creates_a_new_score_when_none_exists()
    {
        var (svc, db) = Build();
        var (orgId, eventId, teamId) = await SeedAsync(db);

        var req = new SubmitScoreRequest
        {
            TeamId    = teamId,
            HoleNumber = 1,
            GrossScore = 4,
            DeviceId  = "dev-A",
        };

        var result = await svc.SubmitAsync(orgId, eventId, req);

        Assert.Equal(4,       result.GrossScore);
        Assert.Equal(1,       result.HoleNumber);
        Assert.False(result.IsConflicted);
    }

    // ── Same device, overwrite ────────────────────────────────────────────────

    [Fact]
    public async Task SubmitAsync_overwrites_when_same_device_corrects_score()
    {
        var (svc, db) = Build();
        var (orgId, eventId, teamId) = await SeedAsync(db);

        var req1 = new SubmitScoreRequest { TeamId = teamId, HoleNumber = 1, GrossScore = 4, DeviceId = "dev-A" };
        var req2 = new SubmitScoreRequest { TeamId = teamId, HoleNumber = 1, GrossScore = 5, DeviceId = "dev-A" };

        await svc.SubmitAsync(orgId, eventId, req1);
        var result = await svc.SubmitAsync(orgId, eventId, req2);

        Assert.Equal(5, result.GrossScore);
        Assert.False(result.IsConflicted);

        // Only one row in DB (upsert, not insert)
        Assert.Equal(1, db.Scores.Count(s => s.EventId == eventId && s.TeamId == teamId && s.HoleNumber == 1));
    }

    // ── Different device, same value — accept ─────────────────────────────────

    [Fact]
    public async Task SubmitAsync_accepts_without_conflict_when_different_device_agrees()
    {
        var (svc, db) = Build();
        var (orgId, eventId, teamId) = await SeedAsync(db);

        await svc.SubmitAsync(orgId, eventId, new SubmitScoreRequest { TeamId = teamId, HoleNumber = 1, GrossScore = 4, DeviceId = "dev-A" });
        var result = await svc.SubmitAsync(orgId, eventId, new SubmitScoreRequest { TeamId = teamId, HoleNumber = 1, GrossScore = 4, DeviceId = "dev-B" });

        Assert.False(result.IsConflicted);
    }

    // ── Different device, different value — conflict ──────────────────────────

    [Fact]
    public async Task SubmitAsync_marks_conflicted_when_different_device_disagrees()
    {
        var (svc, db) = Build();
        var (orgId, eventId, teamId) = await SeedAsync(db);

        await svc.SubmitAsync(orgId, eventId, new SubmitScoreRequest { TeamId = teamId, HoleNumber = 1, GrossScore = 4, DeviceId = "dev-A" });
        var result = await svc.SubmitAsync(orgId, eventId, new SubmitScoreRequest { TeamId = teamId, HoleNumber = 1, GrossScore = 6, DeviceId = "dev-B" });

        Assert.True(result.IsConflicted);
        Assert.Equal(4, result.GrossScore); // original score NOT overwritten
    }

    // ── Wrong event status ────────────────────────────────────────────────────

    [Fact]
    public async Task SubmitAsync_throws_when_event_is_not_active_or_scoring()
    {
        var (svc, db) = Build();
        var (orgId, eventId, _) = await SeedAsync(db);

        var evt = await db.Events.FindAsync(eventId);
        evt!.Status = EventStatus.Registration;
        await db.SaveChangesAsync();

        var teamId = db.Teams.First(t => t.EventId == eventId).Id;
        var req    = new SubmitScoreRequest { TeamId = teamId, HoleNumber = 1, GrossScore = 4, DeviceId = "dev-A" };

        await Assert.ThrowsAsync<GolfFundraiserPro.Api.Common.Middleware.ValidationException>(
            () => svc.SubmitAsync(orgId, eventId, req));
    }
}
