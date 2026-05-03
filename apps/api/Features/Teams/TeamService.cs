// ─────────────────────────────────────────────────────────────────────────────
// Features/Teams/TeamService.cs — Team & Registration Business Logic
// ─────────────────────────────────────────────────────────────────────────────
//
// INVITE TOKEN SECURITY:
//   Invite tokens are HMAC-SHA256 signed payloads, NOT random strings.
//   Format: base64url( teamId:expiresAtUnix )
//   Signature: HMAC-SHA256( payload, JWT_SECRET )
//   Full token stored in DB: payload.signature
//
//   WHY HMAC vs RANDOM:
//     Random tokens require a DB lookup to validate.
//     HMAC tokens are self-verifying — we can validate without a DB round-trip.
//     The team ID is embedded in the token so we know WHICH team to add to.
//     The expiry is embedded so we don't need to check the DB for that either.
//
// AUTO-PAIR ALGORITHM (spec Phase 1 §5.3 — snake draft):
//   Input:  all unassigned free agents for an event
//   Output: new teams (or modified existing teams) with agents assigned
//
//   Steps:
//     1. Sort agents: by skillLevel (Competitive→Beginner), then handicapIndex ASC,
//        then ageGroup, then lastName (deterministic for equal agents)
//     2. If FillExistingTeams=true: fill partial teams first (sorted by spots available)
//     3. Group remaining agents into groups of playersPerTeam
//     4. For each group: create a new team, assign agents
//     5. Any remainder (< playersPerTeam agents): create one partial team or leave
//        unassigned based on whether the remainder >= 2
// ─────────────────────────────────────────────────────────────────────────────

using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.Teams;

public class TeamService
{
    private readonly ApplicationDbContext _db;
    private readonly IConfiguration _config;
    private readonly ILogger<TeamService> _logger;

    /// <summary>Invite tokens expire after 48 hours.</summary>
    private static readonly TimeSpan InviteTokenLifetime = TimeSpan.FromHours(48);

    public TeamService(
        ApplicationDbContext db,
        IConfiguration config,
        ILogger<TeamService> logger)
    {
        _db     = db;
        _config = config;
        _logger = logger;
    }

    // ── MODE 1: REGISTER FULL TEAM ────────────────────────────────────────────

    /// <summary>
    /// Registers a full team with all players in one call.
    /// Creates the team, all players, and generates an invite link for latecomers.
    /// The first player in the array becomes the team captain.
    /// </summary>
    public async Task<RegistrationConfirmResponse> RegisterTeamAsync(
        Guid orgId,
        Guid eventId,
        RegisterTeamRequest request,
        CancellationToken ct = default)
    {
        var evt = await GetOpenEventAsync(orgId, eventId, ct);

        // Check event capacity
        await ValidateTeamCapacityAsync(evt, ct);

        // Check for duplicate emails across this event
        await ValidateEmailsUniqueInEventAsync(
            eventId,
            request.Players.Select(p => p.Email),
            ct);

        var maxPlayers = request.MaxPlayers
            ?? ReadMaxPlayersFromConfig(evt.ConfigJson)
            ?? 4;

        if (request.Players.Count > maxPlayers)
            throw new ValidationException(
                $"This team allows a maximum of {maxPlayers} players, " +
                $"but {request.Players.Count} were provided.");

        // Create team
        var team = new Team
        {
            Id         = Guid.NewGuid(),
            EventId    = eventId,
            Name       = request.TeamName,
            MaxPlayers = (short)maxPlayers,
        };

        // Create players — first player is captain
        var players = request.Players.Select((p, i) => new Player
        {
            Id               = Guid.NewGuid(),
            TeamId           = team.Id,
            EventId          = eventId,
            FirstName        = p.FirstName,
            LastName         = p.LastName,
            Email            = p.Email.ToLowerInvariant(),
            Phone            = p.Phone,
            HandicapIndex    = p.HandicapIndex,
            RegistrationType = RegistrationType.FullTeam,
            CheckInStatus    = CheckInStatus.Pending,
        }).ToList();

        // Set captain to first player
        team.CaptainPlayerId = players[0].Id;

        // Generate invite token (so teammates can join later if team isn't full)
        if (players.Count < maxPlayers)
        {
            var (token, expiresAt) = GenerateInviteToken(team.Id);
            team.InviteToken      = token;
            team.InviteExpiresAt  = expiresAt;
        }

        _db.Teams.Add(team);
        _db.Players.AddRange(players);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Registered team '{Name}' ({PlayerCount} players) for event {EventId}",
            team.Name, players.Count, eventId);

