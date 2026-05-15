using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.League;

/// <summary>
/// Recalculates handicap indexes for all active members in a season after a round closes.
/// Called synchronously inside LeagueService.CloseRoundAsync — no separate job needed.
/// Returns a list of updated member notices so the caller can send emails.
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

    public record HandicapUpdateNotice(
        Guid   MemberId,
        string Email,
        string Name,
        double OldIndex,
        double NewIndex);

    public async Task<List<HandicapUpdateNotice>> RecalculateAsync(
        Guid seasonId, Guid roundId, CancellationToken ct)
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
        bool isUsga  = season.League.HandicapSystem == HandicapSystem.USGA;

        var notices = new List<HandicapUpdateNotice>();

        foreach (var member in members)
        {
            var notice = await RecalculateMemberAsync(member, roundId, formula, cap, isUsga, ct);
            if (notice is not null) notices.Add(notice);
        }

        await _db.SaveChangesAsync(ct);

        // If season.SyncHandicapToPlayer, push updated indexes to players.handicap_index
        if (season.SyncHandicapToPlayer)
            await SyncToPlayersAsync(members.Where(m => notices.Any(n => n.MemberId == m.Id)).ToList(), ct);

        _logger.LogInformation(
            "Handicaps recalculated for {Count} members in season {SeasonId}; {Updated} updated.",
            members.Count, seasonId, notices.Count);

        return notices;
    }

    private async Task SyncToPlayersAsync(List<LeagueMember> updatedMembers, CancellationToken ct)
    {
        foreach (var m in updatedMembers.Where(m => m.PlayerId.HasValue))
        {
            var player = await _db.Players.FindAsync(new object?[] { m.PlayerId!.Value }, ct);
            if (player is not null) player.HandicapIndex = m.HandicapIndex;
        }
        await _db.SaveChangesAsync(ct);
    }

    private async Task<HandicapUpdateNotice?> RecalculateMemberAsync(
        LeagueMember member, Guid roundId,
        HandicapFormula formula, double cap, bool isUsga, CancellationToken ct)
    {
        var differentials = await ComputeDifferentialsAsync(member.Id, isUsga, ct);
        if (differentials.Count == 0) return null;

        double newIndex;
        if (isUsga)
        {
            // USGA: best 8 of last 20 differentials
            newIndex = ComputeBestNofM(differentials, 8, 20);
        }
        else
        {
            newIndex = formula.Type switch
            {
                "BestNofM" => ComputeBestNofM(differentials, formula.N, formula.M),
                "Rolling"  => ComputeRolling(differentials, formula.N),
                "Percent"  => ComputePercent(differentials, formula.N, formula.Pct),
                _          => ComputeBestNofM(differentials, 5, 10)
            };
        }

        newIndex = Math.Round(Math.Min(newIndex, cap), 1);

        if (Math.Abs(newIndex - member.HandicapIndex) < 0.05) return null;

        var latestDiff = differentials[0];
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

        var oldIndex = member.HandicapIndex;
        member.HandicapIndex = newIndex;

        return new HandicapUpdateNotice(
            member.Id, member.Email,
            $"{member.FirstName} {member.LastName}",
            oldIndex, newIndex);
    }

    private async Task<List<double>> ComputeDifferentialsAsync(
        Guid memberId, bool isUsga, CancellationToken ct)
    {
        var rounds = await _db.LeagueScores
            .Include(s => s.Round)
            .ThenInclude(r => r.Course)
            .ThenInclude(c => c!.Holes)
            .Where(s => s.MemberId == memberId && s.Round.Status == RoundStatus.Closed)
            .GroupBy(s => s.RoundId)
            .Select(g => new
            {
                RoundDate    = g.First().Round.RoundDate,
                GrossTotal   = (int)g.Sum(s => s.GrossScore),
                CoursePar    = g.First().Round.Course != null
                                   ? g.First().Round.Course!.Holes.Sum(h => (int)h.Par)
                                   : 72,
                CourseRating = g.First().Round.Course != null
                                   ? g.First().Round.Course!.CourseRating
                                   : null,
                SlopeRating  = g.First().Round.Course != null
                                   ? g.First().Round.Course!.SlopeRating
                                   : null
            })
            .OrderByDescending(r => r.RoundDate)
            .ToListAsync(ct);

        return rounds.Select(r =>
        {
            if (isUsga && r.CourseRating.HasValue && r.SlopeRating is > 0)
                return (r.GrossTotal - r.CourseRating.Value) * 113.0 / r.SlopeRating.Value;
            return (double)(r.GrossTotal - r.CoursePar);
        }).ToList();
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

            var allBetter = recentNets.All(r => (r.NetTotal - r.CoursePar) <= -3);
            if (allBetter) sandbagged.Add(member.Id);
        }

        return sandbagged;
    }
}
