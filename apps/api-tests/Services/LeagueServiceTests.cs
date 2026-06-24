using Xunit;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Emails;
using GolfFundraiserPro.Api.Features.League;
using GolfFundraiserPro.Api.Features.Notifications;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Services;

/// <summary>
/// Tests for LeagueService orchestration: league/season CRUD with enum + ownership
/// validation, round creation, member management, the per-hole net/Stableford
/// scoring math, round-status transitions, absences, and handicap overrides.
/// (CloseRoundAsync is excluded — its handicap-recalc query isn't InMemory-translatable.)
/// </summary>
public class LeagueServiceTests
{
    private sealed class Ctx
    {
        public ApplicationDbContext Db = null!;
        public LeagueService Svc = null!;
        public Guid OrgId;
    }

    private static Ctx Build()
    {
        var db = InMemoryDbFactory.Create();
        var config = new ConfigurationBuilder().Build();
        var svc = new LeagueService(
            db,
            new HandicapEngine(db, NullLogger<HandicapEngine>.Instance),
            new StandingsCalculator(db),
            new SkinsCalculator(db),
            new PairingEngine(db),
            new EmailService(db, config, NullLogger<EmailService>.Instance),
            new PushNotificationService(new NullHttpClientFactory(), NullLogger<PushNotificationService>.Instance),
            NullLogger<LeagueService>.Instance);
        return new Ctx { Db = db, Svc = svc, OrgId = Guid.NewGuid() };
    }

    private static async Task<Guid> NewLeague(Ctx c, string format = "Stableford")
    {
        var l = await c.Svc.CreateLeagueAsync(c.OrgId, new CreateLeagueRequest { Name = "L", Format = format }, default);
        return l.Id;
    }

