using GolfFundraiserPro.Api.Features.RealTime;

namespace WebAPI.Tests.Helpers;

/// <summary>
/// No-op IRealTimeService stub for integration tests — swallows all SignalR calls.
/// </summary>
public sealed class NullRealTimeService : IRealTimeService
{
    public Task PublishScoreAsync(
        string eventCode, Guid eventId, Guid teamId,
        short holeNumber, short grossScore, string teamName,
        CancellationToken ct = default) => Task.CompletedTask;

    public Task SendBidPlacedAsync(
        string eventCode, Guid itemId, Guid playerId, int amountCents,
        bool isDonation, CancellationToken ct = default) => Task.CompletedTask;

    public Task SendAuctionExtendedAsync(
        string eventCode, Guid itemId, DateTime newClosesAt,
        CancellationToken ct = default) => Task.CompletedTask;

    public Task SendItemClosedAsync(
        string eventCode, Guid itemId, Guid? winnerId, int finalAmountCents,
        CancellationToken ct = default) => Task.CompletedTask;

    public Task SendLiveAuctionStartedAsync(
        string eventCode, Guid sessionId, CancellationToken ct = default) => Task.CompletedTask;

    public Task SendLiveItemAdvancedAsync(
        string eventCode, Guid? itemId, CancellationToken ct = default) => Task.CompletedTask;

    public Task SendPledgeReceivedAsync(
        string eventCode, Guid itemId, Guid playerId, int amountCents,
        CancellationToken ct = default) => Task.CompletedTask;

    public Task SendAuctionTotalUpdatedAsync(
        string eventCode, Guid itemId, int totalCents, CancellationToken ct = default) => Task.CompletedTask;

    public Task SendAuctionAmountUpdatedAsync(
        string eventCode, Guid? itemId, int amountCents, CancellationToken ct = default) => Task.CompletedTask;
}
