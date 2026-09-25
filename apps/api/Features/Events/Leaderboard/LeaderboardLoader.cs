using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Scores;

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
        EventFormat Format,
        EventStatus Status,
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
    /// total (a fourth, players, for Stroke Play) — no joins. Honours the IsConflicted filter so conflicted
    /// scores don't pollute live standings, and the CompletedAt filter so
    /// half-entered ones don't either.
    /// </summary>
    public static async Task<List<LeaderboardCalculator.StandingEntry>> LoadStandingsAsync(
        ApplicationDbContext db, EventMeta meta, CancellationToken ct)
        => (await LoadAsync(db, meta, ct)).Standings;

    /// <summary>
    /// Team standings, plus the individual board when the format is Stroke
    /// Play (U8 — Rule 3.3 scores golfers, not teams). Individuals is null for
    /// every other format.
    /// </summary>
    public sealed record Leaderboard(
        List<LeaderboardCalculator.StandingEntry>    Standings,
        List<LeaderboardCalculator.IndividualEntry>? Individuals);

    public static async Task<Leaderboard> LoadAsync(
        ApplicationDbContext db, EventMeta meta, CancellationToken ct)
    {
        var teamAnon = await db.Teams
            .AsNoTracking()
            .Where(t => t.EventId == meta.Id)
            .Select(t => new { t.Id, t.Name, t.StartingHole, t.TeeTime })
            .ToListAsync(ct);

        // CompletedAt is the "hole finished" signal (U1). The admin desk
        // transcribes a paper card stroke by stroke and each keystroke
        // auto-saves, so a hole carries a partial gross score for as long as it
        // takes to type the foursome. A half-entered hole is not a scored hole:
        // counting it would march the team's total up one stroke at a time in
        // front of every golfer watching the scoreboard. Mobile sets CompletedAt
        // on sync (it only syncs holes the golfer marked done), and the
        // U1_ScoreCompletedAt migration backfilled every pre-existing row, so
        // nothing that used to appear here disappears.
        var scoreAnon = await db.Scores
            .AsNoTracking()
            .Where(s => s.EventId == meta.Id && !s.IsConflicted && s.CompletedAt != null)
            .Select(s => new { s.TeamId, s.HoleNumber, s.GrossScore, s.PlayerShotsJson })
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
        // The per-golfer breakdown is what the non-scramble formats score (U8).
        var scores = scoreAnon
            .Select(s => new LeaderboardCalculator.ScoreRow(
                s.TeamId, s.HoleNumber, s.GrossScore,
                FormatScoring.ParseShots(s.PlayerShotsJson)))
            .ToList();

        var standings = LeaderboardCalculator.Compute(teams, scores, pars, meta.Holes, meta.Format);
        if (meta.Format != EventFormat.Stroke)
            return new Leaderboard(standings, null);

        var teamNames = teamAnon.ToDictionary(t => t.Id, t => t.Name);
        var playerAnon = await db.Players
            .AsNoTracking()
            .Where(p => p.EventId == meta.Id && p.TeamId != null)
            .Select(p => new { p.Id, p.FirstName, p.LastName, TeamId = p.TeamId!.Value })
            .ToListAsync(ct);
        var players = playerAnon
            .Where(p => teamNames.ContainsKey(p.TeamId))
            .Select(p => new LeaderboardCalculator.PlayerRow(
                p.Id, $"{p.FirstName} {p.LastName}".Trim(), p.TeamId, teamNames[p.TeamId]))
            .ToList();

        return new Leaderboard(
            standings,
            LeaderboardCalculator.ComputeIndividuals(players, scores, pars, meta.Holes));
    }
}
