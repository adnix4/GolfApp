using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Hubs;
using GolfFundraiserPro.Api.Features.Events.Leaderboard;
using GolfFundraiserPro.Api.Features.Notifications;

namespace GolfFundraiserPro.Api.Features.RealTime;

/// <summary>
/// Scoped service that wraps the SignalR hub context.
///
/// On a score push: emits a lightweight ScoreUpdated for the affected team
/// (uses the already-coalesced broadcaster to compute the team's new rank),
/// then asks LeaderboardBroadcaster to coalesce a full LeaderboardRefreshed.
/// </summary>
public class RealTimeService : IRealTimeService
{
    private readonly IHubContext<TournamentHub>  _hub;
    private readonly ApplicationDbContext        _db;
    private readonly PushNotificationService     _push;
    private readonly ILogger<RealTimeService>    _logger;
    private readonly LeaderboardBroadcaster      _broadcaster;

    public RealTimeService(
        IHubContext<TournamentHub>  hub,
        ApplicationDbContext        db,
        PushNotificationService     push,
        ILogger<RealTimeService>    logger,
        LeaderboardBroadcaster      broadcaster)
    {
        _hub         = hub;
        _db          = db;
        _push        = push;
        _logger      = logger;
        _broadcaster = broadcaster;
    }

    /// <summary>
    /// Fires lightweight ScoreUpdated + optional HoleInOneAlert immediately,
    /// and requests a coalesced LeaderboardRefreshed (at most one per ~1.5 s
    /// per event). Computes the scoring team's new rank inline so the
    /// ScoreUpdated payload has accurate totals.
    /// </summary>
    public async Task PublishScoreAsync(
        string eventCode, Guid eventId, Guid teamId,
        short holeNumber, short grossScore, string teamName,
        CancellationToken ct = default)
    {
        var meta = await LeaderboardLoader.LoadEventAsync(_db, eventId, ct);
        if (meta is null) return;

        var standings = await LeaderboardLoader.LoadStandingsAsync(_db, meta, ct);
        var entry     = standings.FirstOrDefault(s => s.TeamId == teamId);

        await TrySendAsync("ScoreUpdated", eventCode, new
        {
            teamId,
            holeNumber,
            grossScore,
            toParTotal       = entry?.ToPar            ?? 0,
            stablefordPoints = entry?.StablefordPoints ?? 0,
            rank             = entry?.Rank             ?? 0,
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

        _broadcaster.RequestBroadcast(eventCode, eventId);
    }

    /// <summary>
    /// Called by BatchSyncAsync after a mobile device flushes multiple offline
    /// scores. Fires hole-in-one alerts for each, then a single coalesced
    /// LeaderboardRefreshed.
    /// </summary>
    public async Task PublishLeaderboardAsync(
        string eventCode, Guid eventId,
        IEnumerable<(Guid TeamId, string TeamName, short HoleNumber, short GrossScore)> acceptedScores,
        CancellationToken ct = default)
    {
        foreach (var (_, teamName, holeNumber, grossScore) in acceptedScores)
        {
            if (grossScore != 1) continue;

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

        _broadcaster.RequestBroadcast(eventCode, eventId);
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

    public async Task SendBidderCountUpdatedAsync(
        string eventCode, int count, CancellationToken ct = default) =>
        await TrySendAsync("BidderCountUpdated", eventCode,
            new { count }, ct);

    public async Task SendSponsorsChangedAsync(
        string eventCode, int version, CancellationToken ct = default) =>
        await TrySendAsync("SponsorsChanged", eventCode,
            new { version }, ct);

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
}
