namespace GolfFundraiserPro.Api.Features.RealTime;

/// <summary>
/// Abstraction over RealTimeService so AuctionService and ScoreService can be
/// tested without a real SignalR hub or Redis connection.
/// </summary>
public interface IRealTimeService
{
    Task PublishScoreAsync(
        string eventCode, Guid eventId, Guid teamId,
        short holeNumber, short grossScore, string teamName,
        CancellationToken ct = default);

    Task SendBidPlacedAsync(
        string eventCode, Guid itemId, Guid playerId, int amountCents,
        bool isDonation, CancellationToken ct = default);

    Task SendAuctionExtendedAsync(
        string eventCode, Guid itemId, DateTime newClosesAt, CancellationToken ct = default);

    Task SendItemClosedAsync(
        string eventCode, Guid itemId, Guid? winnerId, int finalAmountCents,
        CancellationToken ct = default);

    Task SendLiveAuctionStartedAsync(
        string eventCode, Guid sessionId, CancellationToken ct = default);

    Task SendLiveItemAdvancedAsync(
        string eventCode, Guid? itemId, CancellationToken ct = default);

    Task SendPledgeReceivedAsync(
        string eventCode, Guid itemId, Guid playerId, int amountCents,
        CancellationToken ct = default);

    Task SendAuctionTotalUpdatedAsync(
        string eventCode, Guid itemId, int totalCents, CancellationToken ct = default);

    Task SendAuctionAmountUpdatedAsync(
        string eventCode, Guid? itemId, int amountCents, CancellationToken ct = default);

    Task SendBidderCountUpdatedAsync(
        string eventCode, int count, CancellationToken ct = default);
}
