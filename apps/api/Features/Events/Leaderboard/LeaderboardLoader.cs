using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Data;

namespace GolfFundraiserPro.Api.Features.Events.Leaderboard;

/// <summary>
/// Fetches the inputs (teams, scores, course pars) with three small projected
/// queries — never an Include() Cartesian — and feeds them to LeaderboardCalculator.
///
/// Used by the authenticated endpoint, the public endpoint, and the SignalR
/// broadcaster so all three see identical standings without duplicate code.
/// </summary>
public static class LeaderboardLoader
{
    public sealed record EventMeta(
        Guid Id,
        Guid OrgId,
        string Name,
        string EventCode,
        Domain.Enums.EventFormat Format,
        Domain.Enums.EventStatus Status,
        short Holes,
        Guid? CourseId,
        string? LogoUrl,
        string? ThemeJson);

    /// <summary>
    /// Loads event metadata used for response envelopes. Null when not found
    /// or in a status that should 404 (Draft/Cancelled for the public path).
    /// </summary>
    public static Task<EventMeta?> LoadEventAsync(
        ApplicationDbContext db, Guid eventId, CancellationToken ct) =>
        db.Events
            .AsNoTracking()
            .Where(e => e.Id == eventId)
            .Select(e => new EventMeta(
                e.Id, e.OrgId, e.Name, e.EventCode,
                e.Format, e.Status, e.Holes, e.CourseId,
                e.LogoUrl, e.ThemeJson))
            .FirstOrDefaultAsync(ct);

    public static Task<EventMeta?> LoadEventByCodeAsync(
        ApplicationDbContext db, string eventCode, CancellationToken ct) =>
        db.Events
            .AsNoTracking()
            .Where(e => e.EventCode == eventCode.ToUpperInvariant())
            .Select(e => new EventMeta(
                e.Id, e.OrgId, e.Name, e.EventCode,
                e.Format, e.Status, e.Holes, e.CourseId,
                e.LogoUrl, e.ThemeJson))
            .FirstOrDefaultAsync(ct);

    /// <summary>
    /// Loads scoring inputs and computes ranked standings. Three queries
    /// total — no joins. Honours the IsConflicted filter so conflicted
    /// scores don't pollute live standings.
    /// </summary>
    public static async Task<List<LeaderboardCalculator.StandingEntry>> LoadStandingsAsync(
        ApplicationDbContext db, EventMeta meta, CancellationToken ct)
    {
        var teamAnon = await db.Teams
            .AsNoTracking()
            .Where(t => t.EventId == meta.Id)
            .Select(t => new { t.Id, t.Name, t.StartingHole, t.TeeTime })
            .ToListAsync(ct);

        var scoreAnon = await db.Scores
            .AsNoTracking()
            .Where(s => s.EventId == meta.Id && !s.IsConflicted)
            .Select(s => new { s.TeamId, s.HoleNumber, s.GrossScore })
            .ToListAsync(ct);

        var pars = new List<LeaderboardCalculator.ParRow>();
        if (meta.CourseId.HasValue)
        {
            var parAnon = await db.CourseHoles
                .AsNoTracking()
                .Where(h => h.CourseId == meta.CourseId.Value)
                .Select(h => new { h.HoleNumber, h.Par })
                .ToListAsync(ct);
            pars = parAnon
                .Select(p => new LeaderboardCalculator.ParRow(p.HoleNumber, p.Par))
                .ToList();
        }

        var teams  = teamAnon
            .Select(t => new LeaderboardCalculator.TeamRow(t.Id, t.Name, t.StartingHole, t.TeeTime))
            .ToList();
        var scores = scoreAnon
            .Select(s => new LeaderboardCalculator.ScoreRow(s.TeamId, s.HoleNumber, s.GrossScore))
            .ToList();

        return LeaderboardCalculator.Compute(teams, scores, pars, meta.Holes, meta.Format);
    }
}
