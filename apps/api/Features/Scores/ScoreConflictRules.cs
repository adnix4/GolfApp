namespace GolfFundraiserPro.Api.Features.Scores;

/// <summary>
/// Pure helper for score-conflict detection — no DB, fully unit-testable.
///
/// Conflict rules (spec Phase 1 §7.4):
///   • Same device              → overwrite (admin correcting themselves)
///   • Different device, same value  → accept without conflict
///   • Different device, different value → flag as conflicted; do NOT overwrite
/// </summary>
public static class ScoreConflictRules
{
    /// <summary>
    /// Returns <c>true</c> when the new submission should be flagged as a conflict
    /// — i.e. a different device is submitting a different score for the same hole.
    /// </summary>
    public static bool IsConflict(
        string existingDeviceId, int existingScore,
        string newDeviceId,      int newScore)
        => existingDeviceId != newDeviceId && existingScore != newScore;
}
