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

        // Batch-load every member's closed-round results up front (a few queries),
        // instead of one query per member.
        var (roundMeta, resultsByMember) =
            await LoadClosedResultsAsync(seasonId, members.Select(m => m.Id).ToList(), ct);

        foreach (var member in members)
        {
            if (!resultsByMember.TryGetValue(member.Id, out var memberRounds) || memberRounds.Count == 0)
                continue;

            // Differentials, most-recent-first (drives best-N-of-M and the latest-diff record).
            var differentials = memberRounds
                .OrderByDescending(r => roundMeta[r.RoundId].Date)
                .Select(r =>
                {
                    var meta = roundMeta[r.RoundId];
                    return ComputeDifferential(r.GrossTotal, meta.CoursePar, meta.CourseRating, meta.SlopeRating, isUsga);
                })
                .ToList();

            double newIndex = ComputeIndex(differentials, formula, cap, isUsga);
            if (Math.Abs(newIndex - member.HandicapIndex) < 0.05) continue;

            _db.HandicapHistories.Add(new HandicapHistory
            {
                Id            = Guid.NewGuid(),
                MemberId      = member.Id,
                RoundId       = roundId,
                OldIndex      = member.HandicapIndex,
                NewIndex      = newIndex,
                Differential  = differentials[0],
                AdminOverride = false,
                CreatedAt     = DateTime.UtcNow
            });

            var oldIndex = member.HandicapIndex;
            member.HandicapIndex = newIndex;
            notices.Add(new HandicapUpdateNotice(
                member.Id, member.Email, $"{member.FirstName} {member.LastName}", oldIndex, newIndex));
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
        // One batched fetch instead of a FindAsync round-trip per member.
        var byPlayerId = updatedMembers
            .Where(m => m.PlayerId.HasValue)
            .ToDictionary(m => m.PlayerId!.Value, m => m.HandicapIndex);
        if (byPlayerId.Count == 0) return;

        var players = await _db.Players
            .Where(p => byPlayerId.Keys.Contains(p.Id))
            .ToListAsync(ct);
        foreach (var player in players)
            player.HandicapIndex = byPlayerId[player.Id];

        await _db.SaveChangesAsync(ct);
    }

    // Per-round metadata shared by the handicap + sandbagger calculations.
    private sealed record RoundMeta(DateOnly Date, int CoursePar, double? CourseRating, int? SlopeRating);
    // One member's gross/net totals for a single closed round.
    private sealed record MemberRound(Guid RoundId, int GrossTotal, int NetTotal);

    /// <summary>
    /// Batches everything the handicap + sandbagger calculations need for a season into
    /// a handful of queries instead of one query per member: closed-round metadata (date
    /// + course par/rating/slope) and each member's per-round gross/net totals. Replaces
    /// the old per-member GroupBy-with-navigation query — far fewer round-trips, and the
    /// flat projections translate on every provider (incl. EF InMemory in tests).
    /// </summary>
    private async Task<(Dictionary<Guid, RoundMeta> RoundMeta, Dictionary<Guid, List<MemberRound>> ByMember)>
        LoadClosedResultsAsync(Guid seasonId, List<Guid> memberIds, CancellationToken ct)
    {
        var rounds = await _db.LeagueRounds
            .Where(r => r.SeasonId == seasonId && r.Status == RoundStatus.Closed)
            .Select(r => new { r.Id, r.RoundDate, r.CourseId })
            .ToListAsync(ct);

        var roundIds  = rounds.Select(r => r.Id).ToList();
        var courseIds = rounds.Where(r => r.CourseId.HasValue)
                              .Select(r => r.CourseId!.Value).Distinct().ToList();

        // Course par = sum of hole pars, batched per course (DB-side aggregate).
        var parByCourse = (await _db.CourseHoles
                .Where(h => courseIds.Contains(h.CourseId))
                .GroupBy(h => h.CourseId)
                .Select(g => new { CourseId = g.Key, Par = g.Sum(h => (int)h.Par) })
                .ToListAsync(ct))
            .ToDictionary(x => x.CourseId, x => x.Par);

        var ratingByCourse = (await _db.Courses
                .Where(c => courseIds.Contains(c.Id))
                .Select(c => new { c.Id, c.CourseRating, c.SlopeRating })
                .ToListAsync(ct))
            .ToDictionary(x => x.Id, x => (x.CourseRating, x.SlopeRating));

        var roundMeta = rounds.ToDictionary(r => r.Id, r =>
        {
            int par = 72; double? rating = null; int? slope = null;
            if (r.CourseId.HasValue)
            {
                if (parByCourse.TryGetValue(r.CourseId.Value, out var p)) par = p;
                if (ratingByCourse.TryGetValue(r.CourseId.Value, out var c)) { rating = c.CourseRating; slope = c.SlopeRating; }
            }
            return new RoundMeta(r.RoundDate, par, rating, slope);
        });

        // All scores for these members in those rounds — flat, then aggregated in memory.
        var byMember = (await _db.LeagueScores
                .Where(s => roundIds.Contains(s.RoundId) && memberIds.Contains(s.MemberId))
                .Select(s => new { s.MemberId, s.RoundId, s.GrossScore, s.NetScore })
                .ToListAsync(ct))
            .GroupBy(s => new { s.MemberId, s.RoundId })
            .Select(g => new
            {
                g.Key.MemberId,
                Round = new MemberRound(g.Key.RoundId, g.Sum(s => (int)s.GrossScore), g.Sum(s => (int)s.NetScore)),
            })
            .GroupBy(x => x.MemberId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.Round).ToList());

        return (roundMeta, byMember);
    }

    /// <summary>
    /// One round's scoring differential. USGA uses course rating + slope when both
    /// are present; otherwise (Club, or missing ratings) it falls back to the simple
    /// gross-over-par differential.
    /// </summary>
    internal static double ComputeDifferential(
        int grossTotal, int coursePar, double? courseRating, int? slopeRating, bool isUsga)
    {
        if (isUsga && courseRating.HasValue && slopeRating is > 0)
            return (grossTotal - courseRating.Value) * 113.0 / slopeRating.Value;
        return grossTotal - coursePar;
    }

    /// <summary>
    /// Selects the new handicap index from a member's differentials (most-recent-first),
    /// applies the configured formula (or USGA best-8-of-20), caps it, and rounds to
    /// one decimal. Pure — extracted so the math is unit-testable without a database.
    /// </summary>
    internal static double ComputeIndex(
        List<double> differentials, HandicapFormula formula, double cap, bool isUsga)
    {
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

        return Math.Round(Math.Min(newIndex, cap), 1);
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

    internal static HandicapFormula ParseFormula(string json)
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

    internal record HandicapFormula(string Type, int N, int M, double Pct);

    // ── SANDBAGGER DETECTION ──────────────────────────────────────────────────
    // Returns member IDs where last 5 net scores are all >= 3 strokes better
    // than handicap suggests (i.e. consistently scoring much lower than expected).
    public async Task<List<Guid>> DetectSandbaggersAsync(Guid seasonId, CancellationToken ct)
    {
        var memberIds = await _db.LeagueMembers
            .Where(m => m.SeasonId == seasonId && m.Status == MemberStatus.Active)
            .Select(m => m.Id)
            .ToListAsync(ct);

        var (roundMeta, byMember) = await LoadClosedResultsAsync(seasonId, memberIds, ct);

        var sandbagged = new List<Guid>();
        foreach (var memberId in memberIds)
        {
            if (!byMember.TryGetValue(memberId, out var rounds)) continue;

            // The 5 WORST net rounds (highest net totals). Flag only if even those are
            // all >= 3 strokes under par — i.e. consistently scoring well below handicap.
            var worst5 = rounds.OrderByDescending(r => r.NetTotal).Take(5).ToList();
            if (worst5.Count < 5) continue;

            if (worst5.All(r => r.NetTotal - roundMeta[r.RoundId].CoursePar <= -3))
                sandbagged.Add(memberId);
        }

        return sandbagged;
    }
}
