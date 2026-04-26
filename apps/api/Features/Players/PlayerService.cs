using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Teams;

namespace GolfFundraiserPro.Api.Features.Players;

public class PlayerService
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<PlayerService> _logger;

    public PlayerService(ApplicationDbContext db, ILogger<PlayerService> logger)
    {
        _db     = db;
        _logger = logger;
    }

    public async Task<List<PlayerResponse>> GetAllAsync(
        Guid orgId, Guid eventId, CancellationToken ct = default)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var players = await _db.Players
            .Where(p => p.EventId == eventId)
            .OrderBy(p => p.LastName).ThenBy(p => p.FirstName)
            .ToListAsync(ct);

        return players.Select(MapToPlayerResponse).ToList();
    }

    public async Task<PlayerResponse> GetByIdAsync(
        Guid orgId, Guid eventId, Guid playerId, CancellationToken ct = default)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var player = await _db.Players
            .FirstOrDefaultAsync(p => p.Id == playerId && p.EventId == eventId, ct);

        if (player is null)
            throw new NotFoundException("Player", playerId);

        return MapToPlayerResponse(player);
    }

    public async Task<PlayerResponse> UpdateAsync(
        Guid orgId, Guid eventId, Guid playerId,
        UpdatePlayerRequest request, CancellationToken ct = default)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var player = await _db.Players
            .FirstOrDefaultAsync(p => p.Id == playerId && p.EventId == eventId, ct);

        if (player is null)
            throw new NotFoundException("Player", playerId);

        if (request.FirstName  is not null)  player.FirstName     = request.FirstName;
        if (request.LastName   is not null)  player.LastName      = request.LastName;
        if (request.Phone      is not null)  player.Phone         = request.Phone;
        if (request.HandicapIndex.HasValue)  player.HandicapIndex = request.HandicapIndex;

        if (request.ClearTeam == true)
        {
            player.TeamId = null;
        }
        else if (request.TeamId.HasValue)
        {
            var team = await _db.Teams
                .Include(t => t.Players)
                .FirstOrDefaultAsync(t => t.Id == request.TeamId.Value && t.EventId == eventId, ct);

            if (team is null)
                throw new NotFoundException("Team", request.TeamId.Value);

            var currentSlots = team.Players.Count(p => p.Id != playerId);
            if (currentSlots >= team.MaxPlayers)
                throw new ValidationException($"Team '{team.Name}' is full ({team.MaxPlayers}/{team.MaxPlayers} players).");

            player.TeamId = team.Id;
        }

        await _db.SaveChangesAsync(ct);
        return MapToPlayerResponse(player);
    }

    public async Task<PlayerResponse> CheckInAsync(
        Guid orgId, Guid eventId, Guid playerId, CancellationToken ct = default)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var player = await _db.Players
            .Include(p => p.Team)
                .ThenInclude(t => t!.Players)
            .FirstOrDefaultAsync(p => p.Id == playerId && p.EventId == eventId, ct);

        if (player is null)
            throw new NotFoundException("Player", playerId);

        if (player.CheckInStatus == CheckInStatus.CheckedIn)
            throw new ValidationException("Player is already checked in.");

        player.CheckInStatus = CheckInStatus.CheckedIn;
        player.CheckInAt     = DateTime.UtcNow;

        // Promote team to Complete when every member has checked in
        if (player.Team is not null)
        {
            var allIn = player.Team.Players
                .All(p => p.Id == playerId || p.CheckInStatus == CheckInStatus.CheckedIn);

            if (allIn)
                player.Team.CheckInStatus = CheckInStatus.Complete;
        }

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Checked in player {PlayerId} for event {EventId}", playerId, eventId);

        return MapToPlayerResponse(player);
    }

    public async Task RemoveAsync(
        Guid orgId, Guid eventId, Guid playerId, CancellationToken ct = default)
    {
        var evt = await _db.Events
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct);

        if (evt is null)
            throw new NotFoundException("Event", eventId);

        if (evt.Status is EventStatus.Scoring or EventStatus.Completed)
            throw new ValidationException(
                "Players cannot be removed once the event is Scoring or Completed.");

        var player = await _db.Players
            .FirstOrDefaultAsync(p => p.Id == playerId && p.EventId == eventId, ct);

        if (player is null)
            throw new NotFoundException("Player", playerId);

        _db.Players.Remove(player);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Removed player {PlayerId} ({Email}) from event {EventId}",
            playerId, player.Email, eventId);
    }

    // ── INTERNAL HELPER (used by QrService for QR-based check-in) ─────────────

    public async Task<PlayerResponse> CheckInByPlayerIdAsync(
        Guid playerId, Guid eventId, CancellationToken ct = default)
    {
        var player = await _db.Players
            .Include(p => p.Team)
                .ThenInclude(t => t!.Players)
            .FirstOrDefaultAsync(p => p.Id == playerId && p.EventId == eventId, ct);

        if (player is null)
            throw new NotFoundException("Player", playerId);

        if (player.CheckInStatus == CheckInStatus.CheckedIn)
            return MapToPlayerResponse(player); // idempotent — already done

        player.CheckInStatus = CheckInStatus.CheckedIn;
        player.CheckInAt     = DateTime.UtcNow;

        if (player.Team is not null)
        {
            var allIn = player.Team.Players
                .All(p => p.Id == playerId || p.CheckInStatus == CheckInStatus.CheckedIn);

            if (allIn)
                player.Team.CheckInStatus = CheckInStatus.Complete;
        }

        await _db.SaveChangesAsync(ct);
        return MapToPlayerResponse(player);
    }

    // ── PRIVATE ────────────────────────────────────────────────────────────────

    private async Task VerifyEventOwnershipAsync(Guid orgId, Guid eventId, CancellationToken ct)
    {
        var exists = await _db.Events
            .AnyAsync(e => e.Id == eventId && e.OrgId == orgId, ct);
        if (!exists)
            throw new NotFoundException("Event", eventId);
    }

    internal static PlayerResponse MapToPlayerResponse(Domain.Entities.Player p) => new()
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
}
