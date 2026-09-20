using System.Net;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Xunit;
using GolfFundraiserPro.Api.Common;

namespace WebAPI.Tests.Services;

/// <summary>
/// Partition keys decide who shares a rate-limit bucket with whom, so they are
/// security-relevant in both directions: too coarse and a venue NAT throttles a
/// whole tournament, too trusting and a caller picks their own bucket to escape
/// a brute-force limit.
///
/// The ordering under test — identity, then device, then IP — is what keeps an
/// organizer's dashboard responsive while 150 spectator browsers saturate the
/// shared venue-IP bucket they happen to sit behind.
/// </summary>
public class RateLimitKeysTests
{
    private static HttpContext Ctx(
        string? remoteIp = "203.0.113.7",
        string? forwardedFor = null,
        string? device = null,
        string? userId = null)
    {
        var http = new DefaultHttpContext();

        if (remoteIp is not null)
            http.Connection.RemoteIpAddress = IPAddress.Parse(remoteIp);

        if (forwardedFor is not null)
            http.Request.Headers["X-Forwarded-For"] = forwardedFor;

        if (device is not null)
            http.Request.Headers["X-GFP-Device"] = device;

        if (userId is not null)
        {
            var identity = new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, userId)],
                authenticationType: "Bearer");
            http.User = new ClaimsPrincipal(identity);
        }

        return http;
    }

    // ── IpKey ────────────────────────────────────────────────────────────────

    [Fact]
    public void IpKey_uses_the_socket_address_when_no_proxy_header()
    {
        Assert.Equal("203.0.113.7", RateLimitKeys.IpKey(Ctx()));
    }

    [Fact]
    public void IpKey_prefers_the_leftmost_forwarded_hop()
    {
        // Behind a PaaS load balancer the socket address is the proxy; the
        // original client is the first entry in X-Forwarded-For.
        var http = Ctx(forwardedFor: "198.51.100.4, 10.0.0.1, 10.0.0.2");
        Assert.Equal("198.51.100.4", RateLimitKeys.IpKey(http));
    }

    [Fact]
    public void IpKey_trims_whitespace_around_the_forwarded_hop()
    {
        Assert.Equal("198.51.100.4", RateLimitKeys.IpKey(Ctx(forwardedFor: "  198.51.100.4  , 10.0.0.1")));
    }

    [Fact]
    public void IpKey_ignores_a_blank_forwarded_header()
    {
        Assert.Equal("203.0.113.7", RateLimitKeys.IpKey(Ctx(forwardedFor: "   ")));
    }

    [Fact]
    public void IpKey_falls_back_to_unknown_without_an_address()
    {
        // Never null: a null key would throw inside the partitioner and take the
        // request down instead of limiting it.
        Assert.Equal("unknown", RateLimitKeys.IpKey(Ctx(remoteIp: null)));
    }

    // ── DeviceKey ────────────────────────────────────────────────────────────

    [Fact]
    public void DeviceKey_is_null_when_the_header_is_absent()
    {
        Assert.Null(RateLimitKeys.DeviceKey(Ctx()));
    }

    [Fact]
    public void DeviceKey_is_null_when_the_header_is_blank()
    {
        Assert.Null(RateLimitKeys.DeviceKey(Ctx(device: "   ")));
    }

    [Fact]
    public void DeviceKey_returns_a_short_install_id_unchanged()
    {
        Assert.Equal("mob-123-abcdef", RateLimitKeys.DeviceKey(Ctx(device: "mob-123-abcdef")));
    }

    [Fact]
    public void DeviceKey_truncates_an_overlong_install_id()
    {
        // Bounds the partition table: a caller must not be able to mint
        // unlimited buckets by sending unlimited-length ids.
        var long_ = new string('x', 300);
        var key   = RateLimitKeys.DeviceKey(Ctx(device: long_));

        Assert.NotNull(key);
        Assert.Equal(RateLimitKeys.MaxDeviceIdLength, key!.Length);
    }

    // ── IdentityKey ──────────────────────────────────────────────────────────

    [Fact]
    public void IdentityKey_is_null_for_an_anonymous_request()
    {
        Assert.Null(RateLimitKeys.IdentityKey(Ctx()));
    }

    [Fact]
    public void IdentityKey_returns_the_subject_of_an_authenticated_principal()
    {
        Assert.Equal("user-42", RateLimitKeys.IdentityKey(Ctx(userId: "user-42")));
    }

    // ── FairnessKey: the trust ordering ──────────────────────────────────────

    [Fact]
    public void FairnessKey_falls_back_to_ip_when_nothing_else_identifies_the_caller()
    {
        Assert.Equal("ip:203.0.113.7", RateLimitKeys.FairnessKey(Ctx()));
    }

    [Fact]
    public void FairnessKey_prefers_the_device_over_the_ip()
    {
        // This is what gives 100+ phones behind one venue NAT a bucket each.
        Assert.Equal("dev:mob-1", RateLimitKeys.FairnessKey(Ctx(device: "mob-1")));
    }

    [Fact]
    public void FairnessKey_prefers_the_authenticated_identity_over_the_device()
    {
        var http = Ctx(device: "mob-1", userId: "user-42");
        Assert.Equal("user:user-42", RateLimitKeys.FairnessKey(http));
    }

    [Fact]
    public void FairnessKey_gives_an_organizer_a_bucket_away_from_the_venue_ip()
    {
        // The §2b guarantee: staff on the same NAT as the golfers must not share
        // the anonymous pool those golfers' browsers can exhaust.
        var organizer = Ctx(remoteIp: "203.0.113.7", userId: "org-admin-1");
        var spectator = Ctx(remoteIp: "203.0.113.7");

        Assert.NotEqual(RateLimitKeys.FairnessKey(spectator), RateLimitKeys.FairnessKey(organizer));
    }

    [Fact]
    public void FairnessKey_separates_two_organizers_on_the_same_address()
    {
        var a = Ctx(userId: "org-admin-1");
        var b = Ctx(userId: "org-admin-2");

        Assert.NotEqual(RateLimitKeys.FairnessKey(a), RateLimitKeys.FairnessKey(b));
    }

    [Fact]
    public void FairnessKey_namespaces_the_key_so_a_device_cannot_impersonate_an_ip()
    {
        // Without the prefixes a caller could send X-GFP-Device: "203.0.113.7"
        // and land in another client's IP bucket.
        var spoofer = Ctx(remoteIp: "198.51.100.1", device: "203.0.113.7");

        Assert.Equal("dev:203.0.113.7", RateLimitKeys.FairnessKey(spoofer));
        Assert.NotEqual(RateLimitKeys.FairnessKey(Ctx(remoteIp: "203.0.113.7")),
                        RateLimitKeys.FairnessKey(spoofer));
    }
}
