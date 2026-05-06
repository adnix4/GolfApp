using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.League;

/// <summary>
/// Recomputes standings for all active members in a season.
/// Called after each round closes. Upserts one Standing row per member.
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

        // Aggregate per-member totals
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

        foreach (var member in members)
        {
            var rounds = memberTotals
                .Where(r => r.MemberId == member.Id)
                .ToList();

            int totalPoints;
            int netStrokes;
            double avgNet;
            short played = (short)rounds.Count;

            if (season.League.Format == LeagueFormat.Stableford)
            {
                var counted = rounds.OrderByDescending(r => r.Stableford).Take(roundsCounted);
                totalPoints = counted.Sum(r => r.Stableford);
                netStrokes  = rounds.Sum(r => r.Net);
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
        }

        await _db.SaveChangesAsync(ct);

        // Assign ranks per flight
        await AssignRanksAsync(seasonId, season.League.Format, ct);
    }

    private async Task AssignRanksAsync(Guid seasonId, LeagueFormat format, CancellationToken ct)
    {
        var standings = await _db.Standings
            .Where(s => s.SeasonId == seasonId)
            .ToListAsync(ct);

        var flightGroups = standings.GroupBy(s => s.FlightId);

        foreach (var group in flightGroups)
        {
            IOrderedEnumerable<Standing> ordered = format == LeagueFormat.Stableford
                ? group.OrderByDescending(s => s.TotalPoints).ThenByDescending(s => s.RoundsPlayed)
                : group.OrderBy(s => s.NetStrokes).ThenBy(s => s.RoundsPlayed);

            short rank = 1;
            foreach (var standing in ordered)
            {
                standing.Rank = rank++;
            }
        }

        await _db.SaveChangesAsync(ct);
    }
}
