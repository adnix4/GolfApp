using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.Events.Leaderboard;

/// <summary>
/// Pure standings computation. Single source of truth for the leaderboard
/// sort + rank algorithm used by both the authenticated and public endpoints
/// and the real-time SignalR broadcaster.
///
/// Spec §3 Phase 3: leaderboard re-sort latency target is &lt; 2 s.
/// Keeping this allocation-light and free of DB access lets callers fetch
/// the three input sets with separate projected queries (no Cartesian join).
/// </summary>
public static class LeaderboardCalculator
{
    public readonly record struct TeamRow(Guid Id, string Name, short? StartingHole, DateTime? TeeTime);
    public readonly record struct ScoreRow(Guid TeamId, short HoleNumber, short GrossScore);
    public readonly record struct ParRow(short HoleNumber, short Par);

    public sealed record StandingEntry
    {
        public int      Rank             { get; init; }
        public Guid     TeamId           { get; init; }
        public string   TeamName         { get; init; } = string.Empty;
        public int      ToPar            { get; init; }
        public int      GrossTotal       { get; init; }
        public int      StablefordPoints { get; init; }
        public int      HolesComplete    { get; init; }
        public bool     IsComplete       { get; init; }
        public short?   StartingHole     { get; init; }
        public DateTime? TeeTime         { get; init; }

        /// <summary>
        /// Strokes (or, for Stableford, points) behind the leader. 0 for the
        /// leader and for any team tied at the top. Always &gt;= 0.
        /// </summary>
        public int      StrokesBack      { get; init; }

        /// <summary>Hole number of the team's best hole (lowest score relative to par). Null until the team has a score.</summary>
        public short?   BestHole         { get; init; }

        /// <summary>Gross score recorded on <see cref="BestHole"/>. Null until the team has a score.</summary>
        public short?   BestHoleScore    { get; init; }
    }

    public static List<StandingEntry> Compute(
        IReadOnlyCollection<TeamRow>  teams,
        IReadOnlyCollection<ScoreRow> scores,
        IReadOnlyCollection<ParRow>   pars,
        int          defaultHoles,
        EventFormat  format)
    {
        var parByHole = pars.Count > 0
            ? pars.ToDictionary(p => (int)p.HoleNumber, p => (int)p.Par)
            : Enumerable.Range(1, defaultHoles).ToDictionary(n => n, _ => 4);

        var scoresByTeam = scores
            .GroupBy(s => s.TeamId)
            .ToDictionary(g => g.Key, g => g.ToList());

        var isStableford = format == EventFormat.Stableford;

        var rows = new List<StandingEntry>(teams.Count);
        foreach (var t in teams)
        {
            var ts            = scoresByTeam.GetValueOrDefault(t.Id, []);
            var gross         = ts.Sum(s => (int)s.GrossScore);
            var parTotal      = ts.Sum(s => parByHole.GetValueOrDefault(s.HoleNumber, 4));
            var holesComplete = ts.Count;
            var stableford    = isStableford
                ? ts.Sum(s => Math.Max(0, parByHole.GetValueOrDefault(s.HoleNumber, 4) - (int)s.GrossScore + 2))
                : 0;

            // Best hole = lowest score relative to par. Ties break on lower
            // gross, then lower hole number, so the result is deterministic.
            short? bestHole      = null;
            short? bestHoleScore = null;
            var    bestRel       = int.MaxValue;
            foreach (var s in ts)
            {
                var rel    = (int)s.GrossScore - parByHole.GetValueOrDefault(s.HoleNumber, 4);
                var better = rel < bestRel
                    || (rel == bestRel && s.GrossScore <  bestHoleScore)
                    || (rel == bestRel && s.GrossScore == bestHoleScore && s.HoleNumber < bestHole);
                if (bestHole is null || better)
                {
                    bestRel       = rel;
                    bestHole      = s.HoleNumber;
                    bestHoleScore = s.GrossScore;
                }
            }

            rows.Add(new StandingEntry
            {
                TeamId           = t.Id,
                TeamName         = t.Name,
                ToPar            = gross - parTotal,
                GrossTotal       = gross,
                StablefordPoints = stableford,
                HolesComplete    = holesComplete,
                IsComplete       = holesComplete >= defaultHoles,
                StartingHole     = t.StartingHole,
                TeeTime          = t.TeeTime,
                BestHole         = bestHole,
                BestHoleScore    = bestHoleScore,
            });
        }

        // Unscored teams always sort last; ties share a rank
        var sorted = isStableford
            ? rows
                .OrderBy(e => e.HolesComplete == 0 ? 1 : 0)
                .ThenByDescending(e => e.StablefordPoints)
                .ThenByDescending(e => e.HolesComplete)
                .ToList()
            : rows
                .OrderBy(e => e.HolesComplete == 0 ? 1 : 0)
                .ThenBy(e => e.ToPar)
                .ThenByDescending(e => e.HolesComplete)
                .ToList();

        // The leader is the first scored team after sorting (best ToPar, or
        // best Stableford points). StrokesBack is each team's gap from it.
        var leader = sorted.FirstOrDefault(e => e.HolesComplete > 0);

        var ranked = new List<StandingEntry>(sorted.Count);
        var rank   = 1;
        for (int i = 0; i < sorted.Count; i++)
        {
            if (i > 0 && sorted[i].HolesComplete > 0)
            {
                var tied = isStableford
                    ? sorted[i].StablefordPoints == sorted[i - 1].StablefordPoints
                    : sorted[i].ToPar           == sorted[i - 1].ToPar;
                if (!tied) rank = i + 1;
            }

            var strokesBack = sorted[i].HolesComplete == 0 || leader is null
                ? 0
                : isStableford
                    ? leader.StablefordPoints - sorted[i].StablefordPoints
                    : sorted[i].ToPar          - leader.ToPar;

            ranked.Add(sorted[i] with
            {
                Rank        = sorted[i].HolesComplete == 0 ? 0 : rank,
                StrokesBack = strokesBack,
            });
        }

        return ranked;
    }
}
