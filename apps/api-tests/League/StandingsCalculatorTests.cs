using Xunit;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.League;
using WebAPI.Tests.Helpers;
using System.Text.Json;

namespace WebAPI.Tests.LeagueEngines;

/// <summary>
/// Unit tests for the season standings engine across all four league formats
/// (Stableford, Stroke, Quota, Match), plus best-N-of-M counting and ranking.
/// </summary>
public class StandingsCalculatorTests
{
    private sealed class Ctx
    {
        public ApplicationDbContext Db = null!;
        public Guid SeasonId;
        public StandingsCalculator Calc = null!;
    }

    private static Ctx Build(LeagueFormat format, short roundsCounted = 0)
    {
        var db       = InMemoryDbFactory.Create();
        var leagueId = Guid.NewGuid();
        var seasonId = Guid.NewGuid();

        db.Leagues.Add(new League { Id = leagueId, Name = "L", Format = format });
        db.Seasons.Add(new Season
        {
            Id = seasonId, LeagueId = leagueId, Name = "S1", RoundsCounted = roundsCounted,
        });
        db.SaveChanges();

        return new Ctx { Db = db, SeasonId = seasonId, Calc = new StandingsCalculator(db) };
    }

    private static Guid AddMember(Ctx c, double handicap = 0, Guid? flightId = null)
    {
        var id = Guid.NewGuid();
        c.Db.LeagueMembers.Add(new LeagueMember
        {
            Id = id, SeasonId = c.SeasonId, FirstName = "P", LastName = id.ToString()[..4],
            HandicapIndex = handicap, FlightId = flightId, Status = MemberStatus.Active,
        });
        c.Db.SaveChanges();
        return id;
    }

    private static Guid AddClosedRound(Ctx c)
    {
        var id = Guid.NewGuid();
        c.Db.LeagueRounds.Add(new LeagueRound
        {
            Id = id, SeasonId = c.SeasonId, Status = RoundStatus.Closed,
            RoundDate = DateOnly.FromDateTime(DateTime.UtcNow),
        });
        c.Db.SaveChanges();
        return id;
    }

    /// <summary>Adds a single aggregate score row for a member in a round.</summary>
    private static void AddRoundResult(Ctx c, Guid roundId, Guid memberId, short stableford, short net)
        => c.Db.LeagueScores.Add(new LeagueScore
        {
            Id = Guid.NewGuid(), RoundId = roundId, MemberId = memberId, HoleNumber = 1,
            GrossScore = net, NetScore = net, StablefordPoints = stableford,
        });

    // ── Stableford ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Stableford_sums_points_and_net_across_rounds()
    {
        var c = Build(LeagueFormat.Stableford);
        var member = AddMember(c);
        var r1 = AddClosedRound(c);
        var r2 = AddClosedRound(c);
        AddRoundResult(c, r1, member, stableford: 30, net: 70);
        AddRoundResult(c, r2, member, stableford: 36, net: 68);
        await c.Db.SaveChangesAsync();

        await c.Calc.RecalculateAsync(c.SeasonId, default);

        var s = c.Db.Standings.Single(x => x.MemberId == member);
        Assert.Equal(66, s.TotalPoints);   // 30 + 36
        Assert.Equal(138, s.NetStrokes);   // 70 + 68
        Assert.Equal((short)2, s.RoundsPlayed);
        Assert.Equal((short)1, s.Rank);
    }

    [Fact]
    public async Task Stableford_counts_only_best_N_rounds_when_roundsCounted_set()
    {
        var c = Build(LeagueFormat.Stableford, roundsCounted: 1);
        var member = AddMember(c);
        var r1 = AddClosedRound(c);
        var r2 = AddClosedRound(c);
        AddRoundResult(c, r1, member, stableford: 30, net: 70);
        AddRoundResult(c, r2, member, stableford: 36, net: 68);
        await c.Db.SaveChangesAsync();

        await c.Calc.RecalculateAsync(c.SeasonId, default);

        var s = c.Db.Standings.Single(x => x.MemberId == member);
        Assert.Equal(36, s.TotalPoints); // best 1 of 2
    }

