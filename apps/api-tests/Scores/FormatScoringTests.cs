using Xunit;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Scores;

namespace WebAPI.Tests.Scores;

/// <summary>
/// U8: how a hole is scored under each format. Same case table as
/// packages/shared-types/src/__tests__/formatScoring.test.ts — the C# and TS
/// copies must agree (the clients preview with one, the server stores with
/// the other).
/// </summary>
public class FormatScoringTests
{
    private static readonly Guid A = Guid.NewGuid(), B = Guid.NewGuid(), C = Guid.NewGuid(), D = Guid.NewGuid();

    /// <summary>4 / 5 / 5 / 6 — a foursome on a par 4.</summary>
    private static IReadOnlyDictionary<Guid, int> Foursome => new Dictionary<Guid, int>
    {
        [A] = 4, [B] = 5, [C] = 5, [D] = 6,
    };

    private static readonly IReadOnlyDictionary<Guid, int> None = new Dictionary<Guid, int>();

    // ── TeamHoleGross ─────────────────────────────────────────────────────────

    [Theory]
    [InlineData(EventFormat.Scramble,   20)]
    [InlineData(EventFormat.BestBall,    4)]   // Rule 23: lowest ball counts
    [InlineData(EventFormat.Stroke,     20)]   // aggregate on the team row
    [InlineData(EventFormat.Stableford, 20)]   // aggregate on the team row
    public void Team_gross_follows_the_format(EventFormat format, int expected)
        => Assert.Equal(expected, FormatScoring.TeamHoleGross(format, Foursome, fallbackGross: 99));

    [Fact]
    public void Typed_gross_stands_when_there_is_no_breakdown()
        => Assert.Equal(5, FormatScoring.TeamHoleGross(EventFormat.BestBall, None, fallbackGross: 5));

    // ── ParseShots ────────────────────────────────────────────────────────────

    [Fact]
    public void ParseShots_reads_the_player_shots_blob()
    {
        var shots = FormatScoring.ParseShots($$"""{"{{A}}":4,"{{B}}":6}""");
        Assert.Equal(4, shots[A]);
        Assert.Equal(6, shots[B]);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not json")]
    [InlineData("[1,2,3]")]
    [InlineData("""{"not-a-guid":4}""")]
    public void ParseShots_treats_unreadable_input_as_no_breakdown(string? json)
        => Assert.Empty(FormatScoring.ParseShots(json));

    [Fact]
    public void ParseShots_drops_golfers_at_zero()
    {
        // 0 is "not entered yet" — counting it would make it Best Ball's lowest.
        var shots = FormatScoring.ParseShots($$"""{"{{A}}":0,"{{B}}":5}""");
        Assert.False(shots.ContainsKey(A));
        Assert.Equal(5, FormatScoring.TeamHoleGross(EventFormat.BestBall, shots, 0));
    }

    // ── Stableford (Rule 21.1) ────────────────────────────────────────────────

    [Theory]
    [InlineData(2, 5)]  // albatross on a par 5
    [InlineData(3, 4)]  // eagle
    [InlineData(4, 3)]  // birdie
    [InlineData(5, 2)]  // par
    [InlineData(6, 1)]  // bogey
    [InlineData(7, 0)]  // double bogey
    [InlineData(9, 0)]  // worse — never negative
    public void Stableford_points_match_the_rule(int strokes, int points)
        => Assert.Equal(points, FormatScoring.StablefordPoints(par: 5, strokes));

    [Fact]
    public void Team_Stableford_scores_each_golfer_then_sums()
    {
        // 2 + 1 + 1 + 0 on a par 4. Points off the summed 20 strokes would be 0 —
        // the bug U8 found.
        Assert.Equal(4, FormatScoring.TeamStablefordPoints(Foursome, par: 4, teamGross: 20));
    }

    [Fact]
    public void Team_Stableford_without_a_breakdown_scores_the_typed_gross_as_one_ball()
        => Assert.Equal(3, FormatScoring.TeamStablefordPoints(None, par: 4, teamGross: 3));

    // ── Par per row ───────────────────────────────────────────────────────────

    [Theory]
    [InlineData(EventFormat.Scramble,    4)]
    [InlineData(EventFormat.BestBall,    4)]
    [InlineData(EventFormat.Stroke,     16)]
    [InlineData(EventFormat.Stableford, 16)]
    public void Team_row_par_is_one_par_per_ball_it_holds(EventFormat format, int expected)
        => Assert.Equal(expected, FormatScoring.TeamHolePar(format, Foursome, par: 4));

    // ── Hole-in-one ───────────────────────────────────────────────────────────

    [Fact]
    public void Scramble_ace_is_the_team_row_at_one()
    {
        Assert.NotNull(FormatScoring.FindHoleInOne(EventFormat.Scramble, None, gross: 1));
        // A golfer's "1" in a scramble is one used shot, not an ace.
        var used = new Dictionary<Guid, int> { [A] = 1, [B] = 2 };
        Assert.Null(FormatScoring.FindHoleInOne(EventFormat.Scramble, used, gross: 3));
    }

    [Theory]
    [InlineData(EventFormat.BestBall)]
    [InlineData(EventFormat.Stroke)]
    [InlineData(EventFormat.Stableford)]
    public void Own_ball_ace_is_any_golfer_at_one(EventFormat format)
    {
        var shots = new Dictionary<Guid, int> { [A] = 1, [B] = 4, [C] = 5 };
        // The aggregate row (10) never reads 1 — the golfer does.
        var ace = FormatScoring.FindHoleInOne(format, shots, gross: 10);
        Assert.NotNull(ace);
        Assert.Equal([A], ace!.PlayerIds);
    }

    [Fact]
    public void No_ace_when_nobody_is_at_one()
        => Assert.Null(FormatScoring.FindHoleInOne(EventFormat.Stroke, Foursome, gross: 20));
}
