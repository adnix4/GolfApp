using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.RealTime;

namespace GolfFundraiserPro.Api.Features.Mobile;

/// <summary>
/// Handles the two mobile-app-facing write endpoints:
///   • JoinAsync      — golfer identifies themselves and downloads the event_cache payload
///   • BatchSyncAsync — offline scores flushed to the server in one call
///
/// JOIN FLOW:
///   Golfer opens mobile app → scans event QR (gets event code) → enters their email.
///   We look up the player record that was pre-registered by the organizer in Phase 1.
///   If found, we return the full event_cache payload for SQLite storage.
///   The golfer does NOT create a new account — they are already in the players table.
///
/// BATCH SYNC FLOW:
///   Mobile app periodically drains its pending_scores SQLite table.
///   Each score is an upsert: same device overwrites, different device + different
///   value flags a conflict (mirrors the single-score conflict logic in ScoreService).
///   Source is set to MobileSync (vs AdminEntry for Phase 1 dashboard).
/// </summary>
public class MobileService
{
    private readonly ApplicationDbContext _db;
    private readonly RealTimeService _realTime;
    private readonly ILogger<MobileService> _logger;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public MobileService(ApplicationDbContext db, RealTimeService realTime, ILogger<MobileService> logger)
    {
        _db       = db;
        _realTime = realTime;
        _logger   = logger;
    }

    // ── ACTIVE EVENTS LIST ────────────────────────────────────────────────────

    /// <summary>
    /// Returns all tournaments currently open for golfers (Registration, Active, or Scoring).
    /// League rounds live in their own table and are never included here.
    /// Used by the mobile event picker on the join screen.
    /// </summary>
    public async Task<List<ActiveEventSummaryDto>> ListActiveEventsAsync(CancellationToken ct = default)
    {
        var openStatuses = new[] { EventStatus.Registration, EventStatus.Active, EventStatus.Scoring };

        return await _db.Events
            .Include(e => e.Organization)
            .Include(e => e.Course)
            .Where(e => openStatuses.Contains(e.Status))
            .OrderBy(e => e.StartAt)
            .Select(e => new ActiveEventSummaryDto
            {
                Id          = e.Id,
                Name        = e.Name,
                EventCode   = e.EventCode,
                Format      = e.Format.ToString(),
                Status      = e.Status.ToString(),
                StartAt     = e.StartAt,
                OrgName     = e.Organization.Name,
                CourseName  = e.Course != null ? e.Course.Name  : null,
                CourseCity  = e.Course != null ? e.Course.City  : null,
                CourseState = e.Course != null ? e.Course.State : null,
                LogoUrl     = e.LogoUrl ?? e.Organization.LogoUrl,
            })
            .ToListAsync(ct);
    }

    // ── JOIN ──────────────────────────────────────────────────────────────────

