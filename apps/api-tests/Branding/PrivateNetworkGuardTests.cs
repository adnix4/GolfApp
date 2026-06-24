using System.Net;
using Xunit;
using GolfFundraiserPro.Api.Features.Events.Branding;

namespace WebAPI.Tests.Branding;

/// <summary>
/// SSRF guard is security-critical: it decides whether the brand-extraction
/// fetcher may connect to a resolved address. Every internal range must stay
/// blocked; ordinary public addresses must stay reachable.
/// </summary>
public class PrivateNetworkGuardTests
{
    [Theory]
    // loopback
    [InlineData("127.0.0.1")]
    [InlineData("127.5.5.5")]
    [InlineData("::1")]
    // RFC1918 private
    [InlineData("10.0.0.1")]
    [InlineData("10.255.255.255")]
    [InlineData("172.16.0.1")]
    [InlineData("172.31.255.255")]
    [InlineData("192.168.0.1")]
    // link-local + the cloud-metadata endpoint
    [InlineData("169.254.0.1")]
    [InlineData("169.254.169.254")]
    [InlineData("fe80::1")]
    // unique-local IPv6, unspecified, multicast, broadcast
    [InlineData("fc00::1")]
    [InlineData("fd12:3456:789a::1")]
    [InlineData("0.0.0.0")]
    [InlineData("::")]
    [InlineData("224.0.0.1")]
    [InlineData("239.1.2.3")]
    [InlineData("ff02::1")]
    [InlineData("255.255.255.255")]
    // CGNAT 100.64.0.0/10
    [InlineData("100.64.0.1")]
    [InlineData("100.127.255.255")]
    // IPv4-mapped IPv6 that resolves to an internal v4 address
    [InlineData("::ffff:10.0.0.1")]
    [InlineData("::ffff:127.0.0.1")]
    public void IsBlocked_blocks_internal_addresses(string ip)
    {
        Assert.True(PrivateNetworkGuard.IsBlocked(IPAddress.Parse(ip)), $"{ip} should be blocked");
    }

    [Theory]
    [InlineData("8.8.8.8")]
    [InlineData("1.1.1.1")]
    [InlineData("93.184.216.34")]        // example.com
    [InlineData("172.15.255.255")]       // just below the 172.16/12 private block
    [InlineData("172.32.0.1")]           // just above it
    [InlineData("192.167.255.255")]      // just below 192.168/16
    [InlineData("100.63.255.255")]       // just below CGNAT
    [InlineData("100.128.0.1")]          // just above CGNAT
    [InlineData("2606:4700:4700::1111")] // Cloudflare DNS (v6)
    [InlineData("2001:4860:4860::8888")] // Google DNS (v6)
    public void IsBlocked_allows_public_addresses(string ip)
    {
        Assert.False(PrivateNetworkGuard.IsBlocked(IPAddress.Parse(ip)), $"{ip} should be allowed");
    }
}
