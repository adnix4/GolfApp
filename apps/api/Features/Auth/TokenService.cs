// ─────────────────────────────────────────────────────────────────────────────
// Features/Auth/TokenService.cs — JWT Generation & Refresh Token Management
// ─────────────────────────────────────────────────────────────────────────────
//
// RESPONSIBILITIES:
//   1. GenerateAccessToken()  — creates a short-lived (15-min) JWT with user claims
//   2. GenerateRefreshToken() — creates a secure random opaque refresh token string
//   3. ValidateRefreshToken() — looks up the token in the DB and checks expiry
//   4. StoreRefreshToken()    — persists a refresh token to the DB for validation
//   5. RevokeRefreshToken()   — marks a refresh token as used/revoked
//
// WHY REFRESH TOKENS ARE STORED IN THE DATABASE:
//   JWTs are stateless — there's no server-side record of issued access tokens.
//   But refresh tokens MUST be revocable (logout, stolen token, password change).
//   Storing them in the DB gives us:
//     • Server-side revocation (logout invalidates the token immediately)
//     • Token rotation (old token revoked when new one is issued)
//     • Audit trail (when/where each token was used)
//
// REFRESH TOKEN ROTATION (spec Foundation §5.1):
//   "Old refresh token invalidated immediately."
//   When a refresh token is used to get a new access token, the old refresh
//   token is marked as used in the DB and a new one is issued.
//   If an attacker tries to reuse an already-used token, they get a 401 and
//   the legitimate user's active token is also revoked (security alert pattern).
// ─────────────────────────────────────────────────────────────────────────────

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using GolfFundraiserPro.Api.Data;

namespace GolfFundraiserPro.Api.Features.Auth;

/// <summary>
/// Service for generating and validating JWT access tokens and refresh tokens.
/// Registered as a scoped service in the DI container.
/// </summary>
public class TokenService
{
    // ── CONFIGURATION ─────────────────────────────────────────────────────────

    /// <summary>
    /// Access token lifetime: 15 minutes.
    /// Short enough to limit damage from a stolen token.
    /// The frontend refreshes proactively before expiry.
    /// </summary>
    private static readonly TimeSpan AccessTokenLifetime = TimeSpan.FromMinutes(15);

    /// <summary>
    /// Refresh token lifetime: 30 days.
    /// Long enough that users don't need to re-login frequently.
    /// A new 30-day window is granted on each successful refresh.
    /// </summary>
    private static readonly TimeSpan RefreshTokenLifetime = TimeSpan.FromDays(30);

    private readonly ApplicationDbContext _db;
    private readonly IConfiguration _config;
    private readonly ILogger<TokenService> _logger;

    public TokenService(
        ApplicationDbContext db,
        IConfiguration config,
        ILogger<TokenService> logger)
    {
        _db     = db;
        _config = config;
        _logger = logger;
    }

    // ── ACCESS TOKEN ──────────────────────────────────────────────────────────

    /// <summary>
    /// Generates a signed JWT access token for the given user.
    ///
    /// CLAIMS INCLUDED (spec Foundation §5.3):
    ///   sub  — the user's ASP.NET Identity ID (used to look up the user)
    ///   email — the user's email address
    ///   role  — "OrgAdmin", "EventStaff", or "Golfer"
    ///   orgId — the organization this user administers (custom claim)
    ///   name  — the user's display name (for admin dashboard header)
    ///   jti   — a unique token ID (enables per-token revocation if needed later)
    ///
    /// SIGNING ALGORITHM: HMAC-SHA256 (HS256)
    ///   Symmetric signing — same key for signing and verification.
    ///   Sufficient for Phase 1. Phase 3+ could upgrade to RS256 (asymmetric)
    ///   if the API is distributed across multiple services that each need to
    ///   verify tokens without sharing the signing key.
    /// </summary>
    public (string token, DateTime expiresAt) GenerateAccessToken(
        ApplicationUser user,
        string role,
        Guid orgId)
    {
        var jwtSecret = _config["JWT_SECRET"]
            ?? throw new InvalidOperationException("JWT_SECRET is not configured.");

        var key         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expiresAt   = DateTime.UtcNow.Add(AccessTokenLifetime);

        var claims = new[]
        {
            // Standard JWT claims
            new Claim(JwtRegisteredClaimNames.Sub,   user.Id),
            new Claim(JwtRegisteredClaimNames.Email, user.Email ?? string.Empty),
            new Claim(JwtRegisteredClaimNames.Jti,   Guid.NewGuid().ToString()), // unique token ID
            new Claim(JwtRegisteredClaimNames.Iat,
                DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(),
                ClaimValueTypes.Integer64),

            // Application-specific claims
            new Claim(ClaimTypes.Role, role),  // used by [Authorize(Roles="OrgAdmin")]
            new Claim("orgId",       orgId.ToString()),
            new Claim("displayName", user.DisplayName),
        };

        var token = new JwtSecurityToken(
            claims:    claims,
            expires:   expiresAt,
            signingCredentials: credentials
        );

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }

    // ── REFRESH TOKEN ─────────────────────────────────────────────────────────

