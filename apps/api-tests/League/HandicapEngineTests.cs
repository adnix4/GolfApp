using Xunit;
using Microsoft.Extensions.Logging.Abstractions;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.League;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.LeagueEngines;

/// <summary>
/// Unit tests for the handicap engine.
///
/// The recalculation algorithm is tested directly through its pure, extracted
/// math (ComputeDifferential / ComputeIndex / ParseFormula) — the differential
/// query uses a GroupBy projection the EF Core InMemory provider can't translate,
/// so the algorithm itself is verified without the database. Sandbagger detection
/// and the season guard are exercised as integration tests against InMemory.
/// </summary>
public class HandicapEngineTests
{
    // ── Differential math: Club par-relative vs USGA rating/slope ─────────────────

    [Fact]
    public void Club_differential_is_gross_minus_par()
        => Assert.Equal(8.0, HandicapEngine.ComputeDifferential(
            grossTotal: 80, coursePar: 72, courseRating: null, slopeRating: null, isUsga: false));

    [Fact]
    public void Usga_differential_uses_rating_and_slope()
        // (90 - 72) * 113 / 113 = 18
        => Assert.Equal(18.0, HandicapEngine.ComputeDifferential(
            grossTotal: 90, coursePar: 72, courseRating: 72.0, slopeRating: 113, isUsga: true));

    [Fact]
    public void Usga_differential_scales_by_slope()
        // (90 - 70) * 113 / 130 ≈ 17.38
        => Assert.Equal((90 - 70) * 113.0 / 130, HandicapEngine.ComputeDifferential(
            grossTotal: 90, coursePar: 72, courseRating: 70.0, slopeRating: 130, isUsga: true));

    [Fact]
    public void Usga_differential_falls_back_to_par_when_rating_missing()
        => Assert.Equal(8.0, HandicapEngine.ComputeDifferential(
            grossTotal: 80, coursePar: 72, courseRating: null, slopeRating: 113, isUsga: true));

    [Fact]
    public void Usga_differential_falls_back_to_par_when_slope_is_zero()
        => Assert.Equal(8.0, HandicapEngine.ComputeDifferential(
            grossTotal: 80, coursePar: 72, courseRating: 72.0, slopeRating: 0, isUsga: true));

    // ── Index selection (most-recent-first differentials) ─────────────────────────

    [Fact]
    public void Index_best_n_of_m_averages_the_lowest_n()
    {
        var formula = new HandicapEngine.HandicapFormula("BestNofM", N: 2, M: 3, Pct: 0.85);
        // lowest 2 of {18,10,8} = (8+10)/2 = 9.0
        Assert.Equal(9.0, HandicapEngine.ComputeIndex(new() { 18, 10, 8 }, formula, cap: 36, isUsga: false));
    }

    [Fact]
    public void Index_best_n_of_m_only_considers_the_m_most_recent()
    {
        var formula = new HandicapEngine.HandicapFormula("BestNofM", N: 1, M: 2, Pct: 0.85);
        // m=2 most recent = {20,30}; best 1 = 20. The older 5 is out of the window.
        Assert.Equal(20.0, HandicapEngine.ComputeIndex(new() { 20, 30, 5 }, formula, cap: 36, isUsga: false));
    }

    [Fact]
    public void Index_rolling_averages_the_n_most_recent()
    {
        var formula = new HandicapEngine.HandicapFormula("Rolling", N: 3, M: 0, Pct: 0);
        // first 3 = {10,20,30} avg = 20
        Assert.Equal(20.0, HandicapEngine.ComputeIndex(new() { 10, 20, 30, 40 }, formula, cap: 36, isUsga: false));
    }

    [Fact]
    public void Index_percent_scales_the_average()
    {
        var formula = new HandicapEngine.HandicapFormula("Percent", N: 2, M: 0, Pct: 0.9);
        // avg(10,20)=15 * 0.9 = 13.5
        Assert.Equal(13.5, HandicapEngine.ComputeIndex(new() { 10, 20 }, formula, cap: 36, isUsga: false));
    }

    [Fact]
    public void Index_unknown_formula_type_falls_back_to_best_5_of_10()
    {
        var formula = new HandicapEngine.HandicapFormula("Bogus", N: 99, M: 99, Pct: 99);
        Assert.Equal(5.0, HandicapEngine.ComputeIndex(new() { 4, 6 }, formula, cap: 36, isUsga: false));
    }

    [Fact]
    public void Index_is_capped()
    {
        var formula = new HandicapEngine.HandicapFormula("BestNofM", N: 5, M: 10, Pct: 0.85);
        Assert.Equal(36.0, HandicapEngine.ComputeIndex(new() { 58 }, formula, cap: 36, isUsga: false));
    }

    [Fact]
    public void Index_is_rounded_to_one_decimal()
    {
        var formula = new HandicapEngine.HandicapFormula("BestNofM", N: 3, M: 3, Pct: 0.85);
        // avg(9,10,10) = 9.666... -> 9.7
        Assert.Equal(9.7, HandicapEngine.ComputeIndex(new() { 9, 10, 10 }, formula, cap: 36, isUsga: false));
    }

