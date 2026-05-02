using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Hubs;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Notifications;

namespace GolfFundraiserPro.Api.Features.RealTime;

/// <summary>
/// Scoped service that wraps the SignalR hub context and Redis cache.
/// Called by ScoreService and MobileService after a score is persisted.
/// </summary>
public class RealTimeService : IRealTimeService
{
    private readonly IHubContext<TournamentHub> _hub;
    private readonly ApplicationDbContext _db;
    private readonly PushNotificationService _push;
    private readonly ILogger<RealTimeService> _logger;
    private readonly IDatabase? _cache;

    public RealTimeService(
        IHubContext<TournamentHub> hub,
        ApplicationDbContext db,
        PushNotificationService push,
        ILogger<RealTimeService> logger,
        IServiceProvider services)
    {
        _hub    = hub;
        _db     = db;
        _push   = push;
        _logger = logger;
        _cache  = services.GetService<IConnectionMultiplexer>()?.GetDatabase();
    }

    /// <summary>
    /// Fires ScoreUpdated + optional HoleInOneAlert + LeaderboardRefreshed
    /// for a single score submission, then invalidates the Redis leaderboard cache.
    /// </summary>
    public async Task PublishScoreAsync(
        string eventCode, Guid eventId, Guid teamId,
        short holeNumber, short grossScore, string teamName,
        CancellationToken ct = default)
    {
        var standings = await ComputeStandingsAsync(eventId, ct);
        var entry     = standings.FirstOrDefault(s => s.TeamId == teamId);

        await TrySendAsync("ScoreUpdated", eventCode, new
        {
            teamId,
            holeNumber,
            grossScore,
            toParTotal = entry?.ToPar ?? 0,
            rank       = entry?.Rank   ?? 0,
        }, ct);

        if (grossScore == 1)
        {
            await TrySendAsync("HoleInOneAlert", eventCode, new
            {
                teamName,
                playerName = teamName,
                holeNumber,
            }, ct);

            await SendHoleInOnePushAsync(eventId, teamName, holeNumber, ct);

            _logger.LogInformation(
                "Hole-in-one on event {EventCode} hole {Hole} by team '{Team}'",
                eventCode, holeNumber, teamName);
        }

        await TrySendAsync("LeaderboardRefreshed", eventCode, new { standings }, ct);
        await InvalidateCacheAsync(eventCode);
    }

    /// <summary>
    /// Fires a single LeaderboardRefreshed event — used by BatchSyncAsync after
    /// saving multiple scores so we don't spam individual ScoreUpdated calls.
    /// </summary>
    public async Task PublishLeaderboardAsync(
        string eventCode, Guid eventId,
        IEnumerable<(Guid TeamId, string TeamName, short HoleNumber, short GrossScore)> acceptedScores,
        CancellationToken ct = default)
    {
        // Fire HoleInOneAlert for any hole-in-one in this batch
        foreach (var (teamId, teamName, holeNumber, grossScore) in acceptedScores)
        {
            if (grossScore == 1)
            {
                await TrySendAsync("HoleInOneAlert", eventCode, new
                {
                    teamName,
                    playerName = teamName,
                    holeNumber,
                }, ct);

                await SendHoleInOnePushAsync(eventId, teamName, holeNumber, ct);

                _logger.LogInformation(
                    "Hole-in-one on event {EventCode} hole {Hole} by team '{Team}'",
                    eventCode, holeNumber, teamName);
            }
        }

        var standings = await ComputeStandingsAsync(eventId, ct);
        await TrySendAsync("LeaderboardRefreshed", eventCode, new { standings }, ct);
        await InvalidateCacheAsync(eventCode);
    }

    /// <summary>
    /// Fires CheckInUpdated after a player is checked in.
    /// Queries current checked-in count so the admin dashboard counter stays accurate.
    /// </summary>
    public async Task SendCheckInUpdatedAsync(
        string eventCode, Guid eventId, CancellationToken ct = default)
    {
        var total     = await _db.Players.CountAsync(p => p.EventId == eventId, ct);
        var checkedIn = await _db.Players
            .CountAsync(p => p.EventId == eventId &&
                (p.CheckInStatus == Domain.Enums.CheckInStatus.CheckedIn ||
                 p.CheckInStatus == Domain.Enums.CheckInStatus.Complete), ct);

        await TrySendAsync("CheckInUpdated", eventCode, new { checkedIn, total }, ct);
    }

    public async Task SendChallengeUpdatedAsync(
        string eventCode, Guid challengeId, string leaderId, object leaderValue,
        CancellationToken ct = default) =>
        await TrySendAsync("ChallengeUpdated", eventCode,
            new { challengeId, leaderId, leaderValue }, ct);

    public async Task SendFundraisingUpdatedAsync(
        string eventCode, decimal grandTotal, CancellationToken ct = default) =>
        await TrySendAsync("FundraisingUpdated", eventCode, new { grandTotal }, ct);

    // ── PHASE 4 AUCTION EVENTS ─────────────────────────────────────────────────

