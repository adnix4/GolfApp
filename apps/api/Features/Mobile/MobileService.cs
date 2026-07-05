using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Emails;
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
///   EMAIL VERIFICATION (A3): before minting the session token we prove the caller
///   owns the registered email — the first join call gets VerificationRequired=true
///   and a one-time code by email; the second call carries the code. Draft
///   (test-mode) events and devices that already verified skip this. A config-only
///   test bypass code (JoinVerification:TestBypassCode) exists for dev/demo
///   environments where the seeded emails are fake; it must NOT be set in prod.
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
    private readonly IRealTimeService _realTime;
    private readonly EmailService _email;
    private readonly IConfiguration _config;
    private readonly ILogger<MobileService> _logger;

    /// <summary>Wrong-code tries before the pending code is invalidated.</summary>
    private const int MaxVerificationAttempts = 5;

    /// <summary>How long an emailed join verification code stays valid.</summary>
    private static readonly TimeSpan VerificationCodeTtl = TimeSpan.FromMinutes(10);

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public MobileService(
        ApplicationDbContext db,
        IRealTimeService realTime,
        EmailService email,
        IConfiguration config,
        ILogger<MobileService> logger)
    {
        _db       = db;
        _realTime = realTime;
        _email    = email;
        _config   = config;
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

        // Untracked projection — this backs the public "find your event"
        // directory (web, no-store) and the mobile join screen, so it should
        // pull only the columns the summary needs, not full tracked entities.
        var events = await _db.Events
            .AsNoTracking()
            .Where(e => openStatuses.Contains(e.Status))
            .OrderBy(e => e.StartAt)
            .Select(e => new
            {
                e.Id, e.Name, e.EventCode, e.Format, e.Status, e.StartAt,
                e.ConfigJson, e.LogoUrl,
                OrgName     = e.Organization.Name,
                OrgSlug     = e.Organization.Slug,
                OrgLogoUrl  = e.Organization.LogoUrl,
                CourseName  = e.Course == null ? null : e.Course.Name,
                CourseCity  = e.Course == null ? null : e.Course.City,
                CourseState = e.Course == null ? null : e.Course.State,
            })
            .ToListAsync(ct);

        return events.Select(e =>
        {
            bool freeAgentEnabled = false;
            try
            {
                using var doc = JsonDocument.Parse(e.ConfigJson ?? "{}");
                if (doc.RootElement.TryGetProperty("freeAgentEnabled", out var fa))
                    freeAgentEnabled = fa.GetBoolean();
            }
            catch { /* malformed JSON — leave false */ }

            return new ActiveEventSummaryDto
            {
                Id               = e.Id,
                Name             = e.Name,
                EventCode        = e.EventCode,
                Format           = e.Format.ToString(),
                Status           = e.Status.ToString(),
                StartAt          = e.StartAt,
                OrgName          = e.OrgName,
                OrgSlug          = e.OrgSlug,
                CourseName       = e.CourseName,
                CourseCity       = e.CourseCity,
                CourseState      = e.CourseState,
                LogoUrl          = e.LogoUrl ?? e.OrgLogoUrl,
                FreeAgentEnabled = freeAgentEnabled,
            };
        }).ToList();
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

        // Find the player by email within this event — check team-assigned players first
        var player = evt.Teams
            .SelectMany(t => t.Players)
            .FirstOrDefault(p => p.Email.Equals(request.Email, StringComparison.OrdinalIgnoreCase));

        // If not found in any team, check the free agent pool (TeamId = null)
        if (player is null)
        {
            var freeAgent = await _db.Players
                .FirstOrDefaultAsync(
                    p => p.EventId == evt.Id
                      && p.Email   == request.Email.ToLowerInvariant()
                      && p.TeamId  == null,
                    ct);

            if (freeAgent is not null)
            {
                // Once scoring is live every player must be on a team — block them
                // with an actionable error so they call the organizer immediately.
                if (evt.Status is EventStatus.Scoring)
                    throw new ValidationException(
                        "The round has started but you haven't been assigned to a team yet. " +
                        "Please contact your event organizer immediately.");

                // A3: prove email ownership before minting the free agent's token.
                // Verified devices skip this, so "Check Again" polling stays silent.
                var freeAgentChallenge = await EnsureEmailVerifiedAsync(evt, freeAgent, request, ct);
                if (freeAgentChallenge is not null)
                    return freeAgentChallenge;

                // Draft / Registration / Active — the organizer still has time to assign.
                // Return a minimal response so the mobile app can show a waiting screen.
                _logger.LogInformation(
                    "Free agent '{Email}' checked in for event '{Code}' — awaiting assignment",
                    request.Email, eventCode);

                var freeAgentToken = await EnsureSessionTokenAsync(freeAgent, ct);

                return new JoinEventResponse
                {
                    AwaitingAssignment = true,
                    SessionToken = freeAgentToken,
                    Player = new PlayerCacheDto
                    {
                        Id               = freeAgent.Id,
                        FirstName        = freeAgent.FirstName,
                        LastName         = freeAgent.LastName,
                        Email            = freeAgent.Email,
                        HasPaymentMethod = freeAgent.HasPaymentMethod,
                    },
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
                    Org = new OrgCacheDto
                    {
                        Id        = evt.Organization.Id,
                        Name      = evt.Organization.Name,
                        Slug      = evt.Organization.Slug,
                        LogoUrl   = evt.Organization.LogoUrl,
                        ThemeJson = evt.Organization.ThemeJson,
                    },
                    Team     = null,
                    Course   = null,
                    Sponsors = [],
                };
            }
        }

        if (player is null)
            throw new NotFoundException(
                $"No registration found for '{request.Email}' in this event. " +
                "Please contact your event organizer.");

        var team = evt.Teams.FirstOrDefault(t => t.Id == player.TeamId);
        if (team is null)
            throw new ValidationException(
                "You are registered but have not yet been assigned to a team. " +
                "Please contact your event organizer.");

        // A3: prove email ownership before minting the session token — the event
        // code is semi-public and the email alone must not be enough to act as
        // this player.
        var challenge = await EnsureEmailVerifiedAsync(evt, player, request, ct);
        if (challenge is not null)
            return challenge;

        _logger.LogInformation(
            "Golfer '{Email}' joined event '{Code}' on device '{Device}'",
            request.Email, eventCode, request.DeviceId);

        var sessionToken = await EnsureSessionTokenAsync(player, ct);

        // Build sponsor data — map hole numbers from JSONB placements
        var sponsors = evt.Sponsors
            .Select(s => new SponsorCacheDto
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

        // Build a hole-number → sponsor lookup for annotating course holes
        var holeSponsorMap = sponsors
            .Where(s => s.HoleNumbers.Count > 0)
            .SelectMany(s => s.HoleNumbers.Select(h => (HoleNum: h, Sponsor: s)))
            .GroupBy(x => x.HoleNum)
            .ToDictionary(g => g.Key, g => g.First().Sponsor);

        return new JoinEventResponse
        {
            SessionToken = sessionToken,
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
                Id               = player.Id,
                FirstName        = player.FirstName,
                LastName         = player.LastName,
                Email            = player.Email,
                HasPaymentMethod = player.HasPaymentMethod,
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

        // Authorization (anti-injection): the caller must present the session token
        // of a player ON THIS TEAM (minted at /join). Otherwise a known
        // eventId+teamId alone could inject or perturb the team's scores. Mismatch
        // throws the same NotFound as a missing team (no existence leak).
        var teamTokens = await _db.Players
            .Where(p => p.TeamId == request.TeamId && p.SessionToken != null)
            .Select(p => p.SessionToken)
            .ToListAsync(ct);
        if (!teamTokens.Any(t => TokenMatches(t, request.SessionToken)))
        {
            _logger.LogWarning("Score sync session token mismatch for team {TeamId}", request.TeamId);
            throw new NotFoundException("Team", request.TeamId);
        }

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
                    // Genuine conflict — the existing (admin/first) value stays
                    // authoritative; record the golfer's proposed value so the
                    // admin can approve it and the device can warn the golfer.
                    current.IsConflicted  = true;
                    current.ProposedScore = pending.GrossScore;
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
                    current.ProposedScore = null;
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

    // ── TEAM SCORECARD PULL ───────────────────────────────────────────────────

    /// <summary>
    /// Returns the authoritative server-side scores for a team so the mobile app
    /// can merge admin corrections (and resolved conflicts) back into its local
    /// scorecard. Anonymous, like the other mobile endpoints — identified by
    /// event code + team id. Only holes that have a score row are returned.
    /// </summary>
    public async Task<TeamScorecardResponse> GetTeamScoresAsync(
        string eventCode, Guid teamId, CancellationToken ct = default)
    {
        var evt = await _db.Events
            .FirstOrDefaultAsync(e => e.EventCode == eventCode.ToUpperInvariant(), ct);

        if (evt is null)
            throw new NotFoundException($"No event found with code '{eventCode}'.");

        var teamExists = await _db.Teams
            .AnyAsync(t => t.Id == teamId && t.EventId == evt.Id, ct);

        if (!teamExists)
            throw new NotFoundException("Team", teamId);

        var holes = await _db.Scores
            .AsNoTracking()
            .Where(s => s.EventId == evt.Id && s.TeamId == teamId)
            .OrderBy(s => s.HoleNumber)
            .Select(s => new TeamHoleScoreDto
            {
                HoleNumber    = s.HoleNumber,
                GrossScore    = s.GrossScore,
                Putts         = s.Putts,
                IsConflicted  = s.IsConflicted,
                ProposedScore = s.ProposedScore,
            })
            .ToListAsync(ct);

        return new TeamScorecardResponse { TeamId = teamId, Holes = holes };
    }

    // ── SELF-SERVICE PROFILE UPDATE ───────────────────────────────────────────

    /// <summary>
    /// Lets a player update their own first name, last name, and phone number
    /// without requiring organizer authorization.
    /// </summary>
    public async Task<PlayerCacheDto> UpdateSelfAsync(
        Guid playerId, UpdateSelfRequest request, CancellationToken ct = default)
    {
        var player = await _db.Players.FirstOrDefaultAsync(p => p.Id == playerId, ct)
            ?? throw new NotFoundException("Player", playerId);

        // Authorization (anti-IDOR): the caller must present this player's session
        // token (minted at /join). Without it, anyone could PATCH any playerId
        // (Guids are handed out in join/scorecard/team responses). On mismatch we
        // throw the SAME NotFound as a missing player so the endpoint never reveals
        // whether a given id exists.
        if (!TokenMatches(player.SessionToken, request.SessionToken))
        {
            _logger.LogWarning("Self-update session token mismatch for player {PlayerId}", playerId);
            throw new NotFoundException("Player", playerId);
        }

        if (request.FirstName is not null) player.FirstName = request.FirstName.Trim();
        if (request.LastName  is not null) player.LastName  = request.LastName.Trim();
        if (request.Phone     is not null) player.Phone     = request.Phone.Trim();

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Player {PlayerId} updated their own profile", playerId);

        return new PlayerCacheDto
        {
            Id               = player.Id,
            FirstName        = player.FirstName,
            LastName         = player.LastName,
            Email            = player.Email,
            HasPaymentMethod = player.HasPaymentMethod,
        };
    }

    // ── PRIVATE ───────────────────────────────────────────────────────────────

    /// <summary>
    /// A3 email-ownership gate for /join. Returns null when the caller may proceed
    /// (verified now, previously verified on this device, Draft test-mode event, or
    /// the config-only test bypass code). Returns a bare
    /// <see cref="JoinEventResponse.VerificationRequired"/> response after emailing
    /// a fresh one-time code. Throws <see cref="ValidationException"/> for a wrong,
    /// expired, or attempt-limited code.
    /// </summary>
    private async Task<JoinEventResponse?> EnsureEmailVerifiedAsync(
        Event evt, Player player, JoinEventRequest request, CancellationToken ct)
    {
        // Draft events are the test/preview mode — joinable by code only, seeded
        // with fake emails, never public. Verification would make them unusable.
        if (evt.Status is EventStatus.Draft)
            return null;

        // This device already proved ownership of the registered email — rejoins
        // and free-agent "Check Again" polling shouldn't re-prompt. (DeviceIds are
        // app-generated UUIDs held on-device; proportionate, not cryptographic.)
        if (!string.IsNullOrEmpty(player.VerifiedDeviceId)
            && player.VerifiedDeviceId == request.DeviceId)
            return null;

        var provided = request.VerificationCode?.Trim();

        if (!string.IsNullOrEmpty(provided))
        {
            // TEST BYPASS (dev/demo only): most seeded/test emails are fake, so a
            // deployment can set JoinVerification:TestBypassCode (Development
            // config only — never production) and enter it instead of an emailed
            // code. Unset/empty config disables the bypass entirely.
            var bypass = _config["JoinVerification:TestBypassCode"];
            if (!string.IsNullOrEmpty(bypass) && TokenMatches(bypass, provided))
            {
                _logger.LogWarning(
                    "Join verification BYPASSED via test code for '{Email}' on event '{Code}'",
                    player.Email, evt.EventCode);
                await MarkEmailVerifiedAsync(player, request.DeviceId, ct);
                return null;
            }

            if (string.IsNullOrEmpty(player.VerificationCode)
                || player.VerificationExpiresAt is null
                || player.VerificationExpiresAt < DateTime.UtcNow)
                throw new ValidationException(
                    "That verification code has expired. Tap Resend to get a new one.");

            if (player.VerificationAttempts >= MaxVerificationAttempts)
            {
                player.VerificationCode      = null;
                player.VerificationExpiresAt = null;
                await _db.SaveChangesAsync(ct);
                throw new ValidationException(
                    "Too many incorrect attempts. Tap Resend to get a new code.");
            }

            if (!TokenMatches(player.VerificationCode, provided))
            {
                player.VerificationAttempts++;
                await _db.SaveChangesAsync(ct);
                throw new ValidationException(
                    "That code doesn't match. Check the email we sent and try again.");
            }

            await MarkEmailVerifiedAsync(player, request.DeviceId, ct);
            return null;
        }

        // No code supplied — issue a fresh challenge. Always regenerate so
        // "Resend" invalidates any earlier email.
        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        player.VerificationCode      = code;
        player.VerificationExpiresAt = DateTime.UtcNow.Add(VerificationCodeTtl);
        player.VerificationAttempts  = 0;
        await _db.SaveChangesAsync(ct);

        try
        {
            await _email.SendTransactionalAsync(
                player.Email,
                $"{player.FirstName} {player.LastName}",
                $"Your verification code for {evt.Name}",
                BuildVerificationEmailHtml(evt.Name, player.FirstName, code),
                ct);
        }
        catch (Exception ex)
        {
            // Don't fail the join over email delivery — the golfer can tap Resend,
            // and dev environments (no SendGrid key, fake emails) use the bypass
            // code. The challenge response is returned either way.
            _logger.LogError(ex,
                "Failed to send join verification email to '{Email}' for event '{Code}'",
                player.Email, evt.EventCode);
        }

        _logger.LogInformation(
            "Join verification code issued for '{Email}' on event '{Code}'",
            player.Email, evt.EventCode);

        return new JoinEventResponse { VerificationRequired = true };
    }

    private async Task MarkEmailVerifiedAsync(Player player, string deviceId, CancellationToken ct)
    {
        player.VerificationCode      = null;
        player.VerificationExpiresAt = null;
        player.VerificationAttempts  = 0;
        player.VerifiedDeviceId      = deviceId;
        await _db.SaveChangesAsync(ct);
    }

    private static string BuildVerificationEmailHtml(string eventName, string firstName, string code) => $"""
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#1b5e20;margin:0 0 12px;">⛳ Golf Fundraiser Pro</h2>
          <p style="font-size:15px;color:#333;">Hi {System.Net.WebUtility.HtmlEncode(firstName)},</p>
          <p style="font-size:15px;color:#333;">
            Here is your one-time code to join
            <strong>{System.Net.WebUtility.HtmlEncode(eventName)}</strong>:
          </p>
          <p style="font-size:34px;font-weight:bold;letter-spacing:8px;text-align:center;
                    background:#f1f8e9;border-radius:8px;padding:16px;color:#1b5e20;">{code}</p>
          <p style="font-size:13px;color:#666;">
            The code expires in 10 minutes. If you didn't try to join this event,
            you can ignore this email — no one can score for you without the code.
          </p>
        </div>
        """;

    // Mint a player's session token on first join (golfers have no password — this
    // opaque token is what later authorizes their own actions). Reused on re-join
    // so an already-issued device keeps working through the event; only ever
    // returned to a caller who already proved the join secret (event code + email).
    private async Task<string> EnsureSessionTokenAsync(Player player, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(player.SessionToken))
        {
            player.SessionToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
                .Replace('+', '-').Replace('/', '_').TrimEnd('=');
            await _db.SaveChangesAsync(ct);
        }
        return player.SessionToken;
    }

    // Thin alias for the shared session-token check (Common.PlayerSessionAuth),
    // kept local so the call sites in this file read cleanly.
    private static bool TokenMatches(string? stored, string? provided)
        => Common.PlayerSessionAuth.Matches(stored, provided);

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
