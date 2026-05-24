using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.League;

/// <summary>
/// Recomputes standings for all active members in a season.
/// Called after each round closes. Upserts one Standing row per member.
/// Supports Stableford, Stroke, Match, and Quota formats.
/// </summary>
public class StandingsCalculator
{
    private readonly ApplicationDbContext _db;

    public StandingsCalculator(ApplicationDbContext db) => _db = db;

    public async Task RecalculateAsync(Guid seasonId, CancellationToken ct)
    {
        var season = await _db.Seasons
            .Include(s => s.League)
            .FirstOrDefaultAsync(s => s.Id == seasonId, ct)
            ?? throw new InvalidOperationException("Season not found.");

        var members = await _db.LeagueMembers
            .Include(m => m.Flight)
            .Where(m => m.SeasonId == seasonId && m.Status == MemberStatus.Active)
            .ToListAsync(ct);

        var closedRoundIds = await _db.LeagueRounds
            .Where(r => r.SeasonId == seasonId && r.Status == RoundStatus.Closed)
            .Select(r => r.Id)
            .ToListAsync(ct);

        var memberTotals = await _db.LeagueScores
            .Where(s => closedRoundIds.Contains(s.RoundId))
            .GroupBy(s => new { s.MemberId, s.RoundId })
            .Select(g => new
            {
                g.Key.MemberId,
                g.Key.RoundId,
                Stableford = (int)g.Sum(s => s.StablefordPoints),
                Net        = (int)g.Sum(s => s.NetScore)
            })
            .ToListAsync(ct);

        var existingStandings = await _db.Standings
            .Where(s => s.SeasonId == seasonId)
            .ToListAsync(ct);

        int roundsCounted = season.RoundsCounted > 0 ? season.RoundsCounted : int.MaxValue;
        var format = season.League.Format;

        // Match play: compute per-round W/L/H within pairing groups
        Dictionary<Guid, (int Wins, int Losses, int Halves)> matchRecords = new();
        if (format == LeagueFormat.Match)
            matchRecords = await ComputeMatchRecordsAsync(seasonId, closedRoundIds, ct);

        foreach (var member in members)
        {
            var rounds = memberTotals.Where(r => r.MemberId == member.Id).ToList();
            int courseHandicap = (int)Math.Round(member.HandicapIndex);
            int quotaTarget = Math.Max(0, 36 - courseHandicap);

            int totalPoints;
            int netStrokes;
            double avgNet;
            short played = (short)rounds.Count;

            if (format == LeagueFormat.Stableford)
            {
                var counted = rounds.OrderByDescending(r => r.Stableford).Take(roundsCounted);
                totalPoints = counted.Sum(r => r.Stableford);
                netStrokes  = rounds.Sum(r => r.Net);
                avgNet      = played > 0 ? (double)netStrokes / played : 0;
            }
            else if (format == LeagueFormat.Quota)
            {
                // Quota: sum of (Stableford - quotaTarget) per round, best N of M
                var quotaScores = rounds
                    .Select(r => r.Stableford - quotaTarget)
                    .OrderByDescending(q => q)
                    .Take(roundsCounted)
                    .ToList();
                totalPoints = quotaScores.Sum();
                netStrokes  = rounds.Sum(r => r.Net);
                avgNet      = played > 0 ? (double)netStrokes / played : 0;
            }
            else if (format == LeagueFormat.Match)
            {
                // Match: total points = wins * 2 + halves (for ranking)
                (int Wins, int Losses, int Halves) record = matchRecords.TryGetValue(member.Id, out var r) ? r : (0, 0, 0);
                totalPoints = record.Wins * 2 + record.Halves;
                netStrokes  = rounds.Sum(x => x.Net);
                avgNet      = played > 0 ? (double)netStrokes / played : 0;
            }
            else // Stroke
            {
                var counted = rounds.OrderBy(r => r.Net).Take(roundsCounted);
                netStrokes  = counted.Sum(r => r.Net);
                totalPoints = 0;
                avgNet      = played > 0 ? (double)rounds.Sum(r => r.Net) / played : 0;
            }

            var standing = existingStandings.FirstOrDefault(s => s.MemberId == member.Id);
            if (standing is null)
            {
                standing = new Standing
                {
                    Id       = Guid.NewGuid(),
                    SeasonId = seasonId,
                    MemberId = member.Id,
                    FlightId = member.FlightId
                };
                _db.Standings.Add(standing);
                existingStandings.Add(standing);
            }

            standing.TotalPoints  = totalPoints;
            standing.NetStrokes   = netStrokes;
            standing.SeasonAvgNet = Math.Round(avgNet, 2);
            standing.RoundsPlayed = played;
            standing.FlightId     = member.FlightId;
            standing.UpdatedAt    = DateTime.UtcNow;

            if (format == LeagueFormat.Match && matchRecords.TryGetValue(member.Id, out var mr))
            {
                standing.MatchWins   = mr.Wins;
                standing.MatchLosses = mr.Losses;
                standing.MatchHalves = mr.Halves;
            }
        }

        await _db.SaveChangesAsync(ct);
        await AssignRanksAsync(seasonId, format, ct);
    }