    [Fact]
    public void Index_usga_uses_best_8_of_20_ignoring_the_club_formula()
    {
        // A Rolling-n1 formula would yield 10; USGA must override it to best-8-of-20 = avg(all 3) = 20.
        var formula = new HandicapEngine.HandicapFormula("Rolling", N: 1, M: 1, Pct: 0);
        Assert.Equal(20.0, HandicapEngine.ComputeIndex(new() { 10, 20, 30 }, formula, cap: 36, isUsga: true));
    }

    [Fact]
    public void Index_with_no_differentials_is_zero()
    {
        var formula = new HandicapEngine.HandicapFormula("BestNofM", N: 5, M: 10, Pct: 0.85);
        Assert.Equal(0.0, HandicapEngine.ComputeIndex(new(), formula, cap: 36, isUsga: false));
    }

    // ── Formula parsing ───────────────────────────────────────────────────────────

    [Fact]
    public void ParseFormula_reads_all_fields()
    {
        var f = HandicapEngine.ParseFormula("{\"type\":\"Rolling\",\"n\":4,\"m\":8,\"pct\":0.5}");
        Assert.Equal("Rolling", f.Type);
        Assert.Equal(4, f.N);
        Assert.Equal(8, f.M);
        Assert.Equal(0.5, f.Pct);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("not json")]
    [InlineData("")]
    public void ParseFormula_uses_defaults_for_empty_or_invalid_json(string json)
    {
        var f = HandicapEngine.ParseFormula(json);
        Assert.Equal("BestNofM", f.Type);
        Assert.Equal(5, f.N);
        Assert.Equal(10, f.M);
        Assert.Equal(0.85, f.Pct);
    }

    [Fact]
    public void ParseFormula_fills_missing_fields_with_defaults()
    {
        var f = HandicapEngine.ParseFormula("{\"type\":\"Percent\"}");
        Assert.Equal("Percent", f.Type);
        Assert.Equal(5, f.N);     // default
        Assert.Equal(0.85, f.Pct); // default
    }

    // ── Integration: season guard + sandbagger detection (InMemory) ───────────────

    private sealed class Ctx
    {
        public ApplicationDbContext Db = null!;
        public Guid SeasonId;
        public HandicapEngine Engine = null!;
    }

    private static Ctx Build()
    {
        var db       = InMemoryDbFactory.Create();
        var leagueId = Guid.NewGuid();
        var seasonId = Guid.NewGuid();

        db.Leagues.Add(new League { Id = leagueId, Name = "L" });
        db.Seasons.Add(new Season { Id = seasonId, LeagueId = leagueId, Name = "S1" });
        db.SaveChanges();

        return new Ctx
        {
            Db = db, SeasonId = seasonId,
            Engine = new HandicapEngine(db, NullLogger<HandicapEngine>.Instance),
        };
    }

    private static Guid AddMember(Ctx c)
    {
        var id = Guid.NewGuid();
        c.Db.LeagueMembers.Add(new LeagueMember
        {
            Id = id, SeasonId = c.SeasonId, FirstName = "P", LastName = "Q",
            Email = $"{id:N}@x.com", Status = MemberStatus.Active,
        });
        c.Db.SaveChanges();
        return id;
    }

    /// <summary>Seeds a closed round with one net score for a specific member.</summary>
    private static void SeedNet(Ctx c, Guid memberId, short net, int daysAgo)
    {
        var roundId = Guid.NewGuid();
        c.Db.LeagueRounds.Add(new LeagueRound
        {
            Id = roundId, SeasonId = c.SeasonId, Status = RoundStatus.Closed,
            RoundDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-daysAgo)),
        });
        c.Db.LeagueScores.Add(new LeagueScore
        {
            Id = Guid.NewGuid(), RoundId = roundId, MemberId = memberId,
            HoleNumber = 1, GrossScore = net, NetScore = net,
        });
    }

    [Fact]
    public async Task Missing_season_throws()
    {
        var c = Build();
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => c.Engine.RecalculateAsync(Guid.NewGuid(), Guid.NewGuid(), default));
    }

    [Fact]
    public async Task DetectSandbaggers_flags_members_consistently_beating_par_by_3plus()
    {
        var c = Build();
        var sandbagger = AddMember(c);
        var honest     = AddMember(c);

        // No course -> par 72. Sandbagger nets 67 (-5) across 5 rounds; honest nets 72 (par).
        for (int i = 1; i <= 5; i++)
        {
            SeedNet(c, sandbagger, net: 67, daysAgo: i); // -5 vs par 72
            SeedNet(c, honest,     net: 72, daysAgo: i); // even par
        }
        await c.Db.SaveChangesAsync();

        var flagged = await c.Engine.DetectSandbaggersAsync(c.SeasonId, default);

        Assert.Contains(sandbagger, flagged);
        Assert.DoesNotContain(honest, flagged);
    }

    [Fact]
    public async Task DetectSandbaggers_ignores_members_with_fewer_than_5_rounds()
    {
        var c = Build();
        var member = AddMember(c);
        for (int i = 1; i <= 4; i++) SeedNet(c, member, net: 60, daysAgo: i); // way under par but only 4 rounds
        await c.Db.SaveChangesAsync();

        var flagged = await c.Engine.DetectSandbaggersAsync(c.SeasonId, default);

        Assert.DoesNotContain(member, flagged);
    }
}