    [Fact]
    public async Task Stableford_ranks_higher_points_first_within_flight()
    {
        var c = Build(LeagueFormat.Stableford);
        var leader  = AddMember(c);
        var trailer = AddMember(c);
        var r1 = AddClosedRound(c);
        AddRoundResult(c, r1, leader,  stableford: 40, net: 65);
        AddRoundResult(c, r1, trailer, stableford: 20, net: 80);
        await c.Db.SaveChangesAsync();

        await c.Calc.RecalculateAsync(c.SeasonId, default);

        Assert.Equal((short)1, c.Db.Standings.Single(x => x.MemberId == leader).Rank);
        Assert.Equal((short)2, c.Db.Standings.Single(x => x.MemberId == trailer).Rank);
    }

    // ── Stroke ──────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Stroke_ranks_lowest_net_first()
    {
        var c = Build(LeagueFormat.Stroke);
        var low  = AddMember(c);
        var high = AddMember(c);
        var r1 = AddClosedRound(c);
        AddRoundResult(c, r1, low,  stableford: 0, net: 68);
        AddRoundResult(c, r1, high, stableford: 0, net: 75);
        await c.Db.SaveChangesAsync();

        await c.Calc.RecalculateAsync(c.SeasonId, default);

        var sLow  = c.Db.Standings.Single(x => x.MemberId == low);
        var sHigh = c.Db.Standings.Single(x => x.MemberId == high);
        Assert.Equal(68, sLow.NetStrokes);
        Assert.Equal((short)1, sLow.Rank);
        Assert.Equal((short)2, sHigh.Rank);
    }

    [Fact]
    public async Task Stroke_counts_only_best_N_net_rounds()
    {
        var c = Build(LeagueFormat.Stroke, roundsCounted: 1);
        var member = AddMember(c);
        var r1 = AddClosedRound(c);
        var r2 = AddClosedRound(c);
        AddRoundResult(c, r1, member, stableford: 0, net: 80);
        AddRoundResult(c, r2, member, stableford: 0, net: 70);
        await c.Db.SaveChangesAsync();

        await c.Calc.RecalculateAsync(c.SeasonId, default);

        var s = c.Db.Standings.Single(x => x.MemberId == member);
        Assert.Equal(70, s.NetStrokes); // best (lowest) 1 of 2
    }

    // ── Quota ───────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Quota_scores_points_above_quota_target()
    {
        // courseHandicap = round(10) = 10 -> quotaTarget = 36 - 10 = 26.
        var c = Build(LeagueFormat.Quota);
        var member = AddMember(c, handicap: 10);
        var r1 = AddClosedRound(c);
        var r2 = AddClosedRound(c);
        AddRoundResult(c, r1, member, stableford: 30, net: 70); // 30 - 26 = +4
        AddRoundResult(c, r2, member, stableford: 20, net: 75); // 20 - 26 = -6
        await c.Db.SaveChangesAsync();

        await c.Calc.RecalculateAsync(c.SeasonId, default);

        var s = c.Db.Standings.Single(x => x.MemberId == member);
        Assert.Equal(-2, s.TotalPoints); // 4 + (-6)
    }

    // ── Match ───────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Match_records_wins_from_holes_won_head_to_head()
    {
        var c = Build(LeagueFormat.Match);
        var a = AddMember(c);
        var b = AddMember(c);
        var r1 = AddClosedRound(c);

        // Per-hole net scores: A wins holes 1 & 3, hole 2 halved -> A wins the match.
        void Hole(Guid m, short hole, short net) => c.Db.LeagueScores.Add(new LeagueScore
        {
            Id = Guid.NewGuid(), RoundId = r1, MemberId = m, HoleNumber = hole,
            GrossScore = net, NetScore = net, StablefordPoints = 0,
        });
        Hole(a, 1, 3); Hole(b, 1, 4);
        Hole(a, 2, 4); Hole(b, 2, 4);
        Hole(a, 3, 3); Hole(b, 3, 5);

        c.Db.LeaguePairings.Add(new LeaguePairing
        {
            Id = Guid.NewGuid(), RoundId = r1, GroupNumber = 1,
            MemberIdsJson = JsonSerializer.Serialize(new[] { a, b }),
        });
        await c.Db.SaveChangesAsync();

        await c.Calc.RecalculateAsync(c.SeasonId, default);

        var sa = c.Db.Standings.Single(x => x.MemberId == a);
        var sb = c.Db.Standings.Single(x => x.MemberId == b);
        Assert.Equal(1, sa.MatchWins);
        Assert.Equal(0, sa.MatchLosses);
        Assert.Equal(1, sb.MatchLosses);
        Assert.Equal(2, sa.TotalPoints); // wins*2 + halves
        Assert.Equal((short)1, sa.Rank);
    }

