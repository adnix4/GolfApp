using StackExchange.Redis;

namespace GolfFundraiserPro.Api.Common;

/// <summary>
/// Counts FAILED join attempts per client IP and cuts off a prober.
///
/// WHY THIS EXISTS: /join answers NotFound for an email that isn't on the
/// roster, which is a genuine enumeration oracle — given an event code, an
/// attacker can test whether an address is registered. That used to be held
/// back by a blunt 60 requests/minute IP limit on the endpoint, which also
/// capped legitimate arrivals: a venue puts every phone behind one NAT, and the
/// A3 verification flow costs two calls per first join, so a 144-player shotgun
/// start spent about five minutes being rejected at the first tee.
///
/// Limiting OUTCOMES instead of volume gets both properties. A golfer who is on
/// the roster and types their own email never records a failure, so arrivals are
/// uncapped. A prober records a failure every single attempt and is stopped
/// after <see cref="MaxFailuresPerWindow"/> — far tighter than 60 attempts a
/// minute ever was.
///
/// The key is the caller's IP and nothing else: a client-supplied key (device
/// header) would let a prober reset their own budget at will. This is the same
/// rule the July 2026 review set for every security-sensitive policy.
///
/// STORAGE: Redis when configured — production fails fast without REDIS_URL
/// unless GFP_ALLOW_NO_REDIS=true — so the budget is shared across instances and
/// survives a restart. Without Redis it degrades to a per-process in-memory
/// window, mirroring how LeaderboardCache no-ops in dev. Degraded mode still
/// limits; it just forgets sooner.
/// </summary>
public class JoinAttemptLimiter
{
    /// <summary>Failed joins from one IP before further attempts are refused.</summary>
    public const int MaxFailuresPerWindow = 10;

    /// <summary>How long a recorded failure counts against the caller.</summary>
    public static readonly TimeSpan Window = TimeSpan.FromHours(1);

    private readonly IDatabase? _redis;
    private readonly ILogger<JoinAttemptLimiter> _log;

    // Fallback only — used when Redis is absent. Bounded by pruning on read.
    private static readonly Dictionary<string, List<DateTime>> Memory = new();
    private static readonly object MemoryLock = new();

    public JoinAttemptLimiter(IServiceProvider services, ILogger<JoinAttemptLimiter> log)
    {
        _log   = log;
        _redis = services.GetService<IConnectionMultiplexer>()?.GetDatabase();
    }

    /// <summary>True when this IP has burned its failure budget.</summary>
    public async Task<bool> IsBlockedAsync(string ip)
    {
        if (string.IsNullOrWhiteSpace(ip)) return false;

        if (_redis is not null)
        {
            try
            {
                var val = await _redis.StringGetAsync(KeyFor(ip));
                return val.HasValue && (int)val >= MaxFailuresPerWindow;
            }
            catch (Exception ex)
            {
                // Never let a cache outage lock golfers out of an event.
                _log.LogWarning(ex, "Join attempt limiter read failed for {Ip}", ip);
                return false;
            }
        }

        lock (MemoryLock) return CountRecentLocked(ip) >= MaxFailuresPerWindow;
    }

    /// <summary>
    /// Records one failed join (unknown email, or a wrong/expired verification
    /// code). Successful joins must NOT call this — that is the whole point.
    /// </summary>
    public async Task RecordFailureAsync(string ip)
    {
        if (string.IsNullOrWhiteSpace(ip)) return;

        if (_redis is not null)
        {
            try
            {
                var key   = KeyFor(ip);
                var count = await _redis.StringIncrementAsync(key);
                // Set the TTL on first write so the window starts at the first
                // failure rather than sliding forward with every later one.
                if (count == 1) await _redis.KeyExpireAsync(key, Window);
                return;
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Join attempt limiter write failed for {Ip}", ip);
                return;
            }
        }

        lock (MemoryLock)
        {
            CountRecentLocked(ip);                      // prunes as a side effect
            if (!Memory.TryGetValue(ip, out var stamps))
                Memory[ip] = stamps = [];
            stamps.Add(DateTime.UtcNow);
        }
    }

    /// <summary>Clears a caller's budget. Used by tests and after a real success.</summary>
    public async Task ResetAsync(string ip)
    {
        if (string.IsNullOrWhiteSpace(ip)) return;

        if (_redis is not null)
        {
            try { await _redis.KeyDeleteAsync(KeyFor(ip)); }
            catch (Exception ex) { _log.LogWarning(ex, "Join attempt limiter reset failed for {Ip}", ip); }
            return;
        }

        lock (MemoryLock) Memory.Remove(ip);
    }

    // Counts failures still inside the window, dropping expired ones (and the
    // whole entry when it empties, so the dictionary can't grow without bound).
    private static int CountRecentLocked(string ip)
    {
        if (!Memory.TryGetValue(ip, out var stamps)) return 0;

        var cutoff = DateTime.UtcNow - Window;
        stamps.RemoveAll(t => t < cutoff);
        if (stamps.Count == 0)
        {
            Memory.Remove(ip);
            return 0;
        }
        return stamps.Count;
    }

    private static string KeyFor(string ip) => $"join:fail:{ip}";

    /// <summary>Test seam — drops all in-memory state between test cases.</summary>
    internal static void ResetMemoryForTests()
    {
        lock (MemoryLock) Memory.Clear();
    }
}