    private async Task<Dictionary<Guid, (int Wins, int Losses, int Halves)>> ComputeMatchRecordsAsync(
        Guid seasonId, List<Guid> closedRoundIds, CancellationToken ct)
    {
        var records = new Dictionary<Guid, (int Wins, int Losses, int Halves)>();
        if (closedRoundIds.Count == 0) return records;

        // Two batched queries — no per-round round-trip.
        var allPairings = await _db.LeaguePairings
            .AsNoTracking()
            .Where(p => closedRoundIds.Contains(p.RoundId))
            .Select(p => new { p.RoundId, p.MemberIdsJson })
            .ToListAsync(ct);

        var allScores = await _db.LeagueScores
            .AsNoTracking()
            .Where(s => closedRoundIds.Contains(s.RoundId))
            .Select(s => new { s.RoundId, s.MemberId, s.HoleNumber, s.NetScore })
            .ToListAsync(ct);

        // Pre-group: round → member → hole → netScore. O(1) lookups inside the
        // pair loop instead of repeated Where/First scans of the flat list.
        var scoresByRound = allScores
            .GroupBy(s => s.RoundId)
            .ToDictionary(
                rg => rg.Key,
                rg => rg.GroupBy(s => s.MemberId).ToDictionary(
                    mg => mg.Key,
                    mg => mg.ToDictionary(s => (int)s.HoleNumber, s => (int)s.NetScore)));

        var pairingsByRound = allPairings
            .GroupBy(p => p.RoundId)
            .ToDictionary(g => g.Key, g => g.ToList());

        foreach (var roundId in closedRoundIds)
        {
            if (!pairingsByRound.TryGetValue(roundId, out var pairings)) continue;
            var roundScores = scoresByRound.GetValueOrDefault(roundId, []);

            foreach (var pairing in pairings)
            {
                var memberIds = PairingEngine.DeserializeMemberIds(pairing.MemberIdsJson);
                if (memberIds.Count < 2) continue;

                for (int i = 0; i < memberIds.Count; i++)
                for (int j = i + 1; j < memberIds.Count; j++)
                {
                    var aId = memberIds[i];
                    var bId = memberIds[j];

                    if (!roundScores.TryGetValue(aId, out var aHoles)) continue;
                    if (!roundScores.TryGetValue(bId, out var bHoles)) continue;

                    int aHolesWon = 0, bHolesWon = 0;
                    foreach (var (hole, aNet) in aHoles)
                    {
                        if (!bHoles.TryGetValue(hole, out var bNet)) continue;
                        if      (aNet < bNet) aHolesWon++;
                        else if (bNet < aNet) bHolesWon++;
                    }

                    if (aHolesWon > bHolesWon)
                    {
                        Increment(records, aId, win: true);
                        Increment(records, bId, win: false);
                    }
                    else if (bHolesWon > aHolesWon)
                    {
                        Increment(records, bId, win: true);
                        Increment(records, aId, win: false);
                    }
                    else
                    {
                        IncrementHalve(records, aId);
                        IncrementHalve(records, bId);
                    }
                }
            }
        }

        return records;
    }

    private static void Increment(Dictionary<Guid, (int Wins, int Losses, int Halves)> dict, Guid id, bool win)
    {
        dict.TryGetValue(id, out var cur);
        dict[id] = win
            ? (cur.Wins + 1, cur.Losses, cur.Halves)
            : (cur.Wins, cur.Losses + 1, cur.Halves);
    }

    private static void IncrementHalve(Dictionary<Guid, (int Wins, int Losses, int Halves)> dict, Guid id)
    {
        dict.TryGetValue(id, out var cur);
        dict[id] = (cur.Wins, cur.Losses, cur.Halves + 1);
    }

    private async Task AssignRanksAsync(Guid seasonId, LeagueFormat format, CancellationToken ct)
    {
        var standings = await _db.Standings
            .Where(s => s.SeasonId == seasonId)
            .ToListAsync(ct);

        var flightGroups = standings.GroupBy(s => s.FlightId);

        foreach (var group in flightGroups)
        {
            IOrderedEnumerable<Standing> ordered = format == LeagueFormat.Stroke
                ? group.OrderBy(s => s.NetStrokes).ThenBy(s => s.RoundsPlayed)
                : group.OrderByDescending(s => s.TotalPoints).ThenByDescending(s => s.RoundsPlayed);

            short rank = 1;
            foreach (var standing in ordered)
                standing.Rank = rank++;
        }

        await _db.SaveChangesAsync(ct);
    }
}
