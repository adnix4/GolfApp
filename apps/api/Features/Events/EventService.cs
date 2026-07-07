// ─────────────────────────────────────────────────────────────────────────────
// Features/Events/EventService.cs — Event Business Logic
// ─────────────────────────────────────────────────────────────────────────────
//
// KEY RESPONSIBILITIES:
//   • GenerateEventCode()    — unique 8-char alphanumeric, collision-safe
//   • CreateAsync()          — new event in Draft status
//   • GetAllAsync()          — list all events for an org
//   • GetByIdAsync()         — single event with course + counts
//   • UpdateAsync()          — partial update with status state machine
//   • AttachCourseAsync()    — create/replace course + holes
//   • AssignShotgunAsync()   — bulk assign starting holes to teams
//   • AssignTeeTimesAsync()  — bulk assign tee times to teams
//   • GetLeaderboardAsync()  — compute standings from scores
//   • GetFundraisingAsync()  — aggregate revenue totals
//   • GetPublicEventAsync()  — unauthenticated landing page data
//
// LEADERBOARD ALGORITHM (spec Phase 1 §6):
//   For each team:
//     1. Sum all gross_score values across their Score rows
//     2. Sum par for the corresponding hole numbers from the course
//     3. toPar = grossTotal - parTotal
//     4. Sort by toPar ascending (lowest = best)
//     5. Rank: ties share the same rank number
//
// EVENT CODE GENERATION:
//   8 chars from the set [A-Z0-9] = 36^8 = ~2.8 trillion combinations.
//   We check for uniqueness before returning.  Collision probability is
//   negligible until the system has ~100k events.
// ─────────────────────────────────────────────────────────────────────────────

using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Events.Leaderboard;

namespace GolfFundraiserPro.Api.Features.Events;