    /// <summary>
    /// Golfer joins their event on the mobile app.
    /// Looks up the player by email within the event, verifies they have a team,
    /// and returns the full event_cache payload for offline SQLite storage.
    /// </summary>
    public async Task<JoinEventResponse> JoinAsync(
        string eventCode,
        JoinEventRequest request,
        CancellationToken ct = default)
    {
        // Load the event with everything the mobile app needs
        var evt = await _db.Events
            .Include(e => e.Organization)
            .Include(e => e.Course)
                .ThenInclude(c => c!.Holes.OrderBy(h => h.HoleNumber))
            .Include(e => e.Sponsors)
            .Include(e => e.Teams)
                .ThenInclude(t => t.Players)
            .FirstOrDefaultAsync(e => e.EventCode == eventCode.ToUpperInvariant(), ct);

        if (evt is null)
            throw new NotFoundException($"No event found with code '{eventCode}'.");

        // Draft events are joinable by event code only (test/preview mode).
        // They never appear in the public active-events list, so the code acts as the gate.
        if (evt.Status is EventStatus.Cancelled)
            throw new ValidationException("This event has been cancelled.");

        if (evt.Status is EventStatus.Completed)
            throw new ValidationException("This event has already completed.");

        // Find the player by email within this event
        var player = evt.Teams
            .SelectMany(t => t.Players)
            .FirstOrDefault(p => p.Email.Equals(request.Email, StringComparison.OrdinalIgnoreCase));

        if (player is null)
            throw new NotFoundException(
                $"No registration found for '{request.Email}' in this event. " +
                "Please contact your event organizer.");

        var team = evt.Teams.FirstOrDefault(t => t.Id == player.TeamId);
        if (team is null)
            throw new ValidationException(
                "You are registered but have not yet been assigned to a team. " +
                "Please contact your event organizer.");

        _logger.LogInformation(
            "Golfer '{Email}' joined event '{Code}' on device '{Device}'",
            request.Email, eventCode, request.DeviceId);

        // Build sponsor data — map hole numbers from JSONB placements
        var sponsors = evt.Sponsors
            .Select(s => new SponsorCacheDto
            {
                Id         = s.Id,
                Name       = s.Name,
                LogoUrl    = s.LogoUrl,
                WebsiteUrl = s.WebsiteUrl,
                Tier       = s.Tier.ToString(),
                HoleNumbers = ExtractHoleNumbers(s.PlacementsJson),
            })
            .ToList();

        // Build a hole-number → sponsor lookup for annotating course holes
        var holeSponsorMap = sponsors
            .Where(s => s.HoleNumbers.Count > 0)
            .SelectMany(s => s.HoleNumbers.Select(h => (HoleNum: h, Sponsor: s)))
            .GroupBy(x => x.HoleNum)
            .ToDictionary(g => g.Key, g => g.First().Sponsor);

        return new JoinEventResponse
        {
            Event = new EventCacheDto
            {
                Id               = evt.Id,
                Name             = evt.Name,
                EventCode        = evt.EventCode,
                Format           = evt.Format.ToString(),
                StartType        = evt.StartType.ToString(),
                Holes            = evt.Holes,
                Status           = evt.Status.ToString(),
                StartAt          = evt.StartAt,
                LogoUrl          = evt.LogoUrl  ?? evt.Organization.LogoUrl,
                ThemeJson        = evt.ThemeJson ?? evt.Organization.ThemeJson,
                MissionStatement = evt.MissionStatement ?? evt.Organization.MissionStatement,
                Is501c3          = evt.Is501c3 || evt.Organization.Is501c3,
                OfflineMode      = DeserializeOfflineMode(evt.ConfigJson),
            },
            Team = new TeamCacheDto
            {
                Id           = team.Id,
                Name         = team.Name,
                StartingHole = team.StartingHole,
                TeeTime      = team.TeeTime,
                Players = team.Players.Select(p => new PlayerCacheDto
                {
                    Id        = p.Id,
                    FirstName = p.FirstName,
                    LastName  = p.LastName,
                    Email     = p.Email,
                }).ToList(),
            },
            Player = new PlayerCacheDto
            {
                Id        = player.Id,
                FirstName = player.FirstName,
                LastName  = player.LastName,
                Email     = player.Email,
            },
            Org = new OrgCacheDto
            {
                Id        = evt.Organization.Id,
                Name      = evt.Organization.Name,
                Slug      = evt.Organization.Slug,
                LogoUrl   = evt.Organization.LogoUrl,
                ThemeJson = evt.Organization.ThemeJson,
            },
            Course = evt.Course is null ? null : new CourseCacheDto
            {
                Id    = evt.Course.Id,
                Name  = evt.Course.Name,
                City  = evt.Course.City,
                State = evt.Course.State,
                Holes = evt.Course.Holes.Select(h =>
                {
                    holeSponsorMap.TryGetValue(h.HoleNumber, out var sponsor);
                    return new HoleCacheDto
                    {
                        HoleNumber    = h.HoleNumber,
                        Par           = h.Par,
                        HandicapIndex = h.HandicapIndex,
                        YardageWhite  = h.YardageWhite,
                        YardageBlue   = h.YardageBlue,
                        YardageRed    = h.YardageRed,
                        SponsorName    = sponsor?.Name,
                        SponsorLogoUrl = sponsor?.LogoUrl,
                    };
                }).ToList(),
            },
            Sponsors = sponsors,
        };
    }

    // ── BATCH SYNC ────────────────────────────────────────────────────────────

