using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.League;

/// <summary>
/// Phase 5a greedy pairing engine.
/// Sort by flight then handicap. Build groups of max size.
/// Apply soft constraint: reduce repeat pairings via greedy swap.
/// Runs synchronously — O(n²) swap check is fine for ≤ 100 members.
/// </summary>
public class PairingEngine
{
    private readonly ApplicationDbContext _db;

    public PairingEngine(ApplicationDbContext db) => _db = db;

    public async Task<List<PairingGroupResponse>> GenerateAsync(
        Guid roundId, int maxPerGroup, CancellationToken ct)
    {
        var round = await _db.LeagueRounds
            .Include(r => r.Season)
            .FirstOrDefaultAsync(r => r.Id == roundId, ct)
            ?? throw new InvalidOperationException("Round not found.");

        var members = await _db.LeagueMembers
            .Where(m => m.SeasonId == round.SeasonId && m.Status == MemberStatus.Active)
            .Include(m => m.Flight)
            .OrderBy(m => m.Flight != null ? m.Flight.Name : "ZZZ")
            .ThenBy(m => m.HandicapIndex)
            .ToListAsync(ct);

        if (members.Count == 0)
            return new List<PairingGroupResponse>();

        // Build initial groups
        var groups = BuildGroups(members, maxPerGroup);

        // Load pairing history for soft constraint
        var history = await LoadPairingHistoryAsync(round.SeasonId, roundId, ct);

        // Greedy swap: try to reduce repeat pairings
        groups = GreedySwapReduce(groups, history);

        return groups.Select((g, i) => new PairingGroupResponse
        {
            Id          = Guid.NewGuid(),
            GroupNumber = (short)(i + 1),
            MemberIds   = g.Select(m => m.Id).ToList(),
            MemberNames = g.Select(m => $"{m.FirstName} {m.LastName}").ToList(),
            IsLocked    = false
        }).ToList();
    }

    private static List<List<LeagueMember>> BuildGroups(
        List<LeagueMember> members, int maxPerGroup)
    {
        var groups = new List<List<LeagueMember>>();
        for (int i = 0; i < members.Count; i += maxPerGroup)
        {
            groups.Add(members.Skip(i).Take(maxPerGroup).ToList());
        }
        return groups;
    }

    private async Task<HashSet<(Guid, Guid)>> LoadPairingHistoryAsync(
        Guid seasonId, Guid currentRoundId, CancellationToken ct)
    {
        var pairs = new HashSet<(Guid, Guid)>();

        var pastPairings = await _db.LeaguePairings
            .Include(p => p.Round)
            .Where(p => p.Round.SeasonId == seasonId && p.RoundId != currentRoundId)
            .ToListAsync(ct);

        foreach (var pairing in pastPairings)
        {
            var ids = DeserializeMemberIds(pairing.MemberIdsJson);
            for (int i = 0; i < ids.Count; i++)
            for (int j = i + 1; j < ids.Count; j++)
            {
                var a = ids[i] < ids[j] ? ids[i] : ids[j];
                var b = ids[i] < ids[j] ? ids[j] : ids[i];
                pairs.Add((a, b));
            }
        }

        return pairs;
    }

    private static List<List<LeagueMember>> GreedySwapReduce(
        List<List<LeagueMember>> groups,
        HashSet<(Guid, Guid)> history)
    {
        bool improved = true;
        int passes = 0;

        while (improved && passes < 5)
        {
            improved = false;
            passes++;

            for (int gi = 0; gi < groups.Count; gi++)
            for (int gj = gi + 1; gj < groups.Count; gj++)
            {
                var g1 = groups[gi];
                var g2 = groups[gj];

                for (int pi = 0; pi < g1.Count; pi++)
                for (int pj = 0; pj < g2.Count; pj++)
                {
                    int before = CountRepeats(g1, history) + CountRepeats(g2, history);

                    // Swap
                    (g1[pi], g2[pj]) = (g2[pj], g1[pi]);

                    int after = CountRepeats(g1, history) + CountRepeats(g2, history);
                    if (after < before)
                    {
                        improved = true;
                    }
                    else
                    {
                        // Undo
                        (g1[pi], g2[pj]) = (g2[pj], g1[pi]);
                    }
                }
            }
        }

        return groups;
    }

    private static int CountRepeats(List<LeagueMember> group, HashSet<(Guid, Guid)> history)
    {
        int count = 0;
        for (int i = 0; i < group.Count; i++)
        for (int j = i + 1; j < group.Count; j++)
        {
            var a = group[i].Id < group[j].Id ? group[i].Id : group[j].Id;
            var b = group[i].Id < group[j].Id ? group[j].Id : group[i].Id;
            if (history.Contains((a, b))) count++;
        }
        return count;
    }

    public static List<Guid> DeserializeMemberIds(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<List<Guid>>(json) ?? new List<Guid>();
        }
        catch
        {
            return new List<Guid>();
        }
    }
}
