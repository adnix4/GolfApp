using System.Security.Claims;

namespace GolfFundraiserPro.Api.Common;

/// <summary>
/// Partition-key derivation for the ASP.NET rate limiter.
///
/// Extracted from ServiceCollectionExtensions so the key rules are unit-testable
/// (the repo exposes internals to WebAPI.Tests for exactly this reason) and so
/// the security reasoning lives in one place rather than inline in DI setup.
///
/// THREE KEYS, IN DESCENDING ORDER OF TRUST:
///   • <see cref="IdentityKey"/>  — the subject of a *validated* JWT. Not
///     client-forgeable, so an organizer gets their own bucket that follows them
///     across networks. Requires the rate limiter to run AFTER authentication
///     (see the pipeline note in Program.cs).
///   • <see cref="DeviceKey"/>    — the X-GFP-Device install id. Client-supplied
///     and therefore spoofable; safe only as a *fairness* split underneath the
///     per-IP ceiling, never as a security limit.
///   • <see cref="IpKey"/>        — the client address. The only key that cannot
///     be chosen by the caller, so every security policy (auth/join/donate/
///     brandExtract) keys on it and nothing else.
///
/// WHY THE SPLIT MATTERS: at a live event 100+ devices share ONE venue NAT IP.
/// A single per-IP bucket throttles a busy tournament; a purely client-keyed
/// bucket can be bypassed by rotating the header. The global limiter therefore
/// chains a high per-IP ceiling with a per-identity/device fairness bucket.
/// </summary>
internal static class RateLimitKeys
{
    /// <summary>Longest device id we will key on; bounds the partition table.</summary>
    internal const int MaxDeviceIdLength = 64;

    /// <summary>
    /// The client's IP. Behind a PaaS load balancer the socket IP is the proxy,
    /// so prefer the platform-set X-Forwarded-For (leftmost hop = original
    /// client). For strict anti-spoofing behind a proxy, configure
    /// ForwardedHeaders with known proxies/networks.
    /// </summary>
    internal static string IpKey(HttpContext http)
    {
        var forwarded = http.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwarded))
            return forwarded.Split(',')[0].Trim();
        return http.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }

    /// <summary>
    /// The authenticated user's stable id, or null when the request carries no
    /// validated identity. Reads the standard subject claims that the JWT bearer
    /// handler maps onto the principal.
    /// </summary>
    internal static string? IdentityKey(HttpContext http)
    {
        if (http.User?.Identity?.IsAuthenticated != true) return null;

        var sub = http.User.FindFirstValue(ClaimTypes.NameIdentifier)
               ?? http.User.FindFirstValue("sub");

        return string.IsNullOrWhiteSpace(sub) ? null : sub;
    }

    /// <summary>
    /// The mobile scorer's stable install id, or null when absent. Truncated so a
    /// caller cannot grow the partition table with unbounded keys.
    /// </summary>
    internal static string? DeviceKey(HttpContext http)
    {
        var device = http.Request.Headers["X-GFP-Device"].ToString();
        if (string.IsNullOrWhiteSpace(device)) return null;
        return device.Length <= MaxDeviceIdLength ? device : device[..MaxDeviceIdLength];
    }

    /// <summary>
    /// Fairness key for the global limiter, most trusted first:
    /// authenticated identity → device install id → IP.
    ///
    /// The identity branch is what keeps an organizer's dashboard working while
    /// 150 spectator browsers saturate the shared venue-IP bucket: staff traffic
    /// is keyed on a signature-verified token, so it never competes with the
    /// anonymous pool it happens to share a NAT with.
    /// </summary>
    internal static string FairnessKey(HttpContext http)
    {
        if (IdentityKey(http) is { } user)   return "user:" + user;
        if (DeviceKey(http)   is { } device) return "dev:"  + device;
        return "ip:" + IpKey(http);
    }
}
