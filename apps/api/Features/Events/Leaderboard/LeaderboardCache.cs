using StackExchange.Redis;

namespace GolfFundraiserPro.Api.Features.Events.Leaderboard;

/// <summary>
/// Redis read-through cache for the public leaderboard response.
///
/// Spec §3 Phase 3: "Redis leaderboard cache: 2–5 second TTL absorbs
/// shotgun-burst load spikes." A short TTL is intentionally relied upon
/// for invalidation — the cache is never deleted on write, so 36 teams
/// scoring within one TTL window collapse to a single DB hit.
///
/// No-op when Redis is not configured (REDIS_URL unset in dev).
/// </summary>
public class LeaderboardCache
{
    private readonly IDatabase? _db;
    private readonly ILogger<LeaderboardCache> _log;

    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(2);

    public LeaderboardCache(IServiceProvider services, ILogger<LeaderboardCache> log)
    {
        _log = log;
        _db  = services.GetService<IConnectionMultiplexer>()?.GetDatabase();
    }

    public bool IsEnabled => _db is not null;

    public async Task<string?> GetPublicAsync(string eventCode)
    {
        if (_db is null) return null;
        try
        {
            var val = await _db.StringGetAsync(KeyFor(eventCode));
            return val.IsNullOrEmpty ? null : val.ToString();
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Leaderboard cache GET failed for {EventCode}", eventCode);
            return null;
        }
    }

    public async Task SetPublicAsync(string eventCode, string json)
    {
        if (_db is null) return;
        try
        {
            await _db.StringSetAsync(KeyFor(eventCode), json, Ttl);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Leaderboard cache SET failed for {EventCode}", eventCode);
        }
    }

    private static string KeyFor(string eventCode) =>
        $"leaderboard:public:{eventCode.ToUpperInvariant()}";
}
