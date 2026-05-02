using Xunit;
using GolfFundraiserPro.Api.Features.Scores;

namespace WebAPI.Tests;

public class ScoreConflictRulesTests
{
    // ── No conflict cases ───────────────────────────────────────────────────

    [Fact]
    public void Same_device_same_value_is_not_a_conflict()
    {
        Assert.False(ScoreConflictRules.IsConflict("dev-A", 4, "dev-A", 4));
    }

    [Fact]
    public void Same_device_different_value_is_not_a_conflict_admin_correction()
    {
        Assert.False(ScoreConflictRules.IsConflict("dev-A", 4, "dev-A", 5));
    }

    [Fact]
    public void Different_device_same_value_is_not_a_conflict()
    {
        // Two different devices agree on the score — accept without conflict
        Assert.False(ScoreConflictRules.IsConflict("dev-A", 4, "dev-B", 4));
    }

    // ── Conflict case ───────────────────────────────────────────────────────

    [Fact]
    public void Different_device_different_value_is_a_conflict()
    {
        Assert.True(ScoreConflictRules.IsConflict("dev-A", 4, "dev-B", 5));
    }

    [Fact]
    public void Conflict_is_symmetric_on_device_id()
    {
        // The order of old vs new devices doesn't matter for the flag
        Assert.True(ScoreConflictRules.IsConflict("dev-B", 5, "dev-A", 4));
    }

    // ── Edge cases ──────────────────────────────────────────────────────────

    [Fact]
    public void Same_device_id_empty_strings_no_conflict()
    {
        Assert.False(ScoreConflictRules.IsConflict("", 3, "", 7));
    }

    [Fact]
    public void Extreme_score_values_still_work()
    {
        Assert.True(ScoreConflictRules.IsConflict("dev-A", 1, "dev-B", int.MaxValue));
        Assert.False(ScoreConflictRules.IsConflict("dev-A", int.MaxValue, "dev-B", int.MaxValue));
    }
}
