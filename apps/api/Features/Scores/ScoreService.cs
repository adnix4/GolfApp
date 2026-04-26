using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.Scores;

public class ScoreService
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<ScoreService> _logger;

    public ScoreService(ApplicationDbContext db, ILogger<ScoreService> logger)
    {
        _db     = db;
        _logger = logger;
    }

    // ── SUBMIT ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Submits a score for a team/hole. Phase 1 = admin entry only (Source = AdminEntry).
    /// If a score already exists for the same team/hole:
    ///   • Same device → overwrite (admin correcting themselves)
    ///   • Different device + different value → mark IsConflicted = true
    ///   • Different device + same value → accept without conflict
    /// </summary>
    public async Task<ScoreResponse> SubmitAsync(
        Guid orgId, Guid eventId,
        SubmitScoreRequest request,
        CancellationToken ct = default)
    {
        var evt = await _db.Events
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct);

        if (evt is null)
            throw new NotFoundException("Event", eventId);

        if (evt.Status is not (EventStatus.Active or EventStatus.Scoring))
            throw new ValidationException(
                "Score entry is only available when the event is Active or Scoring.");

        if (request.HoleNumber < 1 || request.HoleNumber > evt.Holes)
            throw new ValidationException(
                $"Hole number must be between 1 and {evt.Holes} for this event.");

        var team = await _db.Teams
            .FirstOrDefaultAsync(t => t.Id == request.TeamId && t.EventId == eventId, ct);

        if (team is null)
            throw new NotFoundException("Team", request.TeamId);

        var existing = await _db.Scores
            .FirstOrDefaultAsync(s =>
                s.EventId    == eventId &&
                s.TeamId     == request.TeamId &&
                s.HoleNumber == request.HoleNumber, ct);

        Score score;

        if (existing is not null)
        {
            var sameDevice = existing.DeviceId == request.DeviceId;
            var sameValue  = existing.GrossScore == request.GrossScore;

            if (!sameDevice && !sameValue)
            {
                existing.IsConflicted = true;
                _logger.LogWarning(
                    "Score conflict on event {EventId} team {TeamId} hole {Hole}: " +
                    "device {OldDevice}={Old} vs device {NewDevice}={New}",
                    eventId, request.TeamId, request.HoleNumber,
                    existing.DeviceId, existing.GrossScore,
                    request.DeviceId, request.GrossScore);
            }
            else
            {
                existing.GrossScore   = request.GrossScore;
                existing.Putts        = request.Putts;
                existing.DeviceId     = request.DeviceId;
                existing.SubmittedAt  = DateTime.UtcNow;
                existing.IsConflicted = false;
            }

            score = existing;
        }
        else
        {
            score = new Score
            {
                Id          = Guid.NewGuid(),
                EventId     = eventId,
                TeamId      = request.TeamId,
                HoleNumber  = request.HoleNumber,
                GrossScore  = request.GrossScore,
                Putts       = request.Putts,
                DeviceId    = request.DeviceId,
                SubmittedAt = DateTime.UtcNow,
                Source      = ScoreSource.AdminEntry,
                IsConflicted = false,
            };
            _db.Scores.Add(score);
        }

        await _db.SaveChangesAsync(ct);
        return MapToScoreResponse(score, team.Name);
    }

    // ── LIST ───────────────────────────────────────────────────────────────────

    public async Task<List<ScoreResponse>> GetAllAsync(
        Guid orgId, Guid eventId, CancellationToken ct = default)
    {
        var eventExists = await _db.Events
            .AnyAsync(e => e.Id == eventId && e.OrgId == orgId, ct);

        if (!eventExists)
            throw new NotFoundException("Event", eventId);

        var scores = await _db.Scores
            .Include(s => s.Team)
            .Where(s => s.EventId == eventId)
            .OrderBy(s => s.Team.Name)
            .ThenBy(s => s.HoleNumber)
            .ToListAsync(ct);

        return scores.Select(s => MapToScoreResponse(s, s.Team.Name)).ToList();
    }

    // ── SCORECARD ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Returns all holes for the team — scored holes have a GrossScore, unscored are null.
    /// Par comes from the attached course, defaulting to 4 if no course is set.
    /// </summary>
    public async Task<ScorecardResponse> GetScorecardAsync(
        Guid orgId, Guid eventId, Guid teamId, CancellationToken ct = default)
    {
        var evt = await _db.Events
            .Include(e => e.Course)
                .ThenInclude(c => c!.Holes.OrderBy(h => h.HoleNumber))
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct);

        if (evt is null)
            throw new NotFoundException("Event", eventId);

        var team = await _db.Teams
            .FirstOrDefaultAsync(t => t.Id == teamId && t.EventId == eventId, ct);

        if (team is null)
            throw new NotFoundException("Team", teamId);

        var teamScores = await _db.Scores
            .Where(s => s.EventId == eventId && s.TeamId == teamId)
            .ToListAsync(ct);

        var parByHole = evt.Course?.Holes
            .ToDictionary(h => (int)h.HoleNumber, h => (int)h.Par)
            ?? Enumerable.Range(1, evt.Holes).ToDictionary(n => n, _ => 4);

        var scoreByHole = teamScores.ToDictionary(s => (int)s.HoleNumber);

        var holes = Enumerable.Range(1, evt.Holes).Select(n =>
        {
            scoreByHole.TryGetValue(n, out var s);
            return new ScorecardHoleEntry
            {
                HoleNumber  = (short)n,
                Par         = (short)parByHole.GetValueOrDefault(n, 4),
                GrossScore  = s?.GrossScore,
                Putts       = s?.Putts,
                HasConflict = s?.IsConflicted ?? false,
            };
        }).ToList();

        var grossTotal = teamScores.Sum(s => (int)s.GrossScore);
        var parTotal   = teamScores.Sum(s => parByHole.GetValueOrDefault(s.HoleNumber, 4));

        return new ScorecardResponse
        {
            TeamId        = teamId,
            TeamName      = team.Name,
            Holes         = holes,
            GrossTotal    = grossTotal,
            ParTotal      = parTotal,
            ToPar         = grossTotal - parTotal,
            HolesComplete = teamScores.Count,
            HasConflicts  = teamScores.Any(s => s.IsConflicted),
        };
    }

    // ── UPDATE ─────────────────────────────────────────────────────────────────

    public async Task<ScoreResponse> UpdateAsync(
        Guid orgId, Guid eventId, Guid scoreId,
        UpdateScoreRequest request, CancellationToken ct = default)
    {
        var score = await _db.Scores
            .Include(s => s.Team)
            .FirstOrDefaultAsync(s => s.Id == scoreId && s.EventId == eventId, ct);

        if (score is null)
            throw new NotFoundException("Score", scoreId);

        var eventBelongs = await _db.Events
            .AnyAsync(e => e.Id == eventId && e.OrgId == orgId, ct);

        if (!eventBelongs)
            throw new ForbiddenException();

        if (request.GrossScore.HasValue) score.GrossScore = request.GrossScore.Value;
        if (request.Putts.HasValue)      score.Putts      = request.Putts;

        // Admin correction clears any conflict flag
        score.IsConflicted = false;

        await _db.SaveChangesAsync(ct);
        return MapToScoreResponse(score, score.Team.Name);
    }

    // ── RESOLVE CONFLICT ───────────────────────────────────────────────────────

    public async Task<ScoreResponse> ResolveConflictAsync(
        Guid orgId, Guid eventId, Guid scoreId,
        ResolveConflictRequest request, CancellationToken ct = default)
    {
        var score = await _db.Scores
            .Include(s => s.Team)
            .FirstOrDefaultAsync(s =>
                s.Id      == scoreId &&
                s.EventId == eventId &&
                s.IsConflicted, ct);

        if (score is null)
            throw new NotFoundException(
                "Conflicted score not found. It may already have been resolved.");

        var eventBelongs = await _db.Events
            .AnyAsync(e => e.Id == eventId && e.OrgId == orgId, ct);

        if (!eventBelongs)
            throw new ForbiddenException();

        score.GrossScore   = request.AcceptedScore;
        score.IsConflicted = false;
        score.SubmittedAt  = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Resolved score conflict on event {EventId} team {TeamId} hole {Hole}: accepted {Score}",
            eventId, score.TeamId, score.HoleNumber, request.AcceptedScore);

        return MapToScoreResponse(score, score.Team.Name);
    }

    // ── PRIVATE ────────────────────────────────────────────────────────────────

    private static ScoreResponse MapToScoreResponse(Score s, string teamName) => new()
    {
        Id           = s.Id,
        EventId      = s.EventId,
        TeamId       = s.TeamId,
        TeamName     = teamName,
        HoleNumber   = s.HoleNumber,
        GrossScore   = s.GrossScore,
        Putts        = s.Putts,
        DeviceId     = s.DeviceId,
        SubmittedAt  = s.SubmittedAt,
        SyncedAt     = s.SyncedAt,
        Source       = s.Source.ToString(),
        IsConflicted = s.IsConflicted,
    };
}