public class EventService
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<EventService> _logger;

    // State machine and code format are now in EventStatusRules / EventCodeRules (pure, testable).

    private readonly TestDataService _testData;
    private readonly LeaderboardCache? _leaderboardCache;

    public EventService(
        ApplicationDbContext db,
        ILogger<EventService> logger,
        TestDataService testData,
        LeaderboardCache? leaderboardCache = null)
    {
        _db               = db;
        _logger           = logger;
        _testData         = testData;
        _leaderboardCache = leaderboardCache;
    }

    // ── CREATE ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Creates a new event in Draft status for the given org.
    /// Generates a unique 8-char event code.
    /// </summary>
    public async Task<EventResponse> CreateAsync(
        Guid orgId,
        CreateEventRequest request,
        CancellationToken ct = default)
    {
        // Verify the org exists — prevents creating events for phantom orgs
        var orgExists = await _db.Organizations.AnyAsync(o => o.Id == orgId, ct);
        if (!orgExists)
            throw new NotFoundException("Organization", orgId);

        var eventCode = await GenerateUniqueEventCodeAsync(ct);

        var evt = new Event
        {
            Id         = Guid.NewGuid(),
            OrgId      = orgId,
            Name       = request.Name,
            EventCode  = eventCode,
            Format     = request.Format,
            StartType  = request.StartType,
            Holes      = request.Holes,
            Status     = EventStatus.Draft,
            StartAt    = request.StartAt,
            ConfigJson = request.Config is null
                ? "{}"
                : JsonSerializer.Serialize(request.Config,
                    new JsonSerializerOptions { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull }),
        };

        _db.Events.Add(evt);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Created event '{Name}' (code: {Code}) for org {OrgId}",
            evt.Name, evt.EventCode, orgId);

        return await GetByIdAsync(orgId, evt.Id, ct);
    }

    // ── LIST ──────────────────────────────────────────────────────────────────

    /// <summary>
    /// Returns all events for the given org, sorted by StartAt descending
    /// (most recent/upcoming first), with basic team counts.
    /// </summary>
    public async Task<List<EventSummaryResponse>> GetAllAsync(
        Guid orgId,
        CancellationToken ct = default)
    {
        var events = await _db.Events
            .Where(e => e.OrgId == orgId)
            .OrderByDescending(e => e.StartAt)
            .Select(e => new EventSummaryResponse
            {
                Id        = e.Id,
                Name      = e.Name,
                EventCode = e.EventCode,
                Format    = e.Format.ToString(),
                Status    = e.Status.ToString(),
                StartAt   = e.StartAt,
                TeamCount = e.Teams.Count,
            })
            .ToListAsync(ct);

        return events;
    }

    // ── GET BY ID ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Returns full event detail including course and dashboard counts.
    /// Throws NotFoundException if the event doesn't belong to this org.
    /// </summary>
    public async Task<EventResponse> GetByIdAsync(
        Guid orgId,
        Guid eventId,
        CancellationToken ct = default)
    {
        // Teams/Players/Scores are deliberately NOT included: combined with
        // Course.Holes they turn into a single cartesian JOIN (EF multi-
        // collection include, no split query) whose row count is the product
        // of the collections. The dashboard only needs four counts — computed
        // DB-side by LoadCountsAsync instead.
        var evt = await _db.Events
            .AsNoTracking()
            .Include(e => e.Course)
                .ThenInclude(c => c!.Holes.OrderBy(h => h.HoleNumber))
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct);

        if (evt is null)
            throw new NotFoundException("Event", eventId);

        var counts  = await LoadCountsAsync(eventId, ct);
        var summary = await _testData.GetSummaryAsync(orgId, eventId, ct);

        return MapToEventResponse(evt, counts, summary);
    }

    // ── UPDATE ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Partial update — only non-null fields are applied.
    /// Status transitions are validated against the state machine.
    /// Config is deep-merged (only provided keys overwrite existing values).
    /// </summary>
    public async Task<EventResponse> UpdateAsync(
        Guid orgId,
        Guid eventId,
        UpdateEventRequest request,
        CancellationToken ct = default)
    {
        // Course.Holes is needed for the response; team/player/score counts
        // are computed DB-side after the save (avoids the cartesian include).
        var evt = await _db.Events
            .Include(e => e.Course)
                .ThenInclude(c => c!.Holes)
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct);

        if (evt is null)
            throw new NotFoundException("Event", eventId);

        // ── APPLY SCALAR FIELDS ───────────────────────────────────────────
        if (request.Name     is not null) evt.Name      = request.Name;
        if (request.Format   is not null) evt.Format    = request.Format.Value;
        if (request.StartType is not null) evt.StartType = request.StartType.Value;
        if (request.Holes    is not null) evt.Holes     = request.Holes.Value;
        if (request.StartAt  is not null) evt.StartAt   = request.StartAt;

        // ── STATUS TRANSITION ─────────────────────────────────────────────
        if (request.Status is not null && request.Status != evt.Status)
        {
            ValidateStatusTransition(evt.Status, request.Status.Value, evt);

            // Draft → Registration: auto-clear test registration + scoring data.
            // (Counts are queried fresh after SaveChanges, so no collection
            // reload is needed here.)
            if (request.Status.Value == EventStatus.Registration)
            {
                await _testData.ClearRegistrationAndScoringAsync(orgId, eventId, ct);
            }

            evt.Status = request.Status.Value;
            _logger.LogInformation(
                "Event {Id} transitioned to {Status}", eventId, request.Status);
        }

        // ── CONFIG DEEP MERGE ─────────────────────────────────────────────
        if (request.Config is not null)
        {
            // Read existing config, merge new values, write back
            var existing = DeserializeConfig(evt.ConfigJson);
            MergeConfig(existing, request.Config);
            evt.ConfigJson = JsonSerializer.Serialize(existing);
        }

        await _db.SaveChangesAsync(ct);
        var counts        = await LoadCountsAsync(eventId, ct);
        var updateSummary = await _testData.GetSummaryAsync(orgId, eventId, ct);
        return MapToEventResponse(evt, counts, updateSummary);
    }

    // ── ATTACH COURSE ─────────────────────────────────────────────────────────

    /// <summary>
    /// Creates or replaces the course attached to an event.
    /// If a course already exists on the event, it is replaced.
    /// Hole count must match event.Holes (9 or 18).
    /// </summary>
    public async Task<EventResponse> AttachCourseAsync(
        Guid orgId,
        Guid eventId,
        AttachCourseRequest request,
        CancellationToken ct = default)
    {
        var evt = await _db.Events
            .Include(e => e.Course)
                .ThenInclude(c => c!.Holes)
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct);

        if (evt is null)
            throw new NotFoundException("Event", eventId);

        // Validate hole count matches event configuration
        if (request.Holes is not null && request.Holes.Count != evt.Holes)
        {
            throw new ValidationException(
                $"This event has {evt.Holes} holes but {request.Holes.Count} " +
                $"hole definitions were provided. They must match.");
        }

        // Remove old course if present
        if (evt.CourseId.HasValue && evt.Course is not null)
        {
            _db.CourseHoles.RemoveRange(evt.Course.Holes);
            _db.Courses.Remove(evt.Course);
        }

        // Build the new course
        var course = new Course
        {
            Id      = Guid.NewGuid(),
            OrgId   = orgId,
            Name    = request.Name,
            Address = request.Address,
            City    = request.City,
            State   = request.State,
            Zip     = request.Zip,
        };

        // Build holes — use provided data or generate placeholder holes
        var holeCount = evt.Holes;
        var holes = Enumerable.Range(1, holeCount).Select(n =>
        {
            var provided = request.Holes?.FirstOrDefault(h => h.HoleNumber == n);
            return new CourseHole
            {
                Id            = Guid.NewGuid(),
                CourseId      = course.Id,
                HoleNumber    = (short)n,
                Par           = provided?.Par           ?? 4,
                HandicapIndex = provided?.HandicapIndex ?? (short)n,
                YardageWhite  = provided?.YardageWhite,
                YardageBlue   = provided?.YardageBlue,
                YardageRed    = provided?.YardageRed,
            };
        }).ToList();

        course.Holes = holes;
        _db.Courses.Add(course);

        evt.CourseId = course.Id;
        evt.Course   = course;

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Attached course '{CourseName}' to event {EventId}",
            course.Name, eventId);

        return MapToEventResponse(evt, await LoadCountsAsync(eventId, ct));
    }

    /// <summary>
    /// Updates the attached course's identity fields (name/address/city/state/zip)
    /// in place. Unlike AttachCourseAsync this never touches holes, so pars,
    /// handicap indexes, and yardages survive an address correction.
    /// </summary>
    public async Task<EventResponse> UpdateCourseAsync(
        Guid orgId,
        Guid eventId,
        UpdateCourseRequest request,
        CancellationToken ct = default)
    {
        var evt = await _db.Events
            .Include(e => e.Course)
                .ThenInclude(c => c!.Holes)
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct)
            ?? throw new NotFoundException("Event", eventId);

        if (evt.Course is null)
            throw new ValidationException("This event has no course attached yet. Attach a course first.");

        evt.Course.Name    = request.Name.Trim();
        evt.Course.Address = request.Address.Trim();
        evt.Course.City    = request.City.Trim();
        evt.Course.State   = request.State.Trim();
        evt.Course.Zip     = request.Zip.Trim();

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Updated course '{CourseName}' on event {EventId}", evt.Course.Name, eventId);

        return MapToEventResponse(evt, await LoadCountsAsync(eventId, ct));
    }

    // ── SHOTGUN ASSIGNMENTS ───────────────────────────────────────────────────

    /// <summary>
    /// Assigns starting holes to teams for a shotgun-start event.
    /// All provided team IDs must belong to this event.
    /// </summary>
    public async Task AssignShotgunAsync(
        Guid orgId,
        Guid eventId,
        ShotgunAssignmentsRequest request,
        CancellationToken ct = default)
    {
        var evt = await _db.Events
            .Include(e => e.Teams)
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct);

        if (evt is null)
            throw new NotFoundException("Event", eventId);

        if (evt.StartType != EventStartType.Shotgun)
            throw new ValidationException(
                "Shotgun assignments can only be set on Shotgun-start events.");

        // Validate all team IDs belong to this event
        var eventTeamIds = evt.Teams.Select(t => t.Id).ToHashSet();
        var unknownTeams = request.Assignments
            .Where(a => !eventTeamIds.Contains(a.TeamId))
            .Select(a => a.TeamId)
            .ToList();

        if (unknownTeams.Any())
            throw new ValidationException(
                $"The following team IDs do not belong to this event: " +
                $"{string.Join(", ", unknownTeams)}");

        // Apply assignments
        var assignmentMap = request.Assignments.ToDictionary(a => a.TeamId, a => a.StartingHole);
        foreach (var team in evt.Teams.Where(t => assignmentMap.ContainsKey(t.Id)))
        {
            team.StartingHole = assignmentMap[team.Id];
            team.TeeTime      = null; // clear tee time if switching to shotgun
        }

        await _db.SaveChangesAsync(ct);
        _logger.LogInformation(
            "Applied {Count} shotgun assignments for event {EventId}",
            request.Assignments.Count, eventId);
    }

    // ── TEE TIMES ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Assigns tee times to teams for a tee_times-start event.
    /// </summary>
    public async Task AssignTeeTimesAsync(
        Guid orgId,
        Guid eventId,
        TeeTimesRequest request,
        CancellationToken ct = default)
    {
        var evt = await _db.Events
            .Include(e => e.Teams)
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct);

        if (evt is null)
            throw new NotFoundException("Event", eventId);

        if (evt.StartType != EventStartType.TeeTimes)
            throw new ValidationException(
                "Tee times can only be set on TeeTimes-start events.");

        var eventTeamIds = evt.Teams.Select(t => t.Id).ToHashSet();
        var unknownTeams = request.Assignments
            .Where(a => !eventTeamIds.Contains(a.TeamId))
            .Select(a => a.TeamId)
            .ToList();

        if (unknownTeams.Any())
            throw new ValidationException(
                $"The following team IDs do not belong to this event: " +
                $"{string.Join(", ", unknownTeams)}");

        var assignmentMap = request.Assignments.ToDictionary(a => a.TeamId, a => a.TeeTime);
        foreach (var team in evt.Teams.Where(t => assignmentMap.ContainsKey(t.Id)))
        {
            team.TeeTime      = assignmentMap[team.Id];
            team.StartingHole = null; // clear shotgun hole if switching to tee times
        }

        await _db.SaveChangesAsync(ct);
        _logger.LogInformation(
            "Applied {Count} tee time assignments for event {EventId}",
            request.Assignments.Count, eventId);
    }

    // ── LEADERBOARD ───────────────────────────────────────────────────────────

    /// <summary>
    /// Computes the leaderboard from raw score rows, respecting the event format.
    ///
    /// Stroke / Scramble / BestBall:  sort by ToPar ASC (lowest = best).
    /// Stableford:  sort by StablefordPoints DESC (highest = best).
    ///   Points per hole = max(0, par − gross + 2)
    ///   Double bogey or worse = 0 · Bogey = 1 · Par = 2 · Birdie = 3 · Eagle = 4 · Albatross = 5
    /// </summary>
    public async Task<List<LeaderboardEntryResponse>> GetLeaderboardAsync(
        Guid orgId,
        Guid eventId,
        CancellationToken ct = default)
    {
        var meta = await LeaderboardLoader.LoadEventAsync(_db, eventId, ct);
        if (meta is null || meta.OrgId != orgId)
            throw new NotFoundException("Event", eventId);

        var standings = await LeaderboardLoader.LoadStandingsAsync(_db, meta, ct);

        return standings.Select(s => new LeaderboardEntryResponse
        {
            Rank             = s.Rank,
            TeamId           = s.TeamId,
            TeamName         = s.TeamName,
            ToPar            = s.ToPar,
            GrossTotal       = s.GrossTotal,
            StablefordPoints = s.StablefordPoints,
            HolesComplete    = s.HolesComplete,
            IsComplete       = s.IsComplete,
            StartingHole     = s.StartingHole,
            TeeTime          = s.TeeTime,
            StrokesBack      = s.StrokesBack,
            BestHole         = s.BestHole,
            BestHoleScore    = s.BestHoleScore,
        }).ToList();
    }

    // ── FUNDRAISING ───────────────────────────────────────────────────────────

    /// <summary>
    /// Aggregates all revenue streams for the fundraising thermometer.
    /// </summary>
    public async Task<FundraisingResponse> GetFundraisingAsync(
        Guid orgId,
        Guid eventId,
        CancellationToken ct = default)
    {
        var evt = await _db.Events
            .Include(e => e.Teams).ThenInclude(t => t.Players)
            .Include(e => e.Donations)
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct);

        if (evt is null)
            throw new NotFoundException("Event", eventId);

        // Entry fees are per golfer — sum what each player actually paid (free
        // agents included), so totals stay right even if the fee changes later.
        var allPlayers   = await _db.Players
            .Where(p => p.EventId == eventId)
            .Select(p => p.EntryFeePaidCents)
            .ToListAsync(ct);
        var entryTotal   = allPlayers.Sum();
        var playersPaid  = allPlayers.Count(c => c > 0);
        var teamsPaid    = evt.Teams.Count(t =>
            t.EntryFeePaid || (t.Players.Count > 0 && t.Players.All(p => p.EntryFeePaidCents > 0)));
        var donationTotal = evt.Donations.Sum(d => d.AmountCents);

        var sponsorTotal = await _db.Sponsors
            .Where(s => s.EventId == eventId)
            .SumAsync(s => (int)(s.DonationAmountCents ?? 0), ct);

        var challengeTotal = await _db.HoleChallenges
            .Where(c => c.EventId == eventId)
            .SumAsync(c => (int)(c.DonationAmountCents ?? 0), ct);

        return new FundraisingResponse
        {
            EntryFeesCents       = entryTotal,
            DonationsCents       = donationTotal,
            SponsorAmountCents   = sponsorTotal,
            ChallengeAmountCents = challengeTotal,
            GrandTotalCents      = entryTotal + donationTotal + sponsorTotal + challengeTotal,
            TeamsPaid            = teamsPaid,
            TeamsTotal           = evt.Teams.Count,
            PlayersPaid          = playersPaid,
            PlayersTotal         = allPlayers.Count,
            DonationCount        = evt.Donations.Count,
        };
    }

    // ── EVENT BRANDING ────────────────────────────────────────────────────────

    /// <summary>
    /// Updates per-event logo, colors, mission statement, and 501(c)(3) flag.
    /// Null fields in the request are left unchanged.
    /// Empty string for string fields clears the override (reverts to org default).
    /// </summary>
    public async Task<EventResponse> UpdateBrandingAsync(
        Guid orgId,
        Guid eventId,
        UpdateEventBrandingRequest request,
        CancellationToken ct = default)
    {
        // Branding only touches scalar columns; Course.Holes is loaded solely
        // for the response mapping. Counts come from LoadCountsAsync.
        var evt = await _db.Events
            .Include(e => e.Course).ThenInclude(c => c!.Holes)
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct)
            ?? throw new NotFoundException("Event", eventId);

        if (request.LogoUrl is not null)
            evt.LogoUrl = string.IsNullOrWhiteSpace(request.LogoUrl) ? null : request.LogoUrl.Trim();

        if (request.ThemeJson is not null)
        {
            if (string.IsNullOrWhiteSpace(request.ThemeJson))
            {
                evt.ThemeJson = null; // clear override → revert to org theme
            }
            else
            {
                // Same gate as the org theme save: WCAG contrast + light surface.
                ThemeValidation.Validate(request.ThemeJson);
                evt.ThemeJson = request.ThemeJson;
            }
        }

        if (request.MissionStatement is not null)
            evt.MissionStatement = string.IsNullOrWhiteSpace(request.MissionStatement)
                ? null : request.MissionStatement.Trim();

        if (request.Is501c3.HasValue)
            evt.Is501c3 = request.Is501c3.Value;

        await _db.SaveChangesAsync(ct);
        return MapToEventResponse(evt, await LoadCountsAsync(eventId, ct));
    }

    private static readonly long    MaxLogoBytes       = 2 * 1024 * 1024;
    private static readonly string[] AllowedImageTypes = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

    /// <summary>
    /// Saves an uploaded logo for an event via IFileStorage.
    /// Returns the stored URL (/uploads/event-logos/… locally, absolute on blob storage).
    /// </summary>
    public async Task<string> UploadEventLogoAsync(
        Guid orgId, Guid eventId, IFormFile file,
        Common.Storage.IFileStorage storage, CancellationToken ct = default)
    {
        if (file.Length == 0)
            throw new ValidationException("Uploaded file is empty.");
        if (file.Length > MaxLogoBytes)
            throw new ValidationException("Logo must be 2 MB or smaller.");
        if (!AllowedImageTypes.Contains(file.ContentType.ToLowerInvariant()))
            throw new ValidationException("Logo must be PNG, JPEG, SVG, or WebP.");

        var evt = await _db.Events
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct)
            ?? throw new NotFoundException("Event", eventId);

        var ext      = Path.GetExtension(file.FileName).ToLowerInvariant();
        // Versioned filename → unique URL per upload → immutable-cacheable.
        // The replaced file is deleted after the new one is saved and referenced.
        var filename = $"{eventId}-{DateTime.UtcNow.Ticks}{ext}";
        await using var stream = file.OpenReadStream();
        var url = await storage.SaveAsync("event-logos", filename, stream, file.ContentType, ct: ct);

        var previousUrl = evt.LogoUrl;
        evt.LogoUrl = url;
        await _db.SaveChangesAsync(ct);
        await storage.DeleteAsync(previousUrl, ct);
        return url;
    }

    // ── PUBLIC LANDING PAGE ───────────────────────────────────────────────────

    /// <summary>
    /// Returns public (unauthenticated) event data for the landing page.
    /// Looked up by eventCode (from QR), not by internal UUID.
    /// Only visible fields are returned — no financial details, no player emails.
    /// </summary>
    public async Task<PublicEventResponse> GetPublicEventAsync(
        string eventCode,
        CancellationToken ct = default)
    {
        // Hottest anonymous endpoint (every landing view + web SSR + mobile
        // polls). One untracked projection: the team count and donation sum
        // are computed by the database, and sponsors come back as narrow rows
        // instead of Include()-ing three collections (a cartesian JOIN).
        var evt = await _db.Events
            .AsNoTracking()
            .Where(e => e.EventCode == eventCode.ToUpperInvariant())
            .Select(e => new
            {
                e.Id, e.Name, e.EventCode, e.Format, e.Status, e.StartAt, e.ConfigJson,
                e.LogoUrl, e.ThemeJson, e.MissionStatement, e.Is501c3, e.SponsorsVersion,
                OrgName      = e.Organization.Name,
                OrgSlug      = e.Organization.Slug,
                OrgLogoUrl   = e.Organization.LogoUrl,
                OrgThemeJson = e.Organization.ThemeJson,
                OrgMission   = e.Organization.MissionStatement,
                OrgIs501c3   = e.Organization.Is501c3,
                Course       = e.Course == null ? null : new PublicCourseInfo
                {
                    Name  = e.Course.Name,
                    City  = e.Course.City,
                    State = e.Course.State,
                },
                TeamCount      = e.Teams.Count(),
                DonationsCents = e.Donations.Sum(d => (int?)d.AmountCents) ?? 0,
                Sponsors       = e.Sponsors
                    .Select(s => new { s.Name, s.LogoUrl, s.Tagline, s.Tier, s.PlacementsJson })
                    .ToList(),
            })
            .FirstOrDefaultAsync(ct);

        if (evt is null)
            throw new NotFoundException($"No event found with code '{eventCode}'.");

        // Only show events that are publicly visible
        if (evt.Status == EventStatus.Draft || evt.Status == EventStatus.Cancelled)
            throw new NotFoundException($"No event found with code '{eventCode}'.");

        var config   = DeserializeConfig(evt.ConfigJson);
        var maxTeams = config.MaxTeams;

        // Landing-page sponsors: only those with landingPage placement.
        // (PlacementsJson is parsed in memory — not translatable to SQL.)
        var landingSponsors = evt.Sponsors
            .Where(s => IsLandingPageSponsor(s.PlacementsJson))
            .OrderBy(s => s.Tier)
            .Select(s => new PublicSponsorInfo
            {
                Name    = s.Name,
                LogoUrl = s.LogoUrl,
                Tagline = s.Tagline,
                Tier    = s.Tier.ToString(),
            })
            .ToList();

        return new PublicEventResponse
        {
            Id         = evt.Id,
            Name       = evt.Name,
            EventCode  = evt.EventCode,
            OrgName    = evt.OrgName,
            OrgSlug    = evt.OrgSlug,
            Format     = evt.Format.ToString(),
            Status     = evt.Status.ToString(),
            StartAt    = evt.StartAt,
            SpotsRemaining = maxTeams.HasValue ? Math.Max(0, maxTeams.Value - evt.TeamCount) : null,
            // Surface 0 / unset as null so clients render one "free" state.
            EntryFeeCents = config.EntryFeeCents is > 0 ? config.EntryFeeCents : null,
            Course      = evt.Course,
            Sponsors    = landingSponsors,
            Fundraising = new PublicFundraisingInfo
            {
                DonationsCents  = evt.DonationsCents,
                GrandTotalCents = evt.DonationsCents,
            },
            FreeAgentEnabled = config.FreeAgentEnabled ?? false,
            // Resolved branding: event value wins, org value as fallback
            ResolvedLogoUrl   = evt.LogoUrl   ?? evt.OrgLogoUrl,
            ResolvedThemeJson = evt.ThemeJson  ?? evt.OrgThemeJson,
            MissionStatement  = evt.MissionStatement ?? evt.OrgMission,
            Is501c3           = evt.Is501c3 || evt.OrgIs501c3,
            SponsorsVersion   = evt.SponsorsVersion,
        };
    }

    /// <summary>
    /// Lightweight status/theme/sponsor-version read for mobile poll loops.
    /// One single-row untracked projection — devices poll this every 5–60 s,
    /// so it must never touch the landing page's collection loads.
    /// Deliberately visible for ALL statuses (incl. Draft test mode and
    /// Cancelled) so a device can follow the event lifecycle; it exposes no
    /// roster, sponsor, or financial data.
    /// </summary>
    public async Task<PublicEventStatusResponse> GetPublicEventStatusAsync(
        string eventCode,
        CancellationToken ct = default)
    {
        var row = await _db.Events
            .AsNoTracking()
            .Where(e => e.EventCode == eventCode.ToUpperInvariant())
            .Select(e => new
            {
                e.Status,
                e.ThemeJson,
                OrgThemeJson = e.Organization.ThemeJson,
                e.SponsorsVersion,
            })
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException($"No event found with code '{eventCode}'.");

        return new PublicEventStatusResponse
        {
            Status            = row.Status.ToString(),
            ResolvedThemeJson = row.ThemeJson ?? row.OrgThemeJson,
            SponsorsVersion   = row.SponsorsVersion,
        };
    }

    // ── PUBLIC LEADERBOARD ────────────────────────────────────────────────────

    /// <summary>
    /// Returns the public leaderboard looked up by event code.
    /// No auth required. Hidden fields (emails, financials) are excluded.
    /// 404 for Draft and Cancelled events.
    /// </summary>
    public async Task<PublicLeaderboardResponse> GetPublicLeaderboardAsync(
        string eventCode,
        CancellationToken ct = default)
    {
        // Spec §3 Phase 3: 2 s Redis read-through absorbs shotgun-burst load.
        // On a cache hit we skip DB entirely.
        if (_leaderboardCache is not null)
        {
            var cachedJson = await _leaderboardCache.GetPublicAsync(eventCode);
            if (cachedJson is not null)
            {
                var cached = JsonSerializer.Deserialize<PublicLeaderboardResponse>(cachedJson);
                if (cached is not null) return cached;
            }
        }

        var meta = await LeaderboardLoader.LoadEventByCodeAsync(_db, eventCode, ct);
        if (meta is null || meta.Status is EventStatus.Draft or EventStatus.Cancelled)
            throw new NotFoundException($"No event found with code '{eventCode}'.");

        var standings = await LeaderboardLoader.LoadStandingsAsync(_db, meta, ct);

        // Org branding fallback for resolved fields — single projected query, no joins.
        var org = await _db.Organizations
            .AsNoTracking()
            .Where(o => o.Id == meta.OrgId)
            .Select(o => new { o.Name, o.LogoUrl, o.ThemeJson })
            .FirstOrDefaultAsync(ct);

        var response = new PublicLeaderboardResponse
        {
            EventId   = meta.Id,
            EventName = meta.Name,
            Format    = meta.Format.ToString(),
            Status    = meta.Status.ToString(),
            Standings = standings.Select(s => new PublicLeaderboardEntry
            {
                Rank             = s.Rank,
                TeamId           = s.TeamId,
                TeamName         = s.TeamName,
                ToPar            = s.ToPar,
                GrossTotal       = s.GrossTotal,
                StablefordPoints = s.StablefordPoints,
                HolesComplete    = s.HolesComplete,
                IsComplete       = s.IsComplete,
                StrokesBack      = s.StrokesBack,
                BestHole         = s.BestHole,
                BestHoleScore    = s.BestHoleScore,
            }).ToList(),
            ResolvedLogoUrl   = meta.LogoUrl   ?? org?.LogoUrl,
            ResolvedThemeJson = meta.ThemeJson ?? org?.ThemeJson,
            OrgName           = org?.Name,
        };

        if (_leaderboardCache is not null)
        {
            var json = JsonSerializer.Serialize(response);
            await _leaderboardCache.SetPublicAsync(eventCode, json);
        }

        return response;
    }

    // ── PUBLIC CHALLENGES ─────────────────────────────────────────────────────

    /// <summary>
    /// Returns all hole challenges and their recorded results for a public live view.
    /// No auth required. 404 for Draft and Cancelled events.
    /// </summary>
    public async Task<PublicChallengesResponse> GetPublicChallengesAsync(
        string eventCode,
        CancellationToken ct = default)
    {
        var evt = await _db.Events
            .Include(e => e.HoleChallenges)
                .ThenInclude(c => c.Sponsor)
            .Include(e => e.HoleChallenges)
                .ThenInclude(c => c.Results)
                    .ThenInclude(r => r.Team)
            .FirstOrDefaultAsync(e => e.EventCode == eventCode.ToUpperInvariant(), ct);

        if (evt is null || evt.Status is EventStatus.Draft or EventStatus.Cancelled)
            throw new NotFoundException($"No event found with code '{eventCode}'.");

        var challenges = evt.HoleChallenges
            .OrderBy(c => c.HoleNumber ?? 99)
            .Select(c => new PublicChallengeDto
            {
                Id               = c.Id,
                ChallengeType    = c.ChallengeType.ToString(),
                HoleNumber       = c.HoleNumber,
                Description      = c.Description,
                PrizeDescription = c.PrizeDescription,
                SponsorName      = c.Sponsor?.Name,
                SponsorLogoUrl   = c.Sponsor?.LogoUrl,
                Results = c.Results
                    .OrderBy(r => r.RecordedAt)
                    .Select(r => new PublicChallengeResultDto
                    {
                        TeamName  = r.Team.Name,
                        Value     = r.ResultValue,
                        Notes     = r.ResultNotes,
                    })
                    .ToList(),
            })
            .ToList();

        return new PublicChallengesResponse { Challenges = challenges };
    }

    // ── PUBLIC SPONSORS ───────────────────────────────────────────────────────

    /// <summary>
    /// Public sponsor list for the mobile scorer, keyed by event code. Mirrors
    /// the sponsor cache built at /join so a client can refetch after a
    /// SponsorsChanged signal and swap it in place. No auth required.
    /// 404 for Draft and Cancelled events.
    /// </summary>
    public async Task<PublicSponsorsResponse> GetPublicSponsorsAsync(
        string eventCode,
        CancellationToken ct = default)
    {
        var evt = await _db.Events
            .Include(e => e.Sponsors)
            .FirstOrDefaultAsync(e => e.EventCode == eventCode.ToUpperInvariant(), ct);

        if (evt is null || evt.Status is EventStatus.Draft or EventStatus.Cancelled)
            throw new NotFoundException($"No event found with code '{eventCode}'.");

        var sponsors = evt.Sponsors
            .OrderBy(s => s.Tier)
            .ThenBy(s => s.Name)
            .Select(s => new PublicScorecardSponsorDto
            {
                Id          = s.Id,
                Name        = s.Name,
                LogoUrl     = s.LogoUrl,
                WebsiteUrl  = s.WebsiteUrl,
                Tagline     = s.Tagline,
                Tier        = s.Tier.ToString(),
                HoleNumbers = ExtractHoleNumbers(s.PlacementsJson),
            })
            .ToList();

        return new PublicSponsorsResponse
        {
            SponsorsVersion = evt.SponsorsVersion,
            Sponsors        = sponsors,
        };
    }

    // ── PUBLIC FUNDRAISING ────────────────────────────────────────────────────

    /// <summary>
    /// Returns public fundraising totals (donations + entry fees).
    /// No auth required. No individual donor details included.
    /// 404 for Draft and Cancelled events.
    /// </summary>
    public async Task<PublicFundraisingInfo> GetPublicFundraisingAsync(
        string eventCode,
        CancellationToken ct = default)
    {
        var evt = await _db.Events
            .Include(e => e.Donations)
            .FirstOrDefaultAsync(e => e.EventCode == eventCode.ToUpperInvariant(), ct);

        if (evt is null || evt.Status is EventStatus.Draft or EventStatus.Cancelled)
            throw new NotFoundException($"No event found with code '{eventCode}'.");

        // Per-golfer entry fees: sum what each registered player actually paid.
        var entryTotal  = await _db.Players
            .Where(p => p.EventId == evt.Id)
            .SumAsync(p => p.EntryFeePaidCents, ct);
        var donTotal    = evt.Donations.Sum(d => d.AmountCents);

        return new PublicFundraisingInfo
        {
            DonationsCents  = donTotal,
            GrandTotalCents = entryTotal + donTotal,
        };
    }

    // ── PUBLIC DONATE ─────────────────────────────────────────────────────────

    /// <summary>
    /// Records a public donation for an event (no Stripe — manual/pledge flow).
    /// Available for Registration, Active, Scoring, and Completed events.
    /// 404 for Draft and Cancelled events.
    /// </summary>
    public async Task<PublicDonateResponse> SubmitPublicDonationAsync(
        string eventCode,
        PublicDonateRequest request,
        CancellationToken ct = default)
    {
        var evt = await _db.Events
            .FirstOrDefaultAsync(e => e.EventCode == eventCode.ToUpperInvariant(), ct);

        if (evt is null || evt.Status is EventStatus.Draft or EventStatus.Cancelled)
            throw new NotFoundException($"No event found with code '{eventCode}'.");

        var donation = new GolfFundraiserPro.Api.Domain.Entities.Donation
        {
            Id          = Guid.NewGuid(),
            EventId     = evt.Id,
            DonorName   = request.DonorName,
            DonorEmail  = request.DonorEmail,
            AmountCents = request.AmountCents,
            IsTest      = evt.IsTestMode,
        };

        _db.Donations.Add(donation);
        await _db.SaveChangesAsync(ct);

        return new PublicDonateResponse
        {
            Id          = donation.Id,
            AmountCents = donation.AmountCents,
            Message     = $"Thank you, {request.DonorName}! Your donation of {donation.AmountCents / 100m:C} has been recorded.",
        };
    }

    // ── PRIVATE HELPERS ───────────────────────────────────────────────────────

    /// <summary>
    /// Generates a unique 8-character alphanumeric event code.
    /// Retries up to 5 times on collision (astronomically rare in practice).
    /// </summary>
    private async Task<string> GenerateUniqueEventCodeAsync(CancellationToken ct)
    {
        for (int attempt = 0; attempt < 5; attempt++)
        {
            var code = GenerateEventCode();
            var exists = await _db.Events.AnyAsync(e => e.EventCode == code, ct);
            if (!exists) return code;
        }
        throw new InvalidOperationException(
            "Failed to generate a unique event code after 5 attempts.");
    }

    private static string GenerateEventCode() => EventCodeRules.Generate();

    /// <summary>
    /// Validates a status transition against the state machine.
    /// Also enforces prerequisite checks (e.g. must have a start time before
    /// transitioning to Registration).
    /// </summary>
    private static void ValidateStatusTransition(
        EventStatus current,
        EventStatus next,
        Event evt)
    {
        if (!EventStatusRules.CanTransition(current, next))
        {
            throw new ValidationException(
                $"Cannot transition event from '{current}' to '{next}'. " +
                $"Valid transitions from '{current}': " +
                $"{string.Join(", ", EventStatusRules.AllowedNext(current))}.");
        }

        // Prerequisite: must have a start time before opening registration
        if (next == EventStatus.Registration && !evt.StartAt.HasValue)
        {
            throw new ValidationException(
                "A StartAt date and time is required before opening registration.");
        }

        // Prerequisite: must have a course before going Active
        if (next == EventStatus.Active && !evt.CourseId.HasValue)
        {
            throw new ValidationException(
                "A course must be attached before the event can go Active.");
        }
    }

    /// <summary>
    /// Deserializes the events.config JSONB string into a typed EventConfigDto.
    /// Returns an empty config on null/invalid JSON.
    /// </summary>
    private static EventConfigDto DeserializeConfig(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new EventConfigDto();
        try
        {
            return JsonSerializer.Deserialize<EventConfigDto>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? new EventConfigDto();
        }
        catch
        {
            return new EventConfigDto();
        }
    }

    /// <summary>
    /// Merges non-null fields from the update DTO into the existing config.
    /// Only provided fields overwrite — others are left unchanged.
    /// </summary>
    private static void MergeConfig(EventConfigDto existing, EventConfigDto update)
    {
        if (update.AllowWalkUps.HasValue)      existing.AllowWalkUps      = update.AllowWalkUps;
        if (update.MaxTeams.HasValue)          existing.MaxTeams          = update.MaxTeams;
        if (update.TeeIntervalMinutes.HasValue) existing.TeeIntervalMinutes = update.TeeIntervalMinutes;
        if (update.FreeAgentEnabled.HasValue)  existing.FreeAgentEnabled  = update.FreeAgentEnabled;
        if (update.EntryFeeCents.HasValue)     existing.EntryFeeCents     = update.EntryFeeCents;
        if (update.ThemeOverride is not null)  existing.ThemeOverride     = update.ThemeOverride;
        if (update.OfflineMode.HasValue)       existing.OfflineMode       = update.OfflineMode;
    }

    /// <summary>
    /// Checks whether a sponsor's placements JSON includes landingPage = true.
    /// </summary>
    private static bool IsLandingPageSponsor(string placementsJson)
    {
        try
        {
            var doc = JsonDocument.Parse(placementsJson);
            return doc.RootElement.TryGetProperty("landingPage", out var v) &&
                   v.GetBoolean();
        }
        catch { return false; }
    }

    /// <summary>
    /// Reads the holeNumbers array from a sponsor's placements JSONB.
    /// Mirrors MobileService.ExtractHoleNumbers so the public sponsor list
    /// matches the shape cached at /join. Returns empty on missing/bad JSON.
    /// </summary>
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

    /// <summary>Maps a loaded Event entity to the EventResponse DTO.</summary>
    /// <summary>
    /// Dashboard counts computed DB-side in one projected query — replaces the
    /// old pattern of Include()-ing Teams.Players and Scores (a cartesian JOIN
    /// with Course.Holes) just so the mapper could count them in memory.
    /// </summary>
    private Task<EventCountsDto> LoadCountsAsync(Guid eventId, CancellationToken ct) =>
        _db.Events
            .AsNoTracking()
            .Where(e => e.Id == eventId)
            .Select(e => new EventCountsDto
            {
                TeamsRegistered   = e.Teams.Count(),
                PlayersRegistered = e.Teams.SelectMany(t => t.Players).Count(),
                TeamsCheckedIn    = e.Teams.Count(t =>
                    t.CheckInStatus == Domain.Enums.CheckInStatus.CheckedIn ||
                    t.CheckInStatus == Domain.Enums.CheckInStatus.Complete),
                HolesScored       = e.Scores.Select(s => (int)s.HoleNumber).Distinct().Count(),
            })
            .FirstAsync(ct);

    private static EventResponse MapToEventResponse(Event evt, EventCountsDto counts, TestDataSummaryResponse? summary = null)
    {
        var config = DeserializeConfig(evt.ConfigJson);

        return new EventResponse
        {
            Id               = evt.Id,
            OrgId            = evt.OrgId,
            Name             = evt.Name,
            EventCode        = evt.EventCode,
            Format           = evt.Format.ToString(),
            StartType        = evt.StartType.ToString(),
            Holes            = evt.Holes,
            Status           = evt.Status.ToString(),
            StartAt          = evt.StartAt,
            Config           = config,
            LogoUrl          = evt.LogoUrl,
            ThemeJson        = evt.ThemeJson,
            MissionStatement = evt.MissionStatement,
            Is501c3          = evt.Is501c3,
            IsTestMode       = evt.IsTestMode,
            TestDataSummary  = summary ?? new TestDataSummaryResponse(),
            Course    = evt.Course is null ? null : new CourseResponse
            {
                Id      = evt.Course.Id,
                Name    = evt.Course.Name,
                Address = evt.Course.Address,
                City    = evt.Course.City,
                State   = evt.Course.State,
                Zip     = evt.Course.Zip,
                Holes   = evt.Course.Holes
                    .OrderBy(h => h.HoleNumber)
                    .Select(h => new HoleResponse
                    {
                        Id            = h.Id,
                        HoleNumber    = h.HoleNumber,
                        Par           = h.Par,
                        HandicapIndex = h.HandicapIndex,
                        YardageWhite  = h.YardageWhite,
                        YardageBlue   = h.YardageBlue,
                        YardageRed    = h.YardageRed,
                    }).ToList(),
            },
            Counts = counts,
        };
    }
}
