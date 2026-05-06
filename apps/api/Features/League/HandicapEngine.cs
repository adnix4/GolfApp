using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.League;

/// <summary>
/// Recalculates handicap indexes for all active members in a season after a round closes.
/// Called synchronously inside LeagueService.CloseRoundAsync — no separate job needed.
/// </summary>
public class HandicapEngine
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<HandicapEngine> _logger;

    public HandicapEngine(ApplicationDbContext db, ILogger<HandicapEngine> logger)
    {
        _db     = db;
        _logger = logger;
    }

    public async Task RecalculateAsync(Guid seasonId, Guid roundId, CancellationToken ct)
    {
        var season = await _db.Seasons
            .Include(s => s.League)
            .FirstOrDefaultAsync(s => s.Id == seasonId, ct)
            ?? throw new InvalidOperationException("Season not found.");

        var members = await _db.LeagueMembers
            .Where(m => m.SeasonId == seasonId && m.Status == MemberStatus.Active)
            .ToListAsync(ct);

        var formula = ParseFormula(season.League.HandicapFormulaJson);
        double cap   = season.League.HandicapCap;

        foreach (var member in members)
        {
            await RecalculateMemberAsync(member, roundId, formula, cap, ct);
        }

        await _db.SaveChangesAsync(ct);
        _logger.LogInformation("Handicaps recalculated for {Count} members in season {SeasonId}",
            members.Count, seasonId);
    }

    private async Task RecalculateMemberAsync(
        LeagueMember member, Guid roundId,
        HandicapFormula formula, double cap, CancellationToken ct)
    {
        // Fetch all closed rounds with scores for this member
        var roundScores = await _db.LeagueScores
            .Include(s => s.Round)
            .Where(s => s.MemberId == member.Id && s.Round.Status == RoundStatus.Closed)
            .GroupBy(s => s.RoundId)
            .Select(g => new
            {
                RoundId    = g.Key,
                RoundDate  = g.First().Round.RoundDate,
                GrossTotal = (int)g.Sum(s => s.GrossScore),
                // Simple differential: adjusted gross - par (no slope/rating in Phase 5a)
                Differential = (double)g.Sum(s => s.GrossScore) - g.First().Round.Season.League.HandicapCap
            })
            .OrderByDescending(r => r.RoundDate)
            .ToListAsync(ct);

        // Compute differentials from gross - course par (simplified: using holes count × avg par 4 = 72 for 18h)
        // For Phase 5a the differential = AdjustedGross - CoursePar (admin should set par via course holes)
        var differentials = await _db.LeagueScores
            .Include(s => s.Round)
            .ThenInclude(r => r.Course)
            .ThenInclude(c => c!.Holes)
            .Where(s => s.MemberId == member.Id && s.Round.Status == RoundStatus.Closed)
            .GroupBy(s => s.RoundId)
            .Select(g => new
            {
                RoundId      = g.Key,
                RoundDate    = g.First().Round.RoundDate,
                GrossTotal   = (int)g.Sum(s => s.GrossScore),
                CoursePar    = g.First().Round.Course != null
                                   ? g.First().Round.Course!.Holes.Sum(h => (int)h.Par)
                                   : 72
            })
            .OrderByDescending(r => r.RoundDate)
            .ToListAsync(ct);

        if (differentials.Count == 0) return;

        var diffs = differentials
            .Select(d => (double)(d.GrossTotal - d.CoursePar))
            .ToList();

        double newIndex = formula.Type switch
        {
            "BestNofM" => ComputeBestNofM(diffs, formula.N, formula.M),
            "Rolling"  => ComputeRolling(diffs, formula.N),
            "Percent"  => ComputePercent(diffs, formula.N, formula.Pct),
            _          => ComputeBestNofM(diffs, 5, 10)
        };

        newIndex = Math.Round(Math.Min(newIndex, cap), 1);

        if (Math.Abs(newIndex - member.HandicapIndex) < 0.05) return;

        var latestDiff = diffs[0];
        _db.HandicapHistories.Add(new HandicapHistory
        {
            Id            = Guid.NewGuid(),
            MemberId      = member.Id,
            RoundId       = roundId,
            OldIndex      = member.HandicapIndex,
            NewIndex      = newIndex,
            Differential  = latestDiff,
            AdminOverride = false,
            CreatedAt     = DateTime.UtcNow
        });

        member.HandicapIndex = newIndex;
    }

    private static double ComputeBestNofM(List<double> diffs, int n, int m)
    {
        var recent = diffs.Take(m).ToList();
        if (recent.Count == 0) return 0;
        var best = recent.OrderBy(d => d).Take(n).ToList();
        return best.Average();
    }

    private static double ComputeRolling(List<double> diffs, int n)
    {
        var recent = diffs.Take(n).ToList();
        return recent.Count == 0 ? 0 : recent.Average();
    }

    private static double ComputePercent(List<double> diffs, int n, double pct)
    {
        var recent = diffs.Take(n).ToList();
        return recent.Count == 0 ? 0 : recent.Average() * pct;
    }

    private static HandicapFormula ParseFormula(string json)
    {
        try
        {
            var doc = JsonDocument.Parse(json);
            return new HandicapFormula(
                Type: doc.RootElement.TryGetProperty("type", out var t)  ? t.GetString() ?? "BestNofM" : "BestNofM",
                N:    doc.RootElement.TryGetProperty("n",    out var n)  ? n.GetInt32()   : 5,
                M:    doc.RootElement.TryGetProperty("m",    out var m)  ? m.GetInt32()   : 10,
                Pct:  doc.RootElement.TryGetProperty("pct",  out var p)  ? p.GetDouble()  : 0.85
            );
        }
        catch
        {
            return new HandicapFormula("BestNofM", 5, 10, 0.85);
        }
    }

    private record HandicapFormula(string Type, int N, int M, double Pct);

    // ── SANDBAGGER DETECTION ──────────────────────────────────────────────────
    // Returns member IDs where last 5 net scores are all >= 3 strokes better
    // than handicap suggests (i.e. consistently scoring much lower than expected).
    public async Task<List<Guid>> DetectSandbaggersAsync(Guid seasonId, CancellationToken ct)
    {
        var members = await _db.LeagueMembers
            .Where(m => m.SeasonId == seasonId && m.Status == MemberStatus.Active)
            .Select(m => new { m.Id, m.HandicapIndex })
            .ToListAsync(ct);

        var sandbagged = new List<Guid>();

        foreach (var member in members)
        {
            var recentNets = await _db.LeagueScores
                .Include(s => s.Round)
                .ThenInclude(r => r.Course)
                .ThenInclude(c => c!.Holes)
                .Where(s => s.MemberId == member.Id && s.Round.Status == RoundStatus.Closed)
                .GroupBy(s => s.RoundId)
                .Select(g => new
                {
                    NetTotal  = (int)g.Sum(s => s.NetScore),
                    CoursePar = g.First().Round.Course != null
                                    ? g.First().Round.Course!.Holes.Sum(h => (int)h.Par)
                                    : 72
                })
                .OrderByDescending(r => r.NetTotal)
                .Take(5)
                .ToListAsync(ct);

            if (recentNets.Count < 5) continue;

            // Net score relative to par (expected to be ~0 for a player playing to handicap)
            var allBetter = recentNets.All(r => (r.NetTotal - r.CoursePar) <= -3);
            if (allBetter) sandbagged.Add(member.Id);
        }

        return sandbagged;
    }
}