    public async Task SendBidPlacedAsync(
        string eventCode, Guid itemId, Guid playerId, int amountCents,
        bool isDonation, CancellationToken ct = default) =>
        await TrySendAsync("BidPlaced", eventCode,
            new { itemId, playerId, amountCents, isDonation }, ct);

    public async Task SendAuctionExtendedAsync(
        string eventCode, Guid itemId, DateTime newClosesAt, CancellationToken ct = default) =>
        await TrySendAsync("AuctionExtended", eventCode,
            new { itemId, newClosesAt }, ct);

    public async Task SendItemClosedAsync(
        string eventCode, Guid itemId, Guid? winnerId, int finalAmountCents,
        CancellationToken ct = default) =>
        await TrySendAsync("ItemClosed", eventCode,
            new { itemId, winnerId, finalAmountCents }, ct);

    public async Task SendLiveAuctionStartedAsync(
        string eventCode, Guid sessionId, CancellationToken ct = default) =>
        await TrySendAsync("LiveAuctionStarted", eventCode, new { sessionId }, ct);

    public async Task SendLiveItemAdvancedAsync(
        string eventCode, Guid? itemId, CancellationToken ct = default) =>
        await TrySendAsync("LiveItemAdvanced", eventCode, new { itemId }, ct);

    public async Task SendPledgeReceivedAsync(
        string eventCode, Guid itemId, Guid playerId, int amountCents,
        CancellationToken ct = default) =>
        await TrySendAsync("PledgeReceived", eventCode,
            new { itemId, playerId, amountCents }, ct);

    public async Task SendAuctionTotalUpdatedAsync(
        string eventCode, Guid itemId, int totalCents, CancellationToken ct = default) =>
        await TrySendAsync("AuctionTotalUpdated", eventCode,
            new { itemId, totalCents }, ct);

    public async Task SendAuctionAmountUpdatedAsync(
        string eventCode, Guid? itemId, int amountCents, CancellationToken ct = default) =>
        await TrySendAsync("AuctionAmountUpdated", eventCode,
            new { itemId, amountCents }, ct);

    // ── HELPERS ────────────────────────────────────────────────────────────────

    private async Task TrySendAsync(string method, string eventCode, object payload, CancellationToken ct)
    {
        try
        {
            await _hub.Clients.Group(eventCode).SendAsync(method, payload, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SignalR {Method} failed for event {EventCode}", method, eventCode);
        }
    }

    private async Task InvalidateCacheAsync(string eventCode)
    {
        if (_cache is null) return;
        try { await _cache.KeyDeleteAsync($"leaderboard:{eventCode}"); }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Redis invalidation failed for {EventCode}", eventCode);
        }
    }

    // Fetches all player push tokens for the event and sends a hole-in-one push notification.
    private async Task SendHoleInOnePushAsync(
        Guid eventId, string teamName, short holeNumber, CancellationToken ct)
    {
        var tokens = await _db.Players
            .Where(p => p.EventId == eventId && p.ExpoPushToken != null)
            .Select(p => p.ExpoPushToken!)
            .ToListAsync(ct);

        if (tokens.Count == 0) return;

        await _push.SendAsync(
            tokens,
            title: "Hole-in-One!",
            body:  $"{teamName} just made a hole-in-one on hole {holeNumber}!",
            data:  new { type = "hole_in_one", teamName, holeNumber },
            ct:    ct);
    }

    // Computes standings from live DB data. Uses par-4 default when no course is attached.
    private async Task<List<StandingEntry>> ComputeStandingsAsync(Guid eventId, CancellationToken ct)
    {
        var teams = await _db.Teams
            .Where(t => t.EventId == eventId)
            .Select(t => new { t.Id, t.Name })
            .ToListAsync(ct);

        var scores = await _db.Scores
            .Where(s => s.EventId == eventId && !s.IsConflicted)
            .Select(s => new { s.TeamId, s.GrossScore, s.HoleNumber })
            .ToListAsync(ct);

        var byTeam = scores
            .GroupBy(s => s.TeamId)
            .ToDictionary(g => g.Key, g => g.ToList());

        var entries = teams.Select(t =>
        {
            var ts    = byTeam.GetValueOrDefault(t.Id, []);
            var gross = ts.Sum(s => (int)s.GrossScore);
            var holes = ts.Count;
            var toPar = gross - (holes * 4);
            return new StandingEntry
            {
                TeamId   = t.Id,
                TeamName = t.Name,
                Gross    = gross,
                ToPar    = toPar,
                Thru     = holes,
            };
        })
        .OrderBy(e => e.ToPar)
        .ThenBy(e => e.Gross)
        .ToList();

        for (var i = 0; i < entries.Count; i++)
            entries[i] = entries[i] with { Rank = i + 1 };

        return entries;
    }

    // ── MODELS ─────────────────────────────────────────────────────────────────

    internal sealed record StandingEntry
    {
        public Guid   TeamId   { get; init; }
        public string TeamName { get; init; } = string.Empty;
        public int    Gross    { get; init; }
        public int    ToPar    { get; init; }
        public int    Thru     { get; init; }
        public int    Rank     { get; init; }
    }
}
