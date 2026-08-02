using Xunit;
using GolfFundraiserPro.Api.Features.Events;

namespace WebAPI.Tests;

/// <summary>
/// U5: every team on a shotgun event needs a starting hole before it goes
/// Active, or the mobile scorecard starts them all on hole 1.
/// </summary>
public class ShotgunAssignmentRulesTests
{
    private static (Guid, short?) Team(short? hole = null) => (Guid.NewGuid(), hole);

    [Fact]
    public void Fresh_event_lays_teams_out_in_order()
    {
        var teams = new[] { Team(), Team(), Team(), Team() };

        var result = ShotgunAssignmentRules.AssignStartingHoles(teams, 18);

        Assert.Equal(4, result.Count);
        Assert.Equal(new short[] { 1, 2, 3, 4 }, result.Select(r => r.StartingHole));
    }

    [Fact]
    public void Every_team_gets_a_distinct_hole_when_they_fit()
    {
        var teams = Enumerable.Range(0, 18).Select(_ => Team()).ToList();

        var result = ShotgunAssignmentRules.AssignStartingHoles(teams, 18);

        Assert.Equal(18, result.Count);
        Assert.Equal(18, result.Select(r => r.StartingHole).Distinct().Count());
    }

    [Fact]
    public void Manual_assignments_are_never_overwritten()
    {
        // A hole set on the admin shotgun screen is a deliberate decision.
        var placed = (Guid.NewGuid(), (short?)7);
        var teams  = new[] { placed, Team(), Team() };

        var result = ShotgunAssignmentRules.AssignStartingHoles(teams, 18);

        Assert.Equal(2, result.Count);
        Assert.DoesNotContain(placed.Item1, result.Select(r => r.TeamId));
    }

    [Fact]
    public void Automatic_assignment_avoids_holes_already_taken()
    {
        // Holes 1 and 2 are spoken for, so the next teams must go elsewhere
        // rather than stacking on top of them.
        var teams = new[] { Team(1), Team(2), Team(), Team() };

        var result = ShotgunAssignmentRules.AssignStartingHoles(teams, 18);

        Assert.Equal(new short[] { 3, 4 }, result.Select(r => r.StartingHole));
    }

    [Fact]
    public void More_teams_than_holes_doubles_up_evenly()
    {
        // 20 teams on 18 holes is a normal shotgun (A/B positions), not an error.
        var teams = Enumerable.Range(0, 20).Select(_ => Team()).ToList();

        var result = ShotgunAssignmentRules.AssignStartingHoles(teams, 18);

        Assert.Equal(20, result.Count);
        var perHole = result.GroupBy(r => r.StartingHole).ToDictionary(g => g.Key, g => g.Count());
        Assert.All(perHole.Values, count => Assert.InRange(count, 1, 2));
        Assert.Equal(2, perHole.Count(kv => kv.Value == 2)); // exactly the overflow
    }

    [Fact]
    public void Nine_hole_events_never_assign_past_hole_nine()
    {
        var teams = Enumerable.Range(0, 12).Select(_ => Team()).ToList();

        var result = ShotgunAssignmentRules.AssignStartingHoles(teams, 9);

        Assert.All(result, r => Assert.InRange(r.StartingHole, (short)1, (short)9));
    }

    [Fact]
    public void No_teams_or_no_holes_is_a_no_op()
    {
        Assert.Empty(ShotgunAssignmentRules.AssignStartingHoles(Array.Empty<(Guid, short?)>(), 18));
        Assert.Empty(ShotgunAssignmentRules.AssignStartingHoles(new[] { Team() }, 0));
    }

    [Fact]
    public void A_fully_assigned_event_needs_no_changes()
    {
        // Re-entering Active must not shuffle a roster mid-event.
        var teams = new[] { Team(3), Team(9), Team(14) };

        Assert.Empty(ShotgunAssignmentRules.AssignStartingHoles(teams, 18));
    }
}