        var inviteUrl = BuildInviteUrl(evt, team);
        var teamResp  = await GetTeamByIdInternalAsync(team.Id, ct);

        return new RegistrationConfirmResponse
        {
            Team      = teamResp,
            InviteUrl = team.InviteToken is not null ? inviteUrl : null,
            Message   = $"Team '{team.Name}' registered successfully! " +
                        (team.InviteToken is not null
                            ? "Share the invite link to fill remaining spots."
                            : "Your team is full."),
        };
    }

    // ── MODE 2: JOIN TEAM VIA INVITE ──────────────────────────────────────────

    /// <summary>
    /// Adds a player to an existing team using an invite token.
    /// Validates: token signature, token expiry, team not full, email not duplicate.
    /// </summary>
    public async Task<RegistrationConfirmResponse> JoinTeamAsync(
        Guid orgId,
        Guid eventId,
        JoinTeamRequest request,
        CancellationToken ct = default)
    {
        var evt = await GetOpenEventAsync(orgId, eventId, ct);

        // Validate the invite token — extracts the team ID from the payload
        var teamId = ValidateInviteToken(request.InviteToken);

        var team = await _db.Teams
            .Include(t => t.Players)
            .FirstOrDefaultAsync(t => t.Id == teamId && t.EventId == eventId, ct);

        if (team is null)
            throw new NotFoundException("Team", teamId);

        // Check token matches what's stored and hasn't expired
        if (team.InviteToken != request.InviteToken)
            throw new ValidationException(
                "This invite link is no longer valid. Please ask the team captain for a new one.");

        if (team.InviteExpiresAt < DateTime.UtcNow)
            throw new ValidationException(
                "This invite link has expired (links are valid for 48 hours). " +
                "Please ask the team captain to regenerate the invite.");

        // Check team capacity
        if (team.Players.Count >= team.MaxPlayers)
            throw new ValidationException(
                $"This team is full ({team.MaxPlayers}/{team.MaxPlayers} players).");

        // Check email uniqueness in this event
        await ValidateEmailsUniqueInEventAsync(
            eventId, [request.Player.Email], ct);

        var player = new Player
        {
            Id               = Guid.NewGuid(),
            TeamId           = team.Id,
            EventId          = eventId,
            FirstName        = request.Player.FirstName,
            LastName         = request.Player.LastName,
            Email            = request.Player.Email.ToLowerInvariant(),
            Phone            = request.Player.Phone,
            HandicapIndex    = request.Player.HandicapIndex,
            RegistrationType = RegistrationType.IndividualJoin,
            CheckInStatus    = CheckInStatus.Pending,
        };

        _db.Players.Add(player);

        // If team is now full, clear the invite token so it can't be used again
        if (team.Players.Count + 1 >= team.MaxPlayers)
        {
            team.InviteToken     = null;
            team.InviteExpiresAt = null;
        }

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Player '{Email}' joined team '{TeamName}' for event {EventId}",
            player.Email, team.Name, eventId);

        var teamResp   = await GetTeamByIdInternalAsync(team.Id, ct);
        var playerResp = MapToPlayerResponse(player);

        return new RegistrationConfirmResponse
        {
            Team    = teamResp,
            Player  = playerResp,
            Message = $"You've joined '{team.Name}' successfully!",
        };
    }

    // ── MODE 3: FREE AGENT REGISTRATION ──────────────────────────────────────

    /// <summary>
    /// Registers a solo player in the free agent pool.
    /// They have no team until the organizer assigns or auto-pairs them.
    /// </summary>
    public async Task<RegistrationConfirmResponse> RegisterFreeAgentAsync(
        Guid orgId,
        Guid eventId,
        RegisterFreeAgentRequest request,
        CancellationToken ct = default)
    {
        var evt = await GetOpenEventAsync(orgId, eventId, ct);

        // Verify free agent registration is enabled for this event
        var config = DeserializeConfig(evt.ConfigJson);
        if (config.FreeAgentEnabled != true)
            throw new ValidationException(
                "Free agent registration is not enabled for this event.");

        await ValidateEmailsUniqueInEventAsync(
            eventId, [request.Player.Email], ct);

        var player = new Player
        {
            Id               = Guid.NewGuid(),
            TeamId           = null,     // no team yet — free agent
            EventId          = eventId,
            FirstName        = request.Player.FirstName,
            LastName         = request.Player.LastName,
            Email            = request.Player.Email.ToLowerInvariant(),
            Phone            = request.Player.Phone,
            HandicapIndex    = request.Player.HandicapIndex,
            RegistrationType = RegistrationType.FreeAgent,
            SkillLevel       = request.SkillLevel,
            AgeGroup         = request.AgeGroup,
            PairingNote      = request.PairingNote,
            CheckInStatus    = CheckInStatus.Pending,
        };

        _db.Players.Add(player);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Free agent '{Email}' registered for event {EventId}",
            player.Email, eventId);

        var playerResp = MapToPlayerResponse(player);

        return new RegistrationConfirmResponse
        {
            // No team yet — return a minimal team shell
            Team    = new TeamResponse { Name = "Free Agent Pool" },
            Player  = playerResp,
            Message = "You've been added to the free agent pool. " +
                      "The organizer will assign you to a team before the event.",
        };
    }

    // ── GET TEAM ──────────────────────────────────────────────────────────────

    public async Task<TeamResponse> GetTeamAsync(
        Guid orgId,
        Guid eventId,
        Guid teamId,
        CancellationToken ct = default)
    {
        // Verify event belongs to org
        var eventExists = await _db.Events
            .AnyAsync(e => e.Id == eventId && e.OrgId == orgId, ct);
        if (!eventExists)
            throw new NotFoundException("Event", eventId);

        return await GetTeamByIdInternalAsync(teamId, ct);
    }

    // ── GET ALL TEAMS ─────────────────────────────────────────────────────────

    public async Task<List<TeamResponse>> GetAllTeamsAsync(
        Guid orgId,
        Guid eventId,
        CancellationToken ct = default)
    {
        var eventExists = await _db.Events
            .AnyAsync(e => e.Id == eventId && e.OrgId == orgId, ct);
        if (!eventExists)
            throw new NotFoundException("Event", eventId);

        var teams = await _db.Teams
            .Include(t => t.Players)
            .Where(t => t.EventId == eventId)
            .OrderBy(t => t.Name)
            .ToListAsync(ct);

        return teams.Select(MapToTeamResponse).ToList();
    }

    // ── CHECK IN TEAM ─────────────────────────────────────────────────────────

    public async Task<TeamResponse> CheckInTeamAsync(
        Guid orgId,
        Guid eventId,
        Guid teamId,
        CancellationToken ct = default)
    {
        var team = await _db.Teams
            .Include(t => t.Players)
            .FirstOrDefaultAsync(t =>
                t.Id == teamId &&
                t.EventId == eventId &&
                t.Event.OrgId == orgId, ct);

        if (team is null)
            throw new NotFoundException("Team", teamId);

        team.CheckInStatus = CheckInStatus.CheckedIn;
        await _db.SaveChangesAsync(ct);
        return MapToTeamResponse(team);
    }

    // ── MARK FEE PAID ─────────────────────────────────────────────────────────

    public async Task<TeamResponse> MarkFeePaidAsync(
        Guid orgId,
        Guid eventId,
        Guid teamId,
        CancellationToken ct = default)
    {
        var team = await _db.Teams
            .Include(t => t.Players)
            .FirstOrDefaultAsync(t =>
                t.Id == teamId &&
                t.EventId == eventId &&
                t.Event.OrgId == orgId, ct);

        if (team is null)
            throw new NotFoundException("Team", teamId);

        team.EntryFeePaid = true;
        await _db.SaveChangesAsync(ct);
        return MapToTeamResponse(team);
    }

    // ── UPDATE TEAM ───────────────────────────────────────────────────────────

    public async Task<TeamResponse> UpdateTeamAsync(
        Guid orgId,
        Guid eventId,
        Guid teamId,
        UpdateTeamRequest request,
        CancellationToken ct = default)
    {
        var team = await _db.Teams
            .Include(t => t.Players)
            .FirstOrDefaultAsync(t =>
                t.Id == teamId &&
                t.EventId == eventId &&
                t.Event.OrgId == orgId, ct);

        if (team is null)
            throw new NotFoundException("Team", teamId);

        if (request.Name is not null)         team.Name         = request.Name;
        if (request.EntryFeePaid.HasValue)    team.EntryFeePaid = request.EntryFeePaid.Value;
        if (request.MaxPlayers.HasValue)      team.MaxPlayers   = request.MaxPlayers.Value;

        await _db.SaveChangesAsync(ct);
        return MapToTeamResponse(team);
    }

    // ── INVITE PREVIEW ────────────────────────────────────────────────────────

    /// <summary>
    /// Returns a preview of the team for the invite link landing page.
    /// Called before the player submits the join form.
    /// Does NOT require authentication — the token is the auth.
    /// </summary>
    public async Task<TeamInvitePreviewResponse> GetInvitePreviewAsync(
        Guid eventId,
        string inviteToken,
        CancellationToken ct = default)
    {
        var teamId = ValidateInviteToken(inviteToken);

        var team = await _db.Teams
            .Include(t => t.Players)
            .Include(t => t.Event)
            .FirstOrDefaultAsync(t => t.Id == teamId && t.EventId == eventId, ct);

        if (team is null || team.InviteToken != inviteToken)
            throw new NotFoundException("This invite link is not valid.");

        if (team.InviteExpiresAt < DateTime.UtcNow)
            throw new ValidationException("This invite link has expired.");

        var spotsRemaining = team.MaxPlayers - team.Players.Count;

        return new TeamInvitePreviewResponse
        {
            TeamId         = team.Id,
            TeamName       = team.Name,
            EventName      = team.Event.Name,
            // Show first names only — don't expose full names pre-join
            PlayerNames    = team.Players
                .Select(p => $"{p.FirstName} {p.LastName[0]}.")
                .ToList(),
            SpotsRemaining = spotsRemaining,
            IsFull         = spotsRemaining <= 0,
        };
    }

    // ── REGENERATE INVITE ─────────────────────────────────────────────────────

    public async Task<RegenerateInviteResponse> RegenerateInviteAsync(
        Guid orgId,
        Guid eventId,
        Guid teamId,
        CancellationToken ct = default)
    {
        var team = await _db.Teams
            .Include(t => t.Players)
            .Include(t => t.Event)
            .FirstOrDefaultAsync(t =>
                t.Id == teamId &&
                t.EventId == eventId &&
                t.Event.OrgId == orgId, ct);

        if (team is null)
            throw new NotFoundException("Team", teamId);

        if (team.Players.Count >= team.MaxPlayers)
            throw new ValidationException("This team is already full — no invite needed.");

        var (token, expiresAt) = GenerateInviteToken(team.Id);
        team.InviteToken      = token;
        team.InviteExpiresAt  = expiresAt;

        await _db.SaveChangesAsync(ct);

        return new RegenerateInviteResponse
        {
            InviteToken = token,
            InviteUrl   = BuildInviteUrl(team.Event, team),
            ExpiresAt   = expiresAt,
        };
    }

    // ── FREE AGENT BOARD ──────────────────────────────────────────────────────

    /// <summary>
    /// Returns all unassigned free agents for the Free Agent Board.
    /// Sorted by skill level then handicap for easy visual scanning.
    /// </summary>
    public async Task<List<FreeAgentResponse>> GetFreeAgentsAsync(
        Guid orgId,
        Guid eventId,
        CancellationToken ct = default)
    {
        var eventExists = await _db.Events
            .AnyAsync(e => e.Id == eventId && e.OrgId == orgId, ct);
        if (!eventExists)
            throw new NotFoundException("Event", eventId);

        var agents = await _db.Players
            .Where(p =>
                p.EventId == eventId &&
                p.TeamId == null &&
                (p.RegistrationType == RegistrationType.FreeAgent ||
                 p.RegistrationType == RegistrationType.FreeAgentAssigned))
            .OrderBy(p => p.SkillLevel.HasValue ? (int)p.SkillLevel : 99)
            .ThenBy(p => p.HandicapIndex ?? 99)
            .ThenBy(p => p.LastName)
            .ToListAsync(ct);

        return agents.Select(MapToFreeAgentResponse).ToList();
    }

    // ── MANUAL FREE AGENT ASSIGNMENT ──────────────────────────────────────────

    /// <summary>
    /// Assigns a specific free agent to a specific team.
    /// Validates team has capacity and player is still unassigned.
    /// </summary>
    public async Task<TeamResponse> AssignFreeAgentAsync(
        Guid orgId,
        Guid eventId,
        AssignFreeAgentRequest request,
        CancellationToken ct = default)
    {
        // Load both player and team, verifying they belong to this event/org
        var player = await _db.Players
            .FirstOrDefaultAsync(p =>
                p.Id == request.PlayerId &&
                p.EventId == eventId &&
                p.TeamId == null, ct);

        if (player is null)
            throw new NotFoundException(
                "Player not found, or they are already assigned to a team.");

        var team = await _db.Teams
            .Include(t => t.Players)
            .FirstOrDefaultAsync(t =>
                t.Id == request.TeamId &&
                t.EventId == eventId &&
                t.Event.OrgId == orgId, ct);

        if (team is null)
            throw new NotFoundException("Team", request.TeamId);

        if (team.Players.Count >= team.MaxPlayers)
            throw new ValidationException(
                $"Team '{team.Name}' is full ({team.MaxPlayers}/{team.MaxPlayers} players).");

        player.TeamId           = team.Id;
        player.RegistrationType = RegistrationType.FreeAgentAssigned;

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Assigned free agent {PlayerId} to team '{TeamName}' in event {EventId}",
            player.Id, team.Name, eventId);

        return await GetTeamByIdInternalAsync(team.Id, ct);
    }

    // ── AUTO-PAIR ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Snake-draft auto-pair: assigns all unassigned free agents to teams.
    ///
    /// ALGORITHM:
    ///   1. Load all teamless free agents, sorted by skill/handicap/age/name
    ///   2. If FillExistingTeams=true: fill partial teams first
    ///   3. Group remaining agents into squads of playersPerTeam
    ///   4. Create new teams for each full squad; partial squad (≥2) gets its own team
    ///   5. Single leftover agent (if any) is left unassigned
    /// </summary>
    public async Task<AutoPairResultResponse> AutoPairAsync(
        Guid orgId,
        Guid eventId,
        AutoPairRequest request,
        CancellationToken ct = default)
    {
        var evt = await _db.Events
            .Include(e => e.Teams)
                .ThenInclude(t => t.Players)
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct);

        if (evt is null)
            throw new NotFoundException("Event", eventId);

        var playersPerTeam = (int)(request.PlayersPerTeam
            ?? ReadMaxPlayersFromConfig(evt.ConfigJson)
            ?? 4);

        // Load all unassigned free agents (excluding walk-ups)
        var agents = await _db.Players
            .Where(p =>
                p.EventId == eventId &&
                p.TeamId == null &&
                p.RegistrationType == RegistrationType.FreeAgent)
            .ToListAsync(ct);

        if (!agents.Any())
        {
            return new AutoPairResultResponse
            {
                Teams = new List<TeamResponse>(),
                AgentsAssigned = 0,
                Message = "No unassigned free agents found."
            };
        }

        // ── STEP 1: Sort agents for balanced snake draft ───────────────────
        // Skill order: Competitive(0) → Advanced(1) → Intermediate(2) → Beginner(3) → null(4)
        var sorted = agents
            .OrderBy(p => p.SkillLevel.HasValue ? (int)p.SkillLevel : 4)
            .ThenBy(p => p.HandicapIndex ?? 99.0)
            .ThenBy(p => p.AgeGroup.HasValue ? (int)p.AgeGroup : 99)
            .ThenBy(p => p.LastName)
            .ToList();

        var modifiedTeams = new List<Team>();
        var createdTeams  = new List<Team>();

        // ── STEP 2: Fill existing partial teams first ──────────────────────
        if (request.FillExistingTeams)
        {
            var partialTeams = evt.Teams
                .Where(t => t.Players.Count < t.MaxPlayers && t.Players.Count > 0)
                .OrderByDescending(t => t.Players.Count) // fill most-full first
                .ToList();

            foreach (var team in partialTeams)
            {
                var spotsAvailable = team.MaxPlayers - team.Players.Count;
                var toAssign       = sorted.Take(spotsAvailable).ToList();
                sorted.RemoveRange(0, toAssign.Count);

                foreach (var agent in toAssign)
                {
                    agent.TeamId           = team.Id;
                    agent.RegistrationType = RegistrationType.FreeAgentAssigned;
                }

                if (toAssign.Any()) modifiedTeams.Add(team);
                if (!sorted.Any()) break;
            }
        }

        // ── STEP 3: Group remaining agents into new teams ──────────────────
        var teamNumber = evt.Teams.Count + 1;

        while (sorted.Count >= 2) // need at least 2 to make a valid team
        {
            var squad = sorted.Take(playersPerTeam).ToList();
            sorted.RemoveRange(0, squad.Count);

            var newTeam = new Team
            {
                Id         = Guid.NewGuid(),
                EventId    = eventId,
                Name       = $"{request.TeamNamePrefix} {teamNumber++}",
                MaxPlayers = (short)playersPerTeam,
            };

            foreach (var agent in squad)
            {
                agent.TeamId           = newTeam.Id;
                agent.RegistrationType = RegistrationType.FreeAgentAssigned;
            }

            _db.Teams.Add(newTeam);
            createdTeams.Add(newTeam);
        }

        await _db.SaveChangesAsync(ct);

        // Build response
        var allAffectedTeamIds = modifiedTeams.Select(t => t.Id)
            .Concat(createdTeams.Select(t => t.Id))
            .ToList();

        var teamResponses = new List<TeamResponse>();
        foreach (var id in allAffectedTeamIds)
            teamResponses.Add(await GetTeamByIdInternalAsync(id, ct));

        _logger.LogInformation(
            "Auto-paired {AgentCount} free agents into {NewTeams} new teams " +
            "and {ModifiedTeams} existing teams for event {EventId}",
            agents.Count - sorted.Count,
            createdTeams.Count,
            modifiedTeams.Count,
            eventId);

        return new AutoPairResultResponse
        {
            Teams          = teamResponses,
            AgentsAssigned = agents.Count - sorted.Count,
            TeamsCreated   = createdTeams.Count,
            TeamsModified  = modifiedTeams.Count,
            Unassigned     = sorted.Select(MapToFreeAgentResponse).ToList(),
        };
    }

    // ── PRIVATE HELPERS ───────────────────────────────────────────────────────

    /// <summary>
    /// Loads the event and verifies it is open for registration.
    /// Registration is allowed in: Registration and Active status.
    /// Walk-up registration is also allowed when event.config.allowWalkUps = true.
    /// </summary>
    private async Task<Event> GetOpenEventAsync(
        Guid orgId, Guid eventId, CancellationToken ct)
    {
        var evt = await _db.Events
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct);

        if (evt is null)
            throw new NotFoundException("Event", eventId);

        var config     = DeserializeConfig(evt.ConfigJson);
        var allowWalkUp = config.AllowWalkUps ?? false;

        var isOpen = evt.Status == EventStatus.Registration
            || evt.Status == EventStatus.Active && allowWalkUp;

        if (!isOpen)
            throw new ValidationException(
                $"Registration is not open for this event (status: {evt.Status}). " +
                "Walk-up registration must be enabled in event settings for Active events.");

        return evt;
    }

    /// <summary>
    /// Checks that the event hasn't reached its max_teams limit.
    /// </summary>
    private async Task ValidateTeamCapacityAsync(Event evt, CancellationToken ct)
    {
        var config   = DeserializeConfig(evt.ConfigJson);
        var maxTeams = config.MaxTeams;
        if (!maxTeams.HasValue) return; // no limit

        var currentCount = await _db.Teams.CountAsync(t => t.EventId == evt.Id, ct);
        if (currentCount >= maxTeams.Value)
            throw new ValidationException(
                $"This event has reached its maximum of {maxTeams} teams.");
    }

    /// <summary>
    /// Ensures no provided email already exists in this event.
    /// Prevents double-registration and duplicate-email team submissions.
    /// </summary>
    private async Task ValidateEmailsUniqueInEventAsync(
        Guid eventId,
        IEnumerable<string> emails,
        CancellationToken ct)
    {
        var normalised   = emails.Select(e => e.ToLowerInvariant()).ToList();
        var duplicates   = await _db.Players
            .Where(p => p.EventId == eventId && normalised.Contains(p.Email))
            .Select(p => p.Email)
            .ToListAsync(ct);

        if (duplicates.Any())
            throw new ConflictException(
                $"The following email(s) are already registered for this event: " +
                $"{string.Join(", ", duplicates)}");
    }

    // Token generation and validation are now in InviteTokenHelper (pure, testable).

    private (string token, DateTime expiresAt) GenerateInviteToken(Guid teamId)
    {
        var secret = _config["JWT_SECRET"]
            ?? throw new InvalidOperationException("JWT_SECRET not configured");
        var (token, expiresAt) = InviteTokenHelper.Generate(teamId, secret);
        return (token, expiresAt);
    }

    private Guid ValidateInviteToken(string token)
    {
        var secret = _config["JWT_SECRET"]
            ?? throw new InvalidOperationException("JWT_SECRET not configured");
        return InviteTokenHelper.Validate(token, secret);
    }

    private static string BuildInviteUrl(Event evt, Team team)
    {
        // The public invite URL format matches the Next.js routing
        // /e/{orgSlug}/{eventCode}/join?token={inviteToken}
        return $"/e/{evt.Organization?.Slug ?? evt.OrgId.ToString()}/" +
               $"{evt.EventCode}/join?token={team.InviteToken}";
    }

    private async Task<TeamResponse> GetTeamByIdInternalAsync(Guid teamId, CancellationToken ct)
    {
        var team = await _db.Teams
            .Include(t => t.Players)
            .FirstOrDefaultAsync(t => t.Id == teamId, ct)
            ?? throw new NotFoundException("Team", teamId);

        return MapToTeamResponse(team);
    }

    private static int? ReadMaxPlayersFromConfig(string? json)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(json)) return null;
            var doc = JsonDocument.Parse(json);
            return doc.RootElement.TryGetProperty("maxPlayers", out var v)
                ? v.GetInt32()
                : null;
        }
        catch { return null; }
    }

    private sealed record EventConfig(bool? AllowWalkUps, int? MaxTeams, bool? FreeAgentEnabled);

    private static EventConfig DeserializeConfig(string? json)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(json)) return new EventConfig(null, null, null);
            var doc = JsonDocument.Parse(json);
            bool? allowWalkUps = doc.RootElement.TryGetProperty("allowWalkUps",     out var aw) ? aw.GetBoolean() : null;
            int?  maxTeams     = doc.RootElement.TryGetProperty("maxTeams",         out var mt) ? mt.GetInt32()   : null;
            bool? freeAgent    = doc.RootElement.TryGetProperty("freeAgentEnabled", out var fa) ? fa.GetBoolean() : null;
            return new EventConfig(allowWalkUps, maxTeams, freeAgent);
        }
        catch
        {
            return new EventConfig(null, null, null);
        }
    }

    private static TeamResponse MapToTeamResponse(Team team) => new()
    {
        Id              = team.Id,
        EventId         = team.EventId,
        Name            = team.Name,
        CaptainPlayerId = team.CaptainPlayerId,
        StartingHole    = team.StartingHole,
        TeeTime         = team.TeeTime,
        EntryFeePaid    = team.EntryFeePaid,
        MaxPlayers      = team.MaxPlayers,
        CheckInStatus   = team.CheckInStatus.ToString(),
        HasInviteLink   = team.InviteToken is not null,
        InviteExpiresAt = team.InviteExpiresAt,
        Players         = team.Players.Select(MapToPlayerResponse).ToList(),
    };

    private static PlayerResponse MapToPlayerResponse(Player p) => new()
    {
        Id               = p.Id,
        TeamId           = p.TeamId,
        EventId          = p.EventId,
        FirstName        = p.FirstName,
        LastName         = p.LastName,
        Email            = p.Email,
        Phone            = p.Phone,
        HandicapIndex    = p.HandicapIndex,
        RegistrationType = p.RegistrationType.ToString(),
        SkillLevel       = p.SkillLevel?.ToString(),
        AgeGroup         = p.AgeGroup?.ToString(),
        PairingNote      = p.PairingNote,
        CheckInStatus    = p.CheckInStatus.ToString(),
        CheckInAt        = p.CheckInAt,
    };

    private static FreeAgentResponse MapToFreeAgentResponse(Player p) => new()
    {
        Id            = p.Id,
        FirstName     = p.FirstName,
        LastName      = p.LastName,
        Email         = p.Email,
        HandicapIndex = p.HandicapIndex,
        SkillLevel    = p.SkillLevel?.ToString(),
        AgeGroup      = p.AgeGroup?.ToString(),
        PairingNote   = p.PairingNote,
        CheckInStatus = p.CheckInStatus.ToString(),
        RegisteredAt  = DateTime.UtcNow,
    };
}
