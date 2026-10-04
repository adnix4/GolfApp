using System.Security.Cryptography;
using System.Text;

namespace GolfFundraiserPro.Api.Common;

/// <summary>
/// Helpers for the links the API emails to people who manage an org: staff
/// invites (problemList D20) and password resets (D21). Both land on the admin
/// app, not the public web app (APP_BASE_URL), so they get their own base URL.
/// </summary>
public static class AccountLinks
{
    /// <summary>
    /// Base URL of the admin app. ADMIN_BASE_URL when set; otherwise the local
    /// Expo admin in Development and the planned app subdomain elsewhere, so a
    /// production link never points at localhost.
    /// </summary>
    public static string AdminBaseUrl(IConfiguration config, IHostEnvironment env)
    {
        var configured = config["ADMIN_BASE_URL"];
        if (!string.IsNullOrWhiteSpace(configured)) return configured.TrimEnd('/');
        return env.IsDevelopment() ? "http://localhost:8081" : "https://app.golffundraiser.pro";
    }

    /// <summary>A new unguessable link token: 32 random bytes, base64url.</summary>
    public static string NewToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');

    /// <summary>
    /// Lowercase hex SHA-256 of a link token. Only this is stored, so a database
    /// read cannot be turned into a working link.
    /// </summary>
    public static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    /// <summary>Lowercase, trimmed email used for matching invites to accounts.</summary>
    public static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();
}
