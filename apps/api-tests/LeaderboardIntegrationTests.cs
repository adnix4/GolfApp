using Xunit;
using Microsoft.Extensions.Logging.Abstractions;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Events;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests;

/// <summary>
/// Integration tests for EventService.GetLeaderboardAsync using an in-memory DB.
/// Verifies the leaderboard ranking algorithm: toPar calculation, tie handling,
/// unscored teams last, and the default-to-par-4 when no course is attached.
/// </summary>
public class LeaderboardIntegrationTests
{
    private static (EventService svc, GolfFundraiserPro.Api.Data.ApplicationDbContext db) Build()
    {
        var db  = InMemoryDbFactory.Create();
        var svc = new EventService(db, NullLogger<EventService>.Instance);
        return (svc, db);
    }

    /// <summary>Seeds org + 18-hole event with no course attached (par defaults to 4).</summary>
    private static async Task<(Guid orgId, Guid eventId)> SeedEventAsync(
        GolfFundraiserPro.Api.Data.ApplicationDbContext db, int holes = 18)
    {
        var orgId   = Guid.NewGuid();
        var eventId = Guid.NewGuid();

        db.Organizations.Add(new Organization { Id = orgId, Name = "Org", Slug = "org" });
        db.Events.Add(new Event
        {
            Id        = eventId,
            OrgId     = orgId,
            Name      = "Classic",
            EventCode = "LEDRTEST",
            Format    = EventFormat.Scramble,
            StartType = EventStartType.Shotgun,
            Holes     = (short)holes,
            Status    = EventStatus.Scoring,
            ConfigJson = "{}",
        });

        await db.SaveChangesAsync();
        return (orgId, eventId);
    }

    private static Team AddTeam(GolfFundraiserPro.Api.Data.ApplicationDbContext db, Guid eventId, string name)
    {
        var team = new Team { Id = Guid.NewGuid(), EventId = eventId, Name = name, MaxPlayers = 4 };
        db.Teams.Add(team);
        return team;
    }

    private static void AddScore(GolfFundraiserPro.Api.Data.ApplicationDbContext db,
        Guid eventId, Guid teamId, int holeNumber, int grossScore)
        => db.Scores.Add(new Score
        {
            Id          = Guid.NewGuid(),
            EventId     = eventId,
            TeamId      = teamId,
            HoleNumber  = (short)holeNumber,
            GrossScore  = (short)grossScore,
            DeviceId    = "dev-test",
            SubmittedAt = DateTime.UtcNow,
        });

    // ── No scores ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetLeaderboardAsync_returns_empty_when_no_scores()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db);
        AddTeam(db, eventId, "Eagles");
        await db.SaveChangesAsync();

        var board = await svc.GetLeaderboardAsync(orgId, eventId);

        // Team present but no scores → rank 0
        Assert.Single(board);
        Assert.Equal(0, board[0].Rank);
    }

    // ── Basic toPar calculation ───────────────────────────────────────────────

    [Fact]
    public async Task GetLeaderboardAsync_computes_to_par_correctly_with_default_par_4()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db, holes: 3);
        var team = AddTeam(db, eventId, "Eagles");

        // 3 holes, par 4 each = 12 par total; score 3+4+5=12 → E (even)
        AddScore(db, eventId, team.Id, 1, 3);
        AddScore(db, eventId, team.Id, 2, 4);
        AddScore(db, eventId, team.Id, 3, 5);
        await db.SaveChangesAsync();

        var board = await svc.GetLeaderboardAsync(orgId, eventId);

        Assert.Equal(0,  board[0].ToPar);     // 12 - 12 = 0
        Assert.Equal(12, board[0].GrossTotal);
        Assert.Equal(3,  board[0].HolesComplete);
    }

    [Fact]
    public async Task GetLeaderboardAsync_negative_to_par_for_under_par_round()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db, holes: 3);
        var team = AddTeam(db, eventId, "Birdies");

        AddScore(db, eventId, team.Id, 1, 3);  // -1
        AddScore(db, eventId, team.Id, 2, 3);  // -1
        AddScore(db, eventId, team.Id, 3, 3);  // -1
        await db.SaveChangesAsync();

        var board = await svc.GetLeaderboardAsync(orgId, eventId);

        Assert.Equal(-3, board[0].ToPar);
    }

    // ── Ranking with multiple teams ───────────────────────────────────────────

    [Fact]
    public async Task GetLeaderboardAsync_ranks_lower_to_par_first()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db, holes: 2);

        var t1 = AddTeam(db, eventId, "Eagles");   // will score -2
        var t2 = AddTeam(db, eventId, "Birdies");  // will score +1

        AddScore(db, eventId, t1.Id, 1, 3); AddScore(db, eventId, t1.Id, 2, 3); // -2
        AddScore(db, eventId, t2.Id, 1, 5); AddScore(db, eventId, t2.Id, 2, 4); // +1
        await db.SaveChangesAsync();

        var board = await svc.GetLeaderboardAsync(orgId, eventId);

        Assert.Equal("Eagles",  board[0].TeamName);
        Assert.Equal("Birdies", board[1].TeamName);
        Assert.Equal(1, board[0].Rank);
        Assert.Equal(2, board[1].Rank);
    }

    // ── Tie handling ──────────────────────────────────────────────────────────

    [Fact]
    public async Task GetLeaderboardAsync_tied_teams_share_the_same_rank()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db, holes: 2);

        var t1 = AddTeam(db, eventId, "Alpha");
        var t2 = AddTeam(db, eventId, "Beta");
        var t3 = AddTeam(db, eventId, "Gamma"); // clearly last

        // Alpha and Beta both shoot -2
        AddScore(db, eventId, t1.Id, 1, 3); AddScore(db, eventId, t1.Id, 2, 3);
        AddScore(db, eventId, t2.Id, 1, 3); AddScore(db, eventId, t2.Id, 2, 3);
        // Gamma shoots +2
        AddScore(db, eventId, t3.Id, 1, 5); AddScore(db, eventId, t3.Id, 2, 5);
        await db.SaveChangesAsync();

        var board = await svc.GetLeaderboardAsync(orgId, eventId);
        var rank1 = board.Where(e => e.ToPar == -2).ToList();
        var last  = board.Single(e => e.TeamName == "Gamma");

        Assert.Equal(2, rank1.Count);
        Assert.All(rank1, e => Assert.Equal(1, e.Rank)); // both rank 1
        Assert.Equal(3, last.Rank);                       // next rank after 2 ties = 3
    }

    // ── Teams with no scores go last ─────────────────────────────────────────

    [Fact]
    public async Task GetLeaderboardAsync_unscored_team_has_rank_zero_and_sorts_last()
    {
        var (svc, db) = Build();
        var (orgId, eventId) = await SeedEventAsync(db, holes: 2);

        var scored   = AddTeam(db, eventId, "Scored");
        var unscored = AddTeam(db, eventId, "Unscored");

        AddScore(db, eventId, scored.Id, 1, 5); AddScore(db, eventId, scored.Id, 2, 5);
        await db.SaveChangesAsync();

        var board = await svc.GetLeaderboardAsync(orgId, eventId);

        Assert.Equal("Scored",   board[0].TeamName);
        Assert.Equal("Unscored", board[1].TeamName);
        Assert.Equal(0, board[1].Rank);
    }
}
