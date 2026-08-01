using Xunit;
using Microsoft.Extensions.Logging.Abstractions;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.RealTime;
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

    private static (ScoreService svc, GolfFundraiserPro.Api.Data.ApplicationDbContext db, CountingRealTimeService rt) BuildCounting()
    {
        var db  = InMemoryDbFactory.Create();
        var rt  = new CountingRealTimeService();
        var svc = new ScoreService(db, rt, NullLogger<ScoreService>.Instance);
        return (svc, db, rt);
    }

    /// <summary>Capturing IRealTimeService stub — counts ScoreUpdated broadcasts.</summary>
    private sealed class CountingRealTimeService : IRealTimeService
    {
        public int PublishScoreCount { get; private set; }

        public Task PublishScoreAsync(
            string eventCode, Guid eventId, Guid teamId,
            short holeNumber, short grossScore, string teamName,
            CancellationToken ct = default)
        {
            PublishScoreCount++;
            return Task.CompletedTask;
        }

        public Task PublishLeaderboardAsync(string eventCode, Guid eventId, IEnumerable<(Guid TeamId, string TeamName, short HoleNumber, short GrossScore)> acceptedScores, CancellationToken ct = default) => Task.CompletedTask;
        public Task SendCheckInUpdatedAsync(string eventCode, Guid eventId, CancellationToken ct = default) => Task.CompletedTask;
        public Task SendBidPlacedAsync(string eventCode, Guid itemId, Guid playerId, int amountCents, bool isDonation, CancellationToken ct = default) => Task.CompletedTask;
        public Task SendAuctionExtendedAsync(string eventCode, Guid itemId, DateTime newClosesAt, CancellationToken ct = default) => Task.CompletedTask;
        public Task SendItemClosedAsync(string eventCode, Guid itemId, Guid? winnerId, int finalAmountCents, CancellationToken ct = default) => Task.CompletedTask;
        public Task SendLiveAuctionStartedAsync(string eventCode, Guid sessionId, CancellationToken ct = default) => Task.CompletedTask;
        public Task SendLiveItemAdvancedAsync(string eventCode, Guid? itemId, CancellationToken ct = default) => Task.CompletedTask;
        public Task SendPledgeReceivedAsync(string eventCode, Guid itemId, Guid playerId, int amountCents, CancellationToken ct = default) => Task.CompletedTask;
        public Task SendAuctionTotalUpdatedAsync(string eventCode, Guid itemId, int totalCents, CancellationToken ct = default) => Task.CompletedTask;
        public Task SendAuctionAmountUpdatedAsync(string eventCode, Guid? itemId, int amountCents, CancellationToken ct = default) => Task.CompletedTask;
        public Task SendBidderCountUpdatedAsync(string eventCode, int count, CancellationToken ct = default) => Task.CompletedTask;
        public Task SendSponsorsChangedAsync(string eventCode, int version, CancellationToken ct = default) => Task.CompletedTask;
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

    // ── Proposed score on conflict ────────────────────────────────────────────

    [Fact]
    public async Task SubmitAsync_records_proposed_score_on_conflict()
    {
        var (svc, db) = Build();
        var (orgId, eventId, teamId) = await SeedAsync(db);

        await svc.SubmitAsync(orgId, eventId, new SubmitScoreRequest { TeamId = teamId, HoleNumber = 1, GrossScore = 4, DeviceId = "dev-A" });
        var result = await svc.SubmitAsync(orgId, eventId, new SubmitScoreRequest { TeamId = teamId, HoleNumber = 1, GrossScore = 6, DeviceId = "dev-B" });

        Assert.True(result.IsConflicted);
        Assert.Equal(4, result.GrossScore);            // authoritative value kept
        Assert.Equal((short)6, result.ProposedScore);  // golfer's value surfaced for approval
    }

    [Fact]
    public async Task SubmitAsync_clears_proposed_when_same_device_overwrites()
    {
        var (svc, db) = Build();
        var (orgId, eventId, teamId) = await SeedAsync(db);

        await svc.SubmitAsync(orgId, eventId, new SubmitScoreRequest { TeamId = teamId, HoleNumber = 1, GrossScore = 4, DeviceId = "dev-A" });
        await svc.SubmitAsync(orgId, eventId, new SubmitScoreRequest { TeamId = teamId, HoleNumber = 1, GrossScore = 6, DeviceId = "dev-B" }); // conflict, proposed=6
        var result = await svc.SubmitAsync(orgId, eventId, new SubmitScoreRequest { TeamId = teamId, HoleNumber = 1, GrossScore = 5, DeviceId = "dev-A" });

        Assert.False(result.IsConflicted);
        Assert.Equal(5, result.GrossScore);
        Assert.Null(result.ProposedScore);
    }

    [Fact]
    public async Task ResolveConflictAsync_clears_conflict_and_proposed_and_broadcasts()
    {
        var (svc, db, rt) = BuildCounting();
        var (orgId, eventId, teamId) = await SeedAsync(db);

        await svc.SubmitAsync(orgId, eventId, new SubmitScoreRequest { TeamId = teamId, HoleNumber = 1, GrossScore = 4, DeviceId = "dev-A" });
        await svc.SubmitAsync(orgId, eventId, new SubmitScoreRequest { TeamId = teamId, HoleNumber = 1, GrossScore = 6, DeviceId = "dev-B" }); // conflict
        var scoreId = db.Scores.Single(s => s.EventId == eventId && s.TeamId == teamId && s.HoleNumber == 1).Id;
        var before  = rt.PublishScoreCount;

        var result = await svc.ResolveConflictAsync(orgId, eventId, scoreId,
            new ResolveConflictRequest { AcceptedScore = 6 }); // admin approves the proposed value

        Assert.False(result.IsConflicted);
        Assert.Equal(6, result.GrossScore);
        Assert.Null(result.ProposedScore);
        Assert.Equal(before + 1, rt.PublishScoreCount); // resolution pushed to leaderboard + devices
    }

    [Fact]
    public async Task UpdateAsync_clears_proposed_and_broadcasts()
    {
        var (svc, db, rt) = BuildCounting();
        var (orgId, eventId, teamId) = await SeedAsync(db);

        await svc.SubmitAsync(orgId, eventId, new SubmitScoreRequest { TeamId = teamId, HoleNumber = 1, GrossScore = 4, DeviceId = "dev-A" });
        await svc.SubmitAsync(orgId, eventId, new SubmitScoreRequest { TeamId = teamId, HoleNumber = 1, GrossScore = 6, DeviceId = "dev-B" }); // conflict
        var scoreId = db.Scores.Single(s => s.EventId == eventId && s.TeamId == teamId && s.HoleNumber == 1).Id;
        var before  = rt.PublishScoreCount;

        var result = await svc.UpdateAsync(orgId, eventId, scoreId, new UpdateScoreRequest { GrossScore = 5 });

        Assert.False(result.IsConflicted);
        Assert.Equal(5, result.GrossScore);
        Assert.Null(result.ProposedScore);
        Assert.Equal(before + 1, rt.PublishScoreCount);
    }

    // ── Hole completion (U1) ──────────────────────────────────────────────────

    [Fact]
    public async Task Submitting_a_score_does_not_mark_the_hole_complete()
    {
        // The whole point of the column: the desk transcribes a paper card and
        // the hole auto-saves after the FIRST golfer's strokes. If a score
        // implied completion, the hole would lock while still half-entered.
        var (svc, db) = Build();
        var (orgId, eventId, teamId) = await SeedAsync(db);

        await svc.SubmitAsync(orgId, eventId, new SubmitScoreRequest
        {
            TeamId = teamId, HoleNumber = 1, GrossScore = 4, DeviceId = "admin-dashboard",
        });

        var card = await svc.GetScorecardAsync(orgId, eventId, teamId);
        var hole = card.Holes.Single(h => h.HoleNumber == 1);

        Assert.Equal((short)4, hole.GrossScore);
        Assert.Null(hole.CompletedAt);
    }

    [Fact]
    public async Task SetHoleCompleteAsync_marks_and_reopens_a_hole()
    {
        var (svc, db) = Build();
        var (orgId, eventId, teamId) = await SeedAsync(db);

        await svc.SubmitAsync(orgId, eventId, new SubmitScoreRequest
        {
            TeamId = teamId, HoleNumber = 3, GrossScore = 5, DeviceId = "admin-dashboard",
        });

        var completed = await svc.SetHoleCompleteAsync(orgId, eventId, teamId, 3, complete: true);
        Assert.NotNull(completed.CompletedAt);
        Assert.Equal((short)5, completed.GrossScore);

        // "Edit Score" reopens without disturbing the score itself.
        var reopened = await svc.SetHoleCompleteAsync(orgId, eventId, teamId, 3, complete: false);
        Assert.Null(reopened.CompletedAt);
        Assert.Equal((short)5, reopened.GrossScore);
    }

    [Fact]
    public async Task SetHoleCompleteAsync_rejects_a_hole_with_no_score()
    {
        var (svc, db) = Build();
        var (orgId, eventId, teamId) = await SeedAsync(db);

        // An empty hole isn't "finished" — completing it would invent a score.
        await Assert.ThrowsAsync<GolfFundraiserPro.Api.Common.Middleware.ValidationException>(
            () => svc.SetHoleCompleteAsync(orgId, eventId, teamId, 7, complete: true));
    }

    [Fact]
    public async Task SetHoleCompleteAsync_rejects_a_hole_outside_the_event()
    {
        var (svc, db) = Build();
        var (orgId, eventId, teamId) = await SeedAsync(db);

        await Assert.ThrowsAsync<GolfFundraiserPro.Api.Common.Middleware.ValidationException>(
            () => svc.SetHoleCompleteAsync(orgId, eventId, teamId, 19, complete: true));
    }
}