    [Fact]
    public async Task Match_halves_when_holes_won_are_equal()
    {
        var c = Build(LeagueFormat.Match);
        var a = AddMember(c);
        var b = AddMember(c);
        var r1 = AddClosedRound(c);

        void Hole(Guid m, short hole, short net) => c.Db.LeagueScores.Add(new LeagueScore
        {
            Id = Guid.NewGuid(), RoundId = r1, MemberId = m, HoleNumber = hole,
            GrossScore = net, NetScore = net,
        });
        // Each wins one hole -> halved match.
        Hole(a, 1, 3); Hole(b, 1, 4);
        Hole(a, 2, 5); Hole(b, 2, 4);
        c.Db.LeaguePairings.Add(new LeaguePairing
        {
            Id = Guid.NewGuid(), RoundId = r1, GroupNumber = 1,
            MemberIdsJson = JsonSerializer.Serialize(new[] { a, b }),
        });
        await c.Db.SaveChangesAsync();

        await c.Calc.RecalculateAsync(c.SeasonId, default);

        var sa = c.Db.Standings.Single(x => x.MemberId == a);
        Assert.Equal(1, sa.MatchHalves);
        Assert.Equal(0, sa.MatchWins);
        Assert.Equal(1, sa.TotalPoints); // halves count 1
    }

    // ── Ranking scope ───────────────────────────────────────────────────────────

    [Fact]
    public async Task Ranks_reset_per_flight()
    {
        var c = Build(LeagueFormat.Stableford);
        var flightA = Guid.NewGuid();
        var flightB = Guid.NewGuid();
        c.Db.Flights.Add(new Flight { Id = flightA, SeasonId = c.SeasonId, Name = "A" });
        c.Db.Flights.Add(new Flight { Id = flightB, SeasonId = c.SeasonId, Name = "B" });
        c.Db.SaveChanges();

        var a1 = AddMember(c, flightId: flightA);
        var a2 = AddMember(c, flightId: flightA);
        var b1 = AddMember(c, flightId: flightB);
        var r1 = AddClosedRound(c);
        AddRoundResult(c, r1, a1, 40, 65);
        AddRoundResult(c, r1, a2, 30, 70);
        AddRoundResult(c, r1, b1, 10, 90);
        await c.Db.SaveChangesAsync();

        await c.Calc.RecalculateAsync(c.SeasonId, default);

        Assert.Equal((short)1, c.Db.Standings.Single(x => x.MemberId == a1).Rank);
        Assert.Equal((short)2, c.Db.Standings.Single(x => x.MemberId == a2).Rank);
        Assert.Equal((short)1, c.Db.Standings.Single(x => x.MemberId == b1).Rank); // leader of its own flight
    }

    [Fact]
    public async Task Recalculating_upserts_rather_than_duplicating_standings()
    {
        var c = Build(LeagueFormat.Stableford);
        var member = AddMember(c);
        var r1 = AddClosedRound(c);
        AddRoundResult(c, r1, member, 30, 70);
        await c.Db.SaveChangesAsync();

        await c.Calc.RecalculateAsync(c.SeasonId, default);
        await c.Calc.RecalculateAsync(c.SeasonId, default);

        Assert.Equal(1, c.Db.Standings.Count(x => x.MemberId == member));
    }
}
