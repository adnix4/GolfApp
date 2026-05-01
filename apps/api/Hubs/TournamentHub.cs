using Microsoft.AspNetCore.SignalR;

namespace GolfFundraiserPro.Api.Hubs;

/// <summary>
/// Real-time WebSocket hub. Clients join a group by event code on connect.
/// The server pushes score and leaderboard events; clients never push to this hub.
/// </summary>
public class TournamentHub : Hub
{
    /// <summary>Adds this connection to the event's SignalR group.</summary>
    public async Task JoinEvent(string eventCode) =>
        await Groups.AddToGroupAsync(Context.ConnectionId, eventCode.ToUpperInvariant());
}
