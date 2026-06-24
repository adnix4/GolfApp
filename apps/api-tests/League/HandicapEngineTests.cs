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

    // ── Integration: full RecalculateAsync + sandbagger + season guard (InMemory) ──
    // The batching refactor (single flat-projection load instead of a per-member
    // GroupBy-with-navigation query) made RecalculateAsync translatable on the EF
    // InMemory provider, so the end-to-end DB path is now covered here too.

    private sealed class Ctx
    {
        public ApplicationDbContext Db = null!;
        public Guid SeasonId;
        public HandicapEngine Engine = null!;
        public Guid? CourseId;
    }

    private static Ctx Build(
        HandicapSystem system = HandicapSystem.Club,
        string? formulaJson = null,
        double cap = 36.0,
        bool syncToPlayer = false)
    {
        var db       = InMemoryDbFactory.Create();
        var leagueId = Guid.NewGuid();
        var seasonId = Guid.NewGuid();

        var league = new League { Id = leagueId, Name = "L", HandicapSystem = system, HandicapCap = cap };
        if (formulaJson is not null) league.HandicapFormulaJson = formulaJson;
        db.Leagues.Add(league);
        db.Seasons.Add(new Season { Id = seasonId, LeagueId = leagueId, Name = "S1", SyncHandicapToPlayer = syncToPlayer });
        db.SaveChanges();

        return new Ctx
        {
            Db = db, SeasonId = seasonId,
            Engine = new HandicapEngine(db, NullLogger<HandicapEngine>.Instance),
        };
    }

    private static Guid AddMember(Ctx c, double handicap = 0, Guid? playerId = null)
    {
        var id = Guid.NewGuid();
        c.Db.LeagueMembers.Add(new LeagueMember
        {
            Id = id, SeasonId = c.SeasonId, FirstName = "P", LastName = "Q",
            Email = $"{id:N}@x.com", HandicapIndex = handicap, PlayerId = playerId,
            Status = MemberStatus.Active,
        });
        c.Db.SaveChanges();
        return id;
    }

    private static Guid AddCourse(Ctx c, double rating, int slope)
    {
        var courseId = Guid.NewGuid();
        var course = new Course { Id = courseId, OrgId = Guid.NewGuid(), Name = "C", CourseRating = rating, SlopeRating = slope };
        for (short h = 1; h <= 18; h++)
            course.Holes.Add(new CourseHole { Id = Guid.NewGuid(), CourseId = courseId, HoleNumber = h, Par = 4 });
        c.Db.Courses.Add(course);
        c.Db.SaveChanges();
        c.CourseId = courseId;
        return courseId;
    }

    /// <summary>
    /// Seeds a closed round with one aggregate score for a member. gross == net, so
    /// the same value drives both the par-relative differential (gross) and the
    /// sandbagger check (net). Optionally attaches a course (for USGA differentials).
    /// </summary>
    private static void SeedNet(Ctx c, Guid memberId, short net, int daysAgo, Guid? courseId = null)
    {
        var roundId = Guid.NewGuid();
        c.Db.LeagueRounds.Add(new LeagueRound
        {
            Id = roundId, SeasonId = c.SeasonId, Status = RoundStatus.Closed, CourseId = courseId,
            RoundDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-daysAgo)),
        });
        c.Db.LeagueScores.Add(new LeagueScore
        {
            Id = Guid.NewGuid(), RoundId = roundId, MemberId = memberId,
            HoleNumber = 1, GrossScore = net, NetScore = net,
        });
    }

    // ── RecalculateAsync end-to-end ───────────────────────────────────────────────

    [Fact]
    public async Task Recalculate_updates_every_member_in_one_batched_pass()
    {
        var c = Build(); // default Club best-5-of-10, no course -> par 72
        var m1 = AddMember(c);
        var m2 = AddMember(c);
        // m1 diffs 8,10,18 -> avg 12.0 ; m2 diffs 28,28,28 -> 28.0
        SeedNet(c, m1, 80, 3); SeedNet(c, m1, 82, 2); SeedNet(c, m1, 90, 1);
        SeedNet(c, m2, 100, 3); SeedNet(c, m2, 100, 2); SeedNet(c, m2, 100, 1);
        await c.Db.SaveChangesAsync();

        var notices = await c.Engine.RecalculateAsync(c.SeasonId, Guid.NewGuid(), default);

        Assert.Equal(2, notices.Count);
        Assert.Equal(12.0, c.Db.LeagueMembers.Single(m => m.Id == m1).HandicapIndex);
        Assert.Equal(28.0, c.Db.LeagueMembers.Single(m => m.Id == m2).HandicapIndex);
        Assert.Equal(2, c.Db.HandicapHistories.Count());
    }

    [Fact]
    public async Task Recalculate_caps_the_new_index()
    {
        var c = Build(cap: 20.0);
        var m = AddMember(c);
        SeedNet(c, m, 130, 1); // diff 58 -> capped to 20.0
        await c.Db.SaveChangesAsync();

        await c.Engine.RecalculateAsync(c.SeasonId, Guid.NewGuid(), default);

        Assert.Equal(20.0, c.Db.LeagueMembers.Single(x => x.Id == m).HandicapIndex);
    }

    [Fact]
    public async Task Recalculate_uses_usga_rating_and_slope_when_course_is_rated()
    {
        var c = Build(system: HandicapSystem.USGA);
        var courseId = AddCourse(c, rating: 72.0, slope: 113);
        var m = AddMember(c);
        SeedNet(c, m, 90, 1, courseId); // diff = (90-72)*113/113 = 18 -> 18.0
        await c.Db.SaveChangesAsync();

        await c.Engine.RecalculateAsync(c.SeasonId, Guid.NewGuid(), default);

        Assert.Equal(18.0, c.Db.LeagueMembers.Single(x => x.Id == m).HandicapIndex);
    }

    [Fact]
    public async Task Recalculate_skips_members_with_no_meaningful_change()
    {
        var c = Build();
        var m = AddMember(c, handicap: 12.0); // already 12.0
        SeedNet(c, m, 80, 3); SeedNet(c, m, 82, 2); SeedNet(c, m, 90, 1); // recomputes to 12.0
        await c.Db.SaveChangesAsync();

        var notices = await c.Engine.RecalculateAsync(c.SeasonId, Guid.NewGuid(), default);

        Assert.Empty(notices);
        Assert.Empty(c.Db.HandicapHistories);
    }

    [Fact]
    public async Task Recalculate_skips_members_with_no_closed_rounds()
    {
        var c = Build();
        var m = AddMember(c, handicap: 9.0);

        var notices = await c.Engine.RecalculateAsync(c.SeasonId, Guid.NewGuid(), default);

        Assert.Empty(notices);
        Assert.Equal(9.0, c.Db.LeagueMembers.Single(x => x.Id == m).HandicapIndex); // untouched
    }

    [Fact]
    public async Task Recalculate_syncs_to_linked_player_when_season_opts_in()
    {
        var c = Build(syncToPlayer: true);
        var playerId = Guid.NewGuid();
        c.Db.Players.Add(new Player { Id = playerId, EventId = Guid.NewGuid(), FirstName = "P", LastName = "Q", Email = "p@x.com", HandicapIndex = 0 });
        c.Db.SaveChanges();
        var m = AddMember(c, playerId: playerId);
        SeedNet(c, m, 80, 3); SeedNet(c, m, 82, 2); SeedNet(c, m, 90, 1); // -> 12.0
        await c.Db.SaveChangesAsync();

        await c.Engine.RecalculateAsync(c.SeasonId, Guid.NewGuid(), default);

        Assert.Equal(12.0, c.Db.Players.Single(p => p.Id == playerId).HandicapIndex);
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