    /// <summary>
    /// Generates a cryptographically random refresh token string.
    ///
    /// WHY NOT ANOTHER JWT:
    ///   Refresh tokens are opaque strings stored in the DB.
    ///   Using JWTs for refresh tokens would make them stateless (can't be revoked).
    ///   An opaque DB-backed token can be instantly revoked at logout.
    ///
    /// FORMAT: 64 random bytes encoded as Base64URL.
    ///   = 86 characters of A-Z, a-z, 0-9, -, _
    ///   Entropy: 512 bits — far exceeds OWASP recommendation of 128 bits.
    ///   URL-safe encoding means the token can appear in cookies without encoding.
    /// </summary>
    public string GenerateRefreshToken()
    {
        var bytes = new byte[64]; // 64 bytes = 512 bits
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Convert.ToBase64String(bytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('='); // URL-safe Base64
    }

    /// <summary>
    /// Stores a new refresh token in the database for a given user.
    /// Called after login and after each successful refresh (rotation).
    /// </summary>
    public async Task StoreRefreshTokenAsync(
        string userId,
        string token,
        CancellationToken ct = default)
    {
        var refreshToken = new RefreshTokenRecord
        {
            Id        = Guid.NewGuid(),
            UserId    = userId,
            Token     = HashToken(token), // store the HASH, not the raw token
            ExpiresAt = DateTime.UtcNow.Add(RefreshTokenLifetime),
            CreatedAt = DateTime.UtcNow,
            IsRevoked = false,
        };

        _db.RefreshTokens.Add(refreshToken);
        await _db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Validates a refresh token and returns the associated user ID.
    /// Returns null if the token is invalid, expired, or already revoked.
    ///
    /// SECURITY: We hash the incoming token before looking it up.
    /// The DB stores only the hash — if the DB is breached, raw tokens
    /// cannot be extracted and used.
    /// </summary>
    public async Task<string?> ValidateRefreshTokenAsync(
        string token,
        CancellationToken ct = default)
    {
        var tokenHash = HashToken(token);

        var record = await _db.RefreshTokens
            .FirstOrDefaultAsync(rt =>
                rt.Token     == tokenHash &&
                !rt.IsRevoked  &&
                rt.ExpiresAt > DateTime.UtcNow,
                ct);

        if (record is null)
        {
            _logger.LogWarning(
                "Refresh token validation failed — token not found, revoked, or expired.");
            return null;
        }

        return record.UserId;
    }

    /// <summary>
    /// Revokes a specific refresh token (marks it as used/revoked).
    /// Called during token rotation and logout.
    ///
    /// ROTATION: after calling ValidateRefreshToken, immediately call this
    /// to prevent the old token from being used again. A new token is then
    /// issued by calling StoreRefreshToken.
    /// </summary>
    public async Task RevokeRefreshTokenAsync(
        string token,
        CancellationToken ct = default)
    {
        var tokenHash = HashToken(token);

        var record = await _db.RefreshTokens
            .FirstOrDefaultAsync(rt => rt.Token == tokenHash, ct);

        if (record is null) return; // already revoked or never existed — safe to ignore

        record.IsRevoked = true;
        record.RevokedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Revokes ALL refresh tokens for a given user.
    /// Called when:
    ///   • The user changes their password
    ///   • An admin force-logs-out the user
    ///   • A suspicious replay of an already-used token is detected
    /// </summary>
    public async Task RevokeAllUserTokensAsync(
        string userId,
        CancellationToken ct = default)
    {
        var tokens = await _db.RefreshTokens
            .Where(rt => rt.UserId == userId && !rt.IsRevoked)
            .ToListAsync(ct);

        var now = DateTime.UtcNow;
        foreach (var token in tokens)
        {
            token.IsRevoked = true;
            token.RevokedAt = now;
        }

        await _db.SaveChangesAsync(ct);
        _logger.LogInformation(
            "Revoked {Count} refresh tokens for user {UserId}",
            tokens.Count, userId);
    }

    // ── PRIVATE HELPERS ───────────────────────────────────────────────────────

    /// <summary>
    /// Hashes a refresh token with SHA-256 before storing or comparing.
    /// We store hashes so a DB breach doesn't expose usable tokens.
    /// SHA-256 is appropriate here (not bcrypt) because:
    ///   • Refresh tokens are already high-entropy random strings (512 bits)
    ///   • bcrypt's work factor is designed to slow down password brute-force
    ///     attacks on low-entropy inputs. Refresh tokens have no such weakness.
    /// </summary>
    private static string HashToken(string token)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// REFRESH TOKEN DB RECORD
// A separate class because refresh token records have a different lifecycle
// from the main entities (they expire and are revoked independently).
// ─────────────────────────────────────────────────────────────────────────────

/// <summary>
/// Database record for a refresh token.
/// Stored in the "refresh_tokens" table (configured in ApplicationDbContext).
/// </summary>
public class RefreshTokenRecord
{
    public Guid     Id        { get; set; }
    /// <summary>FK to AspNetUsers.Id (the organizer's Identity account).</summary>
    public string   UserId    { get; set; } = string.Empty;
    /// <summary>SHA-256 hash of the raw token. Never store the raw token.</summary>
    public string   Token     { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool     IsRevoked { get; set; }
    public DateTime? RevokedAt { get; set; }

    // Navigation
    public ApplicationUser User { get; set; } = null!;
}