    /// <summary>
    /// Processes a batch of pending scores from the mobile app's SQLite queue.
    /// Each score is an upsert; conflict detection mirrors Phase 1 single-score logic.
    /// Partial success is intentional — the caller should retry only conflicted scores.
    /// </summary>
    public async Task<BatchSyncResponse> BatchSyncAsync(
        BatchSyncRequest request,
        CancellationToken ct = default)
    {
        var evt = await _db.Events
            .FirstOrDefaultAsync(e => e.Id == request.EventId, ct);

        if (evt is null)
            throw new NotFoundException("Event", request.EventId);

        if (evt.Status is not (EventStatus.Draft or EventStatus.Active or EventStatus.Scoring))
            throw new ValidationException(
                "Score sync is only available when the event is active or in scoring.");

        var team = await _db.Teams
            .FirstOrDefaultAsync(t =>
                t.Id == request.TeamId && t.EventId == request.EventId, ct);

        if (team is null)
            throw new NotFoundException("Team", request.TeamId);

        // Load all existing scores for this team in one query
        var existing = await _db.Scores
            .Where(s => s.EventId == request.EventId && s.TeamId == request.TeamId)
            .ToDictionaryAsync(s => (int)s.HoleNumber, ct);

        var accepted      = 0;
        var conflicts     = new List<SyncConflictDto>();
        var acceptedScores = new List<(Guid TeamId, string TeamName, short HoleNumber, short GrossScore)>();

        foreach (var pending in request.Scores)
        {
            if (pending.HoleNumber < 1 || pending.HoleNumber > evt.Holes)
                continue; // silently skip out-of-range holes

            if (existing.TryGetValue(pending.HoleNumber, out var current))
            {
                var sameDevice = current.DeviceId == request.DeviceId;
                var sameValue  = current.GrossScore == pending.GrossScore;

                if (!sameDevice && !sameValue)
                {
                    // Genuine conflict — flag it and let the admin resolve
                    current.IsConflicted = true;
                    conflicts.Add(new SyncConflictDto
                    {
                        HoleNumber       = pending.HoleNumber,
                        ExistingScore    = current.GrossScore,
                        SubmittedScore   = pending.GrossScore,
                        ExistingDeviceId = current.DeviceId,
                    });
                    _logger.LogWarning(
                        "Sync conflict: event {EventId} team {TeamId} hole {Hole} " +
                        "device {OldDev}={Old} vs {NewDev}={New}",
                        request.EventId, request.TeamId, pending.HoleNumber,
                        current.DeviceId, current.GrossScore,
                        request.DeviceId, pending.GrossScore);
                }
                else
                {
                    // Same device re-sync, or different device with same value — accept
                    current.GrossScore    = pending.GrossScore;
                    current.Putts         = pending.Putts;
                    current.DeviceId      = request.DeviceId;
                    current.PlayerShotsJson = pending.PlayerShotsJson;
                    current.SyncedAt      = DateTime.UtcNow;
                    current.IsConflicted  = false;
                    accepted++;
                    acceptedScores.Add((request.TeamId, team.Name, pending.HoleNumber, pending.GrossScore));
                }
            }
            else
            {
                _db.Scores.Add(new Score
                {
                    Id              = Guid.NewGuid(),
                    EventId         = request.EventId,
                    TeamId          = request.TeamId,
                    HoleNumber      = pending.HoleNumber,
                    GrossScore      = pending.GrossScore,
                    Putts           = pending.Putts,
                    PlayerShotsJson = pending.PlayerShotsJson,
                    DeviceId        = request.DeviceId,
                    SubmittedAt     = DateTime.UtcNow,
                    SyncedAt        = DateTime.UtcNow,
                    Source          = ScoreSource.MobileSync,
                    IsConflicted    = false,
                });
                accepted++;
                acceptedScores.Add((request.TeamId, team.Name, pending.HoleNumber, pending.GrossScore));
            }
        }

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Batch sync for team {TeamId}: {Accepted} accepted, {Conflicts} conflicts",
            request.TeamId, accepted, conflicts.Count);

        // Phase 3: push real-time update to connected leaderboard clients
        if (acceptedScores.Count > 0 && !string.IsNullOrEmpty(evt.EventCode))
        {
            await _realTime.PublishLeaderboardAsync(evt.EventCode, request.EventId, acceptedScores, ct);
        }

        return new BatchSyncResponse
        {
            Accepted        = accepted,
            Conflicts       = conflicts.Count,
            ConflictDetails = conflicts,
        };
    }

    // ── PRIVATE ───────────────────────────────────────────────────────────────

    private static List<int> ExtractHoleNumbers(string placementsJson)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(placementsJson)) return [];
            using var doc = JsonDocument.Parse(placementsJson);
            if (doc.RootElement.TryGetProperty("holeNumbers", out var arr) &&
                arr.ValueKind == JsonValueKind.Array)
            {
                return arr.EnumerateArray()
                    .Where(e => e.ValueKind == JsonValueKind.Number)
                    .Select(e => e.GetInt32())
                    .ToList();
            }
        }
        catch { /* malformed JSONB — treat as no hole numbers */ }
        return [];
    }

    private static bool DeserializeOfflineMode(string? configJson)
    {
        if (string.IsNullOrWhiteSpace(configJson)) return false;
        try
        {
            using var doc = JsonDocument.Parse(configJson);
            if (doc.RootElement.TryGetProperty("offlineMode", out var val) &&
                val.ValueKind == JsonValueKind.True)
                return true;
        }
        catch { /* ignore */ }
        return false;
    }
}
