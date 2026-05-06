using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;

namespace GolfFundraiserPro.Api.Features.League;

/// <summary>
/// Resolves skins for a round: lowest net score per hole wins.
/// Ties carry the pot to the next hole. Inserts Skin rows after round close.
/// </summary>
public class SkinsCalculator
{
    private readonly ApplicationDbContext _db;

    public SkinsCalculator(ApplicationDbContext db) => _db = db;

    public async Task CalculateAsync(Guid roundId, int potCentsPerHolePerPlayer, CancellationToken ct)
    {
        var round = await _db.LeagueRounds
            .Include(r => r.Season)
            .FirstOrDefaultAsync(r => r.Id == roundId, ct)
            ?? throw new InvalidOperationException("Round not found.");

        // Delete any existing skins for this round (idempotent)
        var existing = await _db.Skins.Where(s => s.RoundId == roundId).ToListAsync(ct);
        _db.Skins.RemoveRange(existing);

        var scores = await _db.LeagueScores
            .Where(s => s.RoundId == roundId)
            .ToListAsync(ct);

        if (scores.Count == 0) return;

        int playerCount = scores.Select(s => s.MemberId).Distinct().Count();
        int holes = scores.Select(s => s.HoleNumber).Distinct().Count();
        int basePotCents = potCentsPerHolePerPlayer * playerCount;

        var holeNumbers = Enumerable.Range(1, holes).Select(h => (short)h).ToList();

        int carryPot = 0;
        short? carryFromHole = null;

        foreach (var hole in holeNumbers)
        {
            var holeScores = scores
                .Where(s => s.HoleNumber == hole)
                .ToList();

            if (holeScores.Count == 0)
            {
                carryPot += basePotCents;
                continue;
            }

            int holePot = basePotCents + carryPot;
            short minNet = holeScores.Min(s => s.NetScore);
            var winners  = holeScores.Where(s => s.NetScore == minNet).ToList();

            if (winners.Count == 1)
            {
                // Clean win
                _db.Skins.Add(new Skin
                {
                    Id                  = Guid.NewGuid(),
                    RoundId             = roundId,
                    HoleNumber          = hole,
                    WinnerMemberId      = winners[0].MemberId,
                    PotCents            = holePot,
                    CarriedOverFromHole = carryFromHole
                });
                carryPot      = 0;
                carryFromHole = null;
            }
            else
            {
                // Tie — skin carries
                _db.Skins.Add(new Skin
                {
                    Id                  = Guid.NewGuid(),
                    RoundId             = roundId,
                    HoleNumber          = hole,
                    WinnerMemberId      = null, // tied
                    PotCents            = holePot,
                    CarriedOverFromHole = carryFromHole
                });
                carryPot      = holePot;
                carryFromHole = hole;
            }
        }

        await _db.SaveChangesAsync(ct);
    }
}
