// ─────────────────────────────────────────────────────────────────────────────
// Features/Events/Branding/PrivateNetworkGuard.cs — SSRF defense
// ─────────────────────────────────────────────────────────────────────────────
//
// The brand-extraction endpoint fetches an organizer-supplied website URL. That
// makes it a Server-Side Request Forgery surface: a malicious URL could try to
// reach our own internal network (loopback, cloud metadata, private ranges).
//
// We refuse any address that points back inward, and we validate at CONNECT time
// (GuardedConnectAsync) rather than only on the first DNS lookup — so the guard
// also covers DNS rebinding and every redirect hop.
// ─────────────────────────────────────────────────────────────────────────────

using System.Net;
using System.Net.Sockets;

namespace GolfFundraiserPro.Api.Features.Events.Branding;

public static class PrivateNetworkGuard
{
    /// <summary>True if this resolved address must NOT be connected to.</summary>
    public static bool IsBlocked(IPAddress ip)
    {
        // Normalize IPv4-mapped IPv6 (::ffff:10.0.0.1) down to its IPv4 form.
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();

        if (IPAddress.IsLoopback(ip)) return true;

        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
            var b = ip.GetAddressBytes(); // 4 bytes
            if (b[0] == 0)   return true;                          // 0.0.0.0/8 "this host"
            if (b[0] == 10)  return true;                          // 10.0.0.0/8 private
            if (b[0] == 100 && b[1] >= 64 && b[1] <= 127) return true; // 100.64.0.0/10 CGNAT
            if (b[0] == 127) return true;                          // 127.0.0.0/8 loopback
            if (b[0] == 169 && b[1] == 254) return true;           // 169.254.0.0/16 link-local (incl. metadata)
            if (b[0] == 172 && b[1] >= 16 && b[1] <= 31) return true;  // 172.16.0.0/12 private
            if (b[0] == 192 && b[1] == 168) return true;           // 192.168.0.0/16 private
            if (b[0] >= 224) return true;                          // 224/4 multicast + 240/4 reserved
            return false;
        }

        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            if (ip.IsIPv6LinkLocal || ip.IsIPv6Multicast || ip.IsIPv6SiteLocal) return true;
            var b = ip.GetAddressBytes(); // 16 bytes
            if (b.All(x => x == 0)) return true;        // :: unspecified
            if ((b[0] & 0xFE) == 0xFC) return true;     // fc00::/7 unique-local
            return false;
        }

        return true; // unknown address family — refuse
    }

    /// <summary>
    /// SocketsHttpHandler.ConnectCallback: validates the actual resolved IP at
    /// connect time, for the initial request and every redirect hop.
    /// </summary>
    public static async ValueTask<Stream> GuardedConnectAsync(
        SocketsHttpConnectionContext context, CancellationToken ct)
    {
        var host = context.DnsEndPoint.Host;
        var port = context.DnsEndPoint.Port;

        IPAddress[] addresses = IPAddress.TryParse(host, out var literal)
            ? new[] { literal }
            : await Dns.GetHostAddressesAsync(host, ct);

        var allowed = addresses.Where(a => !IsBlocked(a)).ToArray();
        if (allowed.Length == 0)
            throw new IOException("Refused: host resolves to a disallowed address.");

        var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
        try
        {
            await socket.ConnectAsync(allowed, port, ct);
            return new NetworkStream(socket, ownsSocket: true);
        }
        catch
        {
            socket.Dispose();
            throw;
        }
    }
}
