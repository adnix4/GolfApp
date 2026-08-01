namespace GolfFundraiserPro.Api.Features.Events;

/// <summary>
/// Spreads teams across starting holes for a shotgun start.
///
/// Pure so the distribution can be tested directly — same pattern as
/// EventStatusRules and AuctionBidRules. EventService applies the result when an
/// event goes Active (U5): before this, a shotgun event could reach Active with
/// every team on a null starting hole, and the mobile scorecard would then start
/// all of them on hole 1 — which is precisely what a shotgun is not.
/// </summary>
public static class ShotgunAssignmentRules
{
    /// <summary>
    /// Returns a starting hole for every team that does not already have one.
    /// Teams that DO have one are left alone: a manual assignment made on the
    /// admin shotgun screen is a deliberate decision and outranks this.
    ///
    /// Holes are filled by lowest current occupancy, tie-broken by lowest hole
    /// number, so:
    ///   - a fresh event lays teams out 1, 2, 3, … in the given order;
    ///   - a partly-assigned event fills the genuinely empty holes first;
    ///   - more teams than holes doubles up evenly (A/B positions on a hole are
    ///     normal in a real shotgun) rather than failing.
    ///
    /// The caller controls ordering: pass teams in a stable order (registration
    /// order, or by name) and the layout is deterministic and reproducible.
    /// </summary>
    /// <param name="teams">Every team on the event, with its current hole.</param>
    /// <param name="holeCount">Holes on the course — 9 or 18.</param>
    public static IReadOnlyList<(Guid TeamId, short StartingHole)> AssignStartingHoles(
        IReadOnlyList<(Guid TeamId, short? StartingHole)> teams,
        int holeCount)
    {
        var result = new List<(Guid, short)>();
        if (teams.Count == 0 || holeCount <= 0) return result;

        // Occupancy seeded from the teams already placed, so manual assignments
        // push the automatic ones onto the emptier holes rather than stacking.
        var occupancy = new int[holeCount];
        foreach (var (_, hole) in teams)
        {
            if (hole is null) continue;
            var index = hole.Value - 1;
            if (index >= 0 && index < holeCount) occupancy[index]++;
        }

        foreach (var (teamId, hole) in teams)
        {
            if (hole is not null) continue;

            var bestIndex = 0;
            for (var i = 1; i < holeCount; i++)
            {
                if (occupancy[i] < occupancy[bestIndex]) bestIndex = i;
            }

            occupancy[bestIndex]++;
            result.Add((teamId, (short)(bestIndex + 1)));
        }

        return result;
    }
}
