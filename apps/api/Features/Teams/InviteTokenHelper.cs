using System.Security.Cryptography;
using System.Text;
using GolfFundraiserPro.Api.Common.Middleware;

namespace GolfFundraiserPro.Api.Features.Teams;

/// <summary>
/// Pure HMAC-SHA256 invite-token helper — no DI, no DB, fully unit-testable.
///
/// Format: base64url(teamId:expiresAtUnixSeconds).base64url(HMAC-SHA256)
///
/// Tokens are self-verifying: the team ID and expiry are embedded in the
/// payload so no DB lookup is needed to validate them.
/// </summary>
public static class InviteTokenHelper
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(48);

    /// <summary>
    /// Generates a signed invite token.
    /// Pass <paramref name="now"/> in tests to fix the clock.
    /// </summary>
    public static (string Token, DateTime ExpiresAt) Generate(
        Guid teamId, string secret, DateTimeOffset? now = null)
    {
        var at          = now ?? DateTimeOffset.UtcNow;
        var expiresAt   = at.Add(Lifetime).UtcDateTime;
        var expiresUnix = new DateTimeOffset(expiresAt, TimeSpan.Zero).ToUnixTimeSeconds();
        var payload     = $"{teamId}:{expiresUnix}";

        var keyBytes   = Encoding.UTF8.GetBytes(secret);
        var payBytes   = Encoding.UTF8.GetBytes(payload);
        var hmacBytes  = HMACSHA256.HashData(keyBytes, payBytes);

        var payloadB64 = ToBase64Url(payBytes);
        var signature  = ToBase64Url(hmacBytes);

        return ($"{payloadB64}.{signature}", expiresAt);
    }

    /// <summary>
    /// Validates a token and returns the embedded team ID.
    /// Throws <see cref="ValidationException"/> on any failure.
    /// Pass <paramref name="now"/> in tests to fix the clock.
    /// </summary>
    public static Guid Validate(string token, string secret, DateTimeOffset? now = null)
    {
        try
        {
            var parts = token.Split('.');
            if (parts.Length != 2)
                throw new ValidationException("Invalid invite token format.");

            var payloadBytes = FromBase64Url(parts[0]);
            var payload      = Encoding.UTF8.GetString(payloadBytes);
            var payParts     = payload.Split(':');
            if (payParts.Length != 2)
                throw new ValidationException("Invalid invite token format.");

            var teamId       = Guid.Parse(payParts[0]);
            var expiresUnix  = long.Parse(payParts[1]);
            var expiresAt    = DateTimeOffset.FromUnixTimeSeconds(expiresUnix);

            var atNow = now ?? DateTimeOffset.UtcNow;
            if (atNow > expiresAt)
                throw new ValidationException(
                    "This invite link has expired. Ask the team captain for a new one.");

            var keyBytes    = Encoding.UTF8.GetBytes(secret);
            var expected    = HMACSHA256.HashData(keyBytes, payloadBytes);
            var expectedB64 = ToBase64Url(expected);

            if (expectedB64 != parts[1])
                throw new ValidationException("This invite link is not valid.");

            return teamId;
        }
        catch (ValidationException) { throw; }
        catch { throw new ValidationException("Invalid invite token format."); }
    }

    private static string ToBase64Url(byte[] bytes)
        => Convert.ToBase64String(bytes)
               .Replace('+', '-').Replace('/', '_').TrimEnd('=');

    private static byte[] FromBase64Url(string s)
    {
        s = s.Replace('-', '+').Replace('_', '/');
        s = s.PadRight(s.Length + (4 - s.Length % 4) % 4, '=');
        return Convert.FromBase64String(s);
    }
}