    private static async Task<Guid> NewSeason(Ctx c, Guid leagueId)
    {
        var s = await c.Svc.CreateSeasonAsync(c.OrgId, leagueId, new CreateSeasonRequest
        {
            Name = "S1", TotalRounds = 5,
            StartDate = DateOnly.FromDateTime(DateTime.UtcNow),
            EndDate = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(3)),
        }, default);
        return s.Id;
    }

    // ── Leagues ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task CreateLeague_rejects_unknown_format()
    {
        var c = Build();
        await Assert.ThrowsAsync<ValidationException>(() =>
            c.Svc.CreateLeagueAsync(c.OrgId, new CreateLeagueRequest { Name = "L", Format = "NotAFormat" }, default));
    }

    [Fact]
    public async Task CreateLeague_rejects_unknown_handicap_system()
    {
        var c = Build();
        await Assert.ThrowsAsync<ValidationException>(() =>
            c.Svc.CreateLeagueAsync(c.OrgId, new CreateLeagueRequest { Name = "L", Format = "Stroke", HandicapSystem = "Bogus" }, default));
    }

    [Fact]
    public async Task CreateLeague_then_GetLeagues_returns_it()
    {
        var c = Build();
        await NewLeague(c, "Match");
        var leagues = await c.Svc.GetLeaguesAsync(c.OrgId, default);
        var l = Assert.Single(leagues);
        Assert.Equal("Match", l.Format);
    }

    [Fact]
    public async Task UpdateLeague_for_other_org_throws_NotFound()
    {
        var c = Build();
        var leagueId = await NewLeague(c);
        await Assert.ThrowsAsync<NotFoundException>(() =>
            c.Svc.UpdateLeagueAsync(Guid.NewGuid(), leagueId, new UpdateLeagueRequest { Name = "x" }, default));
    }

    // ── Seasons / rounds / members ──────────────────────────────────────────────

    [Fact]
    public async Task CreateSeason_under_unowned_league_throws_NotFound()
    {
        var c = Build();
        var leagueId = await NewLeague(c);
        await Assert.ThrowsAsync<NotFoundException>(() =>
            c.Svc.CreateSeasonAsync(Guid.NewGuid(), leagueId, new CreateSeasonRequest
            {
                Name = "S", TotalRounds = 1,
                StartDate = DateOnly.FromDateTime(DateTime.UtcNow),
                EndDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)),
            }, default));
    }

    [Fact]
    public async Task AddMember_then_GetMembers_lists_them()
    {
        var c = Build();
        var leagueId = await NewLeague(c);
        var seasonId = await NewSeason(c, leagueId);

        await c.Svc.AddMemberAsync(c.OrgId, leagueId, seasonId, new AddMemberRequest
        {
            FirstName = "Alex", LastName = "Player", Email = "alex@x.com", HandicapIndex = 12,
        }, default);

        var members = await c.Svc.GetMembersAsync(c.OrgId, leagueId, seasonId, default);
        var m = Assert.Single(members);
        Assert.Equal("Alex", m.FirstName);
        Assert.False(m.IsSandbagger);
    }

    [Fact]
    public async Task CreateRound_then_GetRounds_lists_them()
    {
        var c = Build();
        var leagueId = await NewLeague(c);
        var seasonId = await NewSeason(c, leagueId);

        await c.Svc.CreateRoundAsync(c.OrgId, leagueId, seasonId, new CreateRoundRequest
        {
            RoundDate = DateOnly.FromDateTime(DateTime.UtcNow),
        }, default);

        var rounds = await c.Svc.GetRoundsAsync(c.OrgId, leagueId, seasonId, default);
        Assert.Single(rounds);
        Assert.Equal("Scheduled", rounds[0].Status);
    }

    // ── Scoring math ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task SubmitScore_computes_net_and_stableford_with_handicap_stroke()
    {
        var c = Build();
        var leagueId = await NewLeague(c);
        var seasonId = await NewSeason(c, leagueId);

        // Course with hole 1 par 4, hardest hole (handicap index 1).
        var courseId = Guid.NewGuid();
        var course = new Course { Id = courseId, OrgId = c.OrgId, Name = "C" };
        for (short h = 1; h <= 18; h++)
            course.Holes.Add(new CourseHole { Id = Guid.NewGuid(), CourseId = courseId, HoleNumber = h, Par = 4, HandicapIndex = h });
        c.Db.Courses.Add(course);

        var member = new LeagueMember
        {
            Id = Guid.NewGuid(), SeasonId = seasonId, FirstName = "A", LastName = "B",
            Email = "a@x.com", HandicapIndex = 1, Status = MemberStatus.Active,
        };
        c.Db.LeagueMembers.Add(member);
        var roundId = Guid.NewGuid();
        c.Db.LeagueRounds.Add(new LeagueRound
        {
            Id = roundId, SeasonId = seasonId, CourseId = courseId, Status = RoundStatus.Scoring,
            RoundDate = DateOnly.FromDateTime(DateTime.UtcNow),
        });
        await c.Db.SaveChangesAsync();

        await c.Svc.SubmitScoreAsync(c.OrgId, leagueId, seasonId, roundId, new SubmitLeagueScoreRequest
        {
            MemberId = member.Id, HoleNumber = 1, GrossScore = 5,
        }, default);

        var score = c.Db.LeagueScores.Single();
        // hcp index 1 <= course handicap 1 -> 1 stroke; net = 5-1 = 4; stableford = max(0, 2+4-4) = 2
        Assert.Equal((short)4, score.NetScore);
        Assert.Equal((short)2, score.StablefordPoints);
    }

    [Fact]
    public async Task SubmitScore_when_round_not_scoring_throws_Validation()
    {
        var c = Build();
        var leagueId = await NewLeague(c);
        var seasonId = await NewSeason(c, leagueId);
        var roundResp = await c.Svc.CreateRoundAsync(c.OrgId, leagueId, seasonId, new CreateRoundRequest
        {
            RoundDate = DateOnly.FromDateTime(DateTime.UtcNow),
        }, default); // Scheduled, not Scoring

        var member = new LeagueMember { Id = Guid.NewGuid(), SeasonId = seasonId, FirstName = "A", LastName = "B", Email = "a@x.com", Status = MemberStatus.Active };
        c.Db.LeagueMembers.Add(member);
        await c.Db.SaveChangesAsync();

        await Assert.ThrowsAsync<ValidationException>(() =>
            c.Svc.SubmitScoreAsync(c.OrgId, leagueId, seasonId, roundResp.Id, new SubmitLeagueScoreRequest
            {
                MemberId = member.Id, HoleNumber = 1, GrossScore = 5,
            }, default));
    }

    // ── Status transitions ──────────────────────────────────────────────────────

    [Fact]
    public async Task OpenScoring_moves_scheduled_round_to_scoring()
    {
        var c = Build();
        var leagueId = await NewLeague(c);
        var seasonId = await NewSeason(c, leagueId);
        var round = await c.Svc.CreateRoundAsync(c.OrgId, leagueId, seasonId, new CreateRoundRequest
        {
            RoundDate = DateOnly.FromDateTime(DateTime.UtcNow),
        }, default);

        await c.Svc.OpenScoringAsync(c.OrgId, leagueId, seasonId, round.Id, default);

        Assert.Equal(RoundStatus.Scoring, c.Db.LeagueRounds.Single(r => r.Id == round.Id).Status);
    }

    [Fact]
    public async Task OpenScoring_on_closed_round_throws_Validation()
    {
        var c = Build();
        var leagueId = await NewLeague(c);
        var seasonId = await NewSeason(c, leagueId);
        var roundId = Guid.NewGuid();
        c.Db.LeagueRounds.Add(new LeagueRound
        {
            Id = roundId, SeasonId = seasonId, Status = RoundStatus.Closed,
            RoundDate = DateOnly.FromDateTime(DateTime.UtcNow),
        });
        await c.Db.SaveChangesAsync();

        await Assert.ThrowsAsync<ValidationException>(() =>
            c.Svc.OpenScoringAsync(c.OrgId, leagueId, seasonId, roundId, default));
    }

    // ── Absences ──────────────────────────────────────────────────────────────────

    [Fact]
    public async Task ReportAbsence_records_once_and_rejects_duplicates()
    {
        var c = Build();
        var leagueId = await NewLeague(c);
        var seasonId = await NewSeason(c, leagueId);
        var round = await c.Svc.CreateRoundAsync(c.OrgId, leagueId, seasonId, new CreateRoundRequest
        {
            RoundDate = DateOnly.FromDateTime(DateTime.UtcNow),
        }, default);
        var member = new LeagueMember { Id = Guid.NewGuid(), SeasonId = seasonId, FirstName = "A", LastName = "B", Email = "a@x.com", Status = MemberStatus.Active };
        c.Db.LeagueMembers.Add(member);
        await c.Db.SaveChangesAsync();

        await c.Svc.ReportAbsenceAsync(c.OrgId, leagueId, seasonId, round.Id, new ReportAbsenceRequest { MemberId = member.Id }, default);
        Assert.Equal((short)1, c.Db.LeagueMembers.Single(m => m.Id == member.Id).Absences);

        await Assert.ThrowsAsync<ValidationException>(() =>
            c.Svc.ReportAbsenceAsync(c.OrgId, leagueId, seasonId, round.Id, new ReportAbsenceRequest { MemberId = member.Id }, default));
    }

    // ── Handicap override ─────────────────────────────────────────────────────────

    [Fact]
    public async Task OverrideHandicap_updates_index_and_logs_history()
    {
        var c = Build();
        var leagueId = await NewLeague(c);
        var seasonId = await NewSeason(c, leagueId);
        var member = new LeagueMember { Id = Guid.NewGuid(), SeasonId = seasonId, FirstName = "A", LastName = "B", Email = "a@x.com", HandicapIndex = 20, Status = MemberStatus.Active };
        c.Db.LeagueMembers.Add(member);
        await c.Db.SaveChangesAsync();

        await c.Svc.OverrideHandicapAsync(c.OrgId, leagueId, seasonId, member.Id,
            new OverrideHandicapRequest { NewIndex = 12, Reason = "manual" }, default);

        Assert.Equal(12, c.Db.LeagueMembers.Single(m => m.Id == member.Id).HandicapIndex);
        var hist = c.Db.HandicapHistories.Single(h => h.MemberId == member.Id);
        Assert.True(hist.AdminOverride);
        Assert.Equal(20, hist.OldIndex);
        Assert.Equal(12, hist.NewIndex);
    }

    // ── Season sync toggle ──────────────────────────────────────────────────────

    [Fact]
    public async Task UpdateSeasonSync_toggles_the_flag()
    {
        var c = Build();
        var leagueId = await NewLeague(c);
        var seasonId = await NewSeason(c, leagueId);

        await c.Svc.UpdateSeasonSyncAsync(c.OrgId, leagueId, seasonId, new UpdateSeasonSyncRequest { SyncHandicapToPlayer = true }, default);

        Assert.True(c.Db.Seasons.Single(s => s.Id == seasonId).SyncHandicapToPlayer);
    }
}
