using Xunit;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Features.League;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.LeagueEngines;

/// <summary>
/// Unit tests for the skins engine: lowest net per hole wins; ties carry the pot
/// to the next hole; carried pots accumulate; re-running is idempotent.
/// Uses an in-memory EF Core database (same pattern as ScoreServiceIntegrationTests).
/// </summary>
public class SkinsCalculatorTests
{
    private static (SkinsCalculator calc, ApplicationDbContext db, Guid roundId, Guid[] members) Build(int playerCount)
    {
        var db      = InMemoryDbFactory.Create();
        var leagueId = Guid.NewGuid();
        var seasonId = Guid.NewGuid();
        var roundId  = Guid.NewGuid();

        db.Seasons.Add(new Season { Id = seasonId, LeagueId = leagueId, Name = "S1" });
        db.LeagueRounds.Add(new LeagueRound { Id = roundId, SeasonId = seasonId });

        var members = new Guid[playerCount];
        for (int i = 0; i < playerCount; i++) members[i] = Guid.NewGuid();

        db.SaveChanges();
        return (new SkinsCalculator(db), db, roundId, members);
    }

    private static void AddScore(ApplicationDbContext db, Guid roundId, Guid memberId, short hole, short net)
        => db.LeagueScores.Add(new LeagueScore
        {
            Id = Guid.NewGuid(), RoundId = roundId, MemberId = memberId,
            HoleNumber = hole, GrossScore = net, NetScore = net,
        });

    [Fact]
    public async Task Clean_win_each_hole_awards_a_skin_to_the_lowest_net()
    {
        var (calc, db, roundId, m) = Build(2);
        // Hole 1: m0 4 vs m1 5 -> m0 wins. Hole 2: m0 5 vs m1 4 -> m1 wins.
        AddScore(db, roundId, m[0], 1, 4); AddScore(db, roundId, m[1], 1, 5);
        AddScore(db, roundId, m[0], 2, 5); AddScore(db, roundId, m[1], 2, 4);
        await db.SaveChangesAsync();

        await calc.CalculateAsync(roundId, potCentsPerHolePerPlayer: 100, default);

        var skins = db.Skins.Where(s => s.RoundId == roundId).OrderBy(s => s.HoleNumber).ToList();
        Assert.Equal(2, skins.Count);

        int basePot = 100 * 2; // pot per hole per player * playerCount
        Assert.Equal(m[0], skins[0].WinnerMemberId);
        Assert.Equal(basePot, skins[0].PotCents);
        Assert.Null(skins[0].CarriedOverFromHole);

        Assert.Equal(m[1], skins[1].WinnerMemberId);
        Assert.Equal(basePot, skins[1].PotCents);
    }

    [Fact]
    public async Task Tie_carries_the_pot_to_the_next_hole()
    {
        var (calc, db, roundId, m) = Build(2);
        // Hole 1: tie at 4 -> carries. Hole 2: m0 wins -> takes base + carry.
        AddScore(db, roundId, m[0], 1, 4); AddScore(db, roundId, m[1], 1, 4);
        AddScore(db, roundId, m[0], 2, 3); AddScore(db, roundId, m[1], 2, 5);
        await db.SaveChangesAsync();

        await calc.CalculateAsync(roundId, potCentsPerHolePerPlayer: 100, default);

        var skins = db.Skins.Where(s => s.RoundId == roundId).OrderBy(s => s.HoleNumber).ToList();
        int basePot = 100 * 2;

        // Hole 1 tied — no winner, pot carries.
        Assert.Null(skins[0].WinnerMemberId);
        Assert.Equal(basePot, skins[0].PotCents);

        // Hole 2 — winner takes its base pot PLUS the carried pot from hole 1.
        Assert.Equal(m[0], skins[1].WinnerMemberId);
        Assert.Equal(basePot * 2, skins[1].PotCents);
        Assert.Equal((short)1, skins[1].CarriedOverFromHole);
    }

    [Fact]
    public async Task Consecutive_ties_accumulate_the_carried_pot()
    {
        var (calc, db, roundId, m) = Build(2);
        // Holes 1 & 2 tie; hole 3 won -> takes three holes' worth of pot.
        AddScore(db, roundId, m[0], 1, 4); AddScore(db, roundId, m[1], 1, 4);
        AddScore(db, roundId, m[0], 2, 5); AddScore(db, roundId, m[1], 2, 5);
        AddScore(db, roundId, m[0], 3, 3); AddScore(db, roundId, m[1], 3, 6);
        await db.SaveChangesAsync();

        await calc.CalculateAsync(roundId, potCentsPerHolePerPlayer: 100, default);

        var skins = db.Skins.Where(s => s.RoundId == roundId).OrderBy(s => s.HoleNumber).ToList();
        int basePot = 100 * 2;

        Assert.Null(skins[0].WinnerMemberId);
        Assert.Null(skins[1].WinnerMemberId);
        Assert.Equal(m[0], skins[2].WinnerMemberId);
        Assert.Equal(basePot * 3, skins[2].PotCents); // hole3 base + hole1 + hole2 carries
        Assert.Equal((short)2, skins[2].CarriedOverFromHole);
    }

    [Fact]
    public async Task Recalculating_is_idempotent_old_skins_are_replaced_not_duplicated()
    {
        var (calc, db, roundId, m) = Build(2);
        AddScore(db, roundId, m[0], 1, 4); AddScore(db, roundId, m[1], 1, 5);
        await db.SaveChangesAsync();

        await calc.CalculateAsync(roundId, 100, default);
        await calc.CalculateAsync(roundId, 100, default); // run twice

        Assert.Equal(1, db.Skins.Count(s => s.RoundId == roundId));
    }

    [Fact]
    public async Task No_scores_produces_no_skins_and_does_not_throw()
    {
        var (calc, db, roundId, _) = Build(2);

        await calc.CalculateAsync(roundId, 100, default);

        Assert.Empty(db.Skins.Where(s => s.RoundId == roundId));
    }

    [Fact]
    public async Task Missing_round_throws()
    {
        var (calc, _, _, _) = Build(2);
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => calc.CalculateAsync(Guid.NewGuid(), 100, default));
    }
}
