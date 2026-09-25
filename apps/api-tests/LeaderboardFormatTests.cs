using Xunit;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Events.Leaderboard;
using static GolfFundraiserPro.Api.Features.Events.Leaderboard.LeaderboardCalculator;

namespace WebAPI.Tests;

/// <summary>
/// U8: the leaderboard scores each format the way the organizer picked it —
/// Stableford per golfer, Stroke Play per golfer, one par per ball on an
/// aggregate row. Pure calculator tests; the DB path is LeaderboardIntegrationTests.
/// </summary>
public class LeaderboardFormatTests
{
    private static readonly Guid TeamA = Guid.NewGuid(), TeamB = Guid.NewGuid();
    private static readonly Guid Ann = Guid.NewGuid(), Bo = Guid.NewGuid(), Cal = Guid.NewGuid(), Dee = Guid.NewGuid();

    private static readonly TeamRow[] Teams =
    [
        new(TeamA, "Aces",   null, null),
        new(TeamB, "Birdies", null, null),
    ];

    private static readonly ParRow[] ParFours = Enumerable.Range(1, 2).Select(h => new ParRow((short)h, 4)).ToArray();

    private static ScoreRow Row(Guid team, int hole, int gross, Dictionary<Guid, int>? shots = null)
        => new(team, (short)hole, (short)gross, shots);

    [Fact]
    public void Stableford_awards_points_per_golfer_not_per_summed_row()
    {
        // Par 4. Aces: 4/5 → 2 + 1 = 3 pts. Birdies: 3/7 → 3 + 0 on hole 1, then
        // 4/4 → 2 + 2 on hole 2 = 7 pts. Summing strokes first would score 0.
        var scores = new[]
        {
            Row(TeamA, 1, 9,  new() { [Ann] = 4, [Bo] = 5 }),
            Row(TeamB, 1, 10, new() { [Cal] = 3, [Dee] = 7 }),
            Row(TeamB, 2, 8,  new() { [Cal] = 4, [Dee] = 4 }),
        };

        var board = Compute(Teams, scores, ParFours, 2, EventFormat.Stableford);

        Assert.Equal("Birdies", board[0].TeamName);
        Assert.Equal(7, board[0].StablefordPoints);
        Assert.Equal(3, board[1].StablefordPoints);
        Assert.Equal(4, board[1].StrokesBack);   // points behind
    }

    [Fact]
    public void Aggregate_rows_measure_against_one_par_per_golfer()
    {
        // Two golfers both making par 4 → aggregate 8 against par 8 = even,
        // not +4.
        var scores = new[] { Row(TeamA, 1, 8, new() { [Ann] = 4, [Bo] = 4 }) };

        var board = Compute(Teams, scores, ParFours, 2, EventFormat.Stroke);

        Assert.Equal(0, board.Single(e => e.TeamId == TeamA).ToPar);
    }

    [Fact]
    public void Best_ball_row_is_one_ball_against_one_par()
    {
        // The stored gross is already the lowest ball (FormatScoring on write).
        var scores = new[] { Row(TeamA, 1, 3, new() { [Ann] = 3, [Bo] = 6 }) };

        var board = Compute(Teams, scores, ParFours, 2, EventFormat.BestBall);

        Assert.Equal(-1, board.Single(e => e.TeamId == TeamA).ToPar);
    }

    [Fact]
    public void Stroke_play_ranks_golfers_individually()
    {
        var players = new PlayerRow[]
        {
            new(Ann, "Ann A", TeamA, "Aces"),
            new(Bo,  "Bo B",  TeamA, "Aces"),
            new(Cal, "Cal C", TeamB, "Birdies"),
            new(Dee, "Dee D", TeamB, "Birdies"),   // never scored
        };
        var scores = new[]
        {
            Row(TeamA, 1, 9, new() { [Ann] = 4, [Bo] = 5 }),
            Row(TeamA, 2, 8, new() { [Ann] = 3, [Bo] = 5 }),
            Row(TeamB, 1, 4, new() { [Cal] = 4 }),
        };

        var golfers = ComputeIndividuals(players, scores, ParFours, 2);

        Assert.Equal(["Ann A", "Cal C", "Bo B", "Dee D"], golfers.Select(g => g.PlayerName));
        var ann = golfers[0];
        Assert.Equal(1,  ann.Rank);
        Assert.Equal(-1, ann.ToPar);        // 7 on two par 4s
        Assert.Equal(7,  ann.GrossTotal);
        Assert.True(ann.IsComplete);
        Assert.Equal(1, golfers[1].StrokesBack);           // Cal: E thru 1
        Assert.Equal(0, golfers.Single(g => g.PlayerName == "Dee D").Rank);  // unscored last, rank 0
    }

    [Fact]
    public void Stroke_play_ties_share_a_rank()
    {
        var players = new PlayerRow[] { new(Ann, "Ann", TeamA, "Aces"), new(Bo, "Bo", TeamA, "Aces") };
        var scores  = new[] { Row(TeamA, 1, 8, new() { [Ann] = 4, [Bo] = 4 }) };

        var golfers = ComputeIndividuals(players, scores, ParFours, 2);

        Assert.All(golfers, g => Assert.Equal(1, g.Rank));
    }

    [Fact]
    public void A_typed_team_gross_counts_for_no_golfer()
    {
        // No breakdown → no way to know whose strokes it holds.
        var players = new PlayerRow[] { new(Ann, "Ann", TeamA, "Aces") };
        var scores  = new[] { Row(TeamA, 1, 5) };

        var golfers = ComputeIndividuals(players, scores, ParFours, 2);

        Assert.Equal(0, golfers.Single().HolesComplete);
    }
}
