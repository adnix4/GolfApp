using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Hubs;

namespace GolfFundraiserPro.Api.Features.Events.Leaderboard;

/// <summary>
/// Coalesces SignalR LeaderboardRefreshed broadcasts per event.
///
/// Without coalescing, a 36-team shotgun start produces ~36 standings
/// recomputes + broadcasts per scoring burst (spec §3 calls this out as
/// the load spike Redis is supposed to absorb). With coalescing, each
/// event emits at most one broadcast per CoalesceWindow (~1.5 s, slightly
/// under the 2 s public-cache TTL).
///
/// Singleton because it owns long-lived per-event state (the schedule
/// table) and a hub context. Uses IServiceScopeFactory to materialise a
/// fresh DbContext for each flush since the singleton lifetime outlives
/// the request scope.
/// </summary>
public class LeaderboardBroadcaster
{
    private static readonly TimeSpan CoalesceWindow = TimeSpan.FromMilliseconds(1500);

    private readonly IHubContext<TournamentHub>   _hub;
    private readonly IServiceScopeFactory         _scopes;
    private readonly ILogger<LeaderboardBroadcaster> _log;

    private readonly ConcurrentDictionary<string, EventBroadcastState> _state = new();

    private sealed class EventBroadcastState
    {
        public Guid     EventId;
        public DateTime LastSentUtc;
        public bool     Scheduled;
    }

    public LeaderboardBroadcaster(
        IHubContext<TournamentHub>      hub,
        IServiceScopeFactory            scopes,
        ILogger<LeaderboardBroadcaster> log)
    {
        _hub    = hub;
        _scopes = scopes;
        _log    = log;
    }

    /// <summary>
    /// Records a pending leaderboard change. Fires a broadcast immediately
    /// if the previous broadcast for this event is older than CoalesceWindow,
    /// otherwise schedules a single flush for when the window expires.
    /// Idempotent: additional calls inside an active window are absorbed.
    /// </summary>
    public void RequestBroadcast(string eventCode, Guid eventId)
    {
        if (string.IsNullOrEmpty(eventCode)) return;

        var st = _state.GetOrAdd(eventCode, _ => new EventBroadcastState());

        bool fireNow;
        TimeSpan delay = TimeSpan.Zero;

        lock (st)
        {
            st.EventId = eventId;
            var elapsed = DateTime.UtcNow - st.LastSentUtc;

            if (elapsed >= CoalesceWindow)
            {
                st.LastSentUtc = DateTime.UtcNow;
                fireNow = true;
            }
            else
            {
                if (st.Scheduled) return;
                st.Scheduled = true;
                delay = CoalesceWindow - elapsed;
                fireNow = false;
            }
        }

        if (fireNow)
        {
            _ = SendAsync(eventCode, eventId);
        }
        else
        {
            _ = ScheduleFlushAsync(eventCode, st, delay);
        }
    }

    private async Task ScheduleFlushAsync(string eventCode, EventBroadcastState st, TimeSpan delay)
    {
        try
        {
            await Task.Delay(delay);
            Guid eventId;
            lock (st)
            {
                st.Scheduled   = false;
                st.LastSentUtc = DateTime.UtcNow;
                eventId        = st.EventId;
            }
            await SendAsync(eventCode, eventId);
        }
        catch (Exception ex)
        {
            lock (st) { st.Scheduled = false; }
            _log.LogWarning(ex, "Coalesced flush failed for {EventCode}", eventCode);
        }
    }

    private async Task SendAsync(string eventCode, Guid eventId)
    {
        try
        {
            using var scope = _scopes.CreateScope();
            var db   = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var meta = await LeaderboardLoader.LoadEventAsync(db, eventId, CancellationToken.None);
            if (meta is null) return;

            var standings = await LeaderboardLoader.LoadStandingsAsync(db, meta, CancellationToken.None);
            await _hub.Clients.Group(eventCode).SendAsync("LeaderboardRefreshed", new { standings });
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "LeaderboardRefreshed broadcast failed for {EventCode}", eventCode);
        }
    }
}
