// ─────────────────────────────────────────────────────────────────────────────
// Features/Auth/AuthModels.cs — Request & Response Models for Auth Endpoints
// ─────────────────────────────────────────────────────────────────────────────
//
// WHY SEPARATE FROM DOMAIN ENTITIES:
//   The API must never expose raw entity objects from ApplicationDbContext.
//   Reasons:
//     1. Security — entities contain PasswordHash, SecurityStamp, and other
//        internal Identity fields that must never reach the client.
//     2. Stability — renaming a DB column won't break API consumers if the
//        DTO name stays the same.
//     3. Versioning — the same entity can produce different DTOs for v1/v2.
//
// PATTERN: One request model + one response model per endpoint.
//   RegisterRequest  → AuthResponse  (POST /auth/register)
//   LoginRequest     → AuthResponse  (POST /auth/login)
//   RefreshRequest   → AuthResponse  (POST /auth/refresh)
//   LogoutRequest    → (204 No Content, no body)
// ─────────────────────────────────────────────────────────────────────────────

using System.ComponentModel.DataAnnotations;

namespace GolfFundraiserPro.Api.Features.Auth;

// ── REQUEST MODELS ────────────────────────────────────────────────────────────

/// <summary>
/// POST /api/v1/auth/register
/// Creates an organizer account AND the organization in a single call.
/// Returns a JWT pair immediately so the organizer is logged in after registration.
/// Spec: "POST /auth/register — creates user + organization in one call. Returns JWT pair."
/// </summary>
public record RegisterRequest
{
    /// <summary>
    /// The organizer's email. Used as the ASP.NET Identity username.
    /// Must be unique across all organizer accounts.
    /// </summary>
    [Required]
    [EmailAddress]
    [MaxLength(254)]
    public string Email { get; init; } = string.Empty;

    /// <summary>
    /// Password for the organizer account.
    /// Validated against Identity password policy (8+ chars, digit required).
    /// Stored as a bcrypt hash — never in plaintext.
    /// </summary>
    [Required]
    [MinLength(8)]
    public string Password { get; init; } = string.Empty;

    /// <summary>
    /// Full display name of the organizer. Shown in admin dashboard header.
    /// e.g. "Jane Smith"
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string DisplayName { get; init; } = string.Empty;

    /// <summary>
    /// Name of the organization being created.
    /// e.g. "Clear Lake High School Boosters"
    /// </summary>
    [Required]
    [MaxLength(200)]
    public string OrgName { get; init; } = string.Empty;

    /// <summary>
    /// URL-safe slug for the org. Used in public event URLs: /e/{slug}/{eventCode}
    /// Must be lowercase alphanumeric + hyphens only. e.g. "clhs-boosters"
    /// Must be globally unique across all organizations.
    /// </summary>
    [Required]
    [MaxLength(60)]
    [RegularExpression(@"^[a-z0-9\-]+$",
        ErrorMessage = "Slug must be lowercase letters, numbers, and hyphens only.")]
    public string OrgSlug { get; init; } = string.Empty;

    /// <summary>
    /// Optional: is this organization a 501(c)3 non-profit?
    /// If true, donation receipt emails include IRS tax deductibility language.
    /// </summary>
    public bool Is501c3 { get; init; } = false;
}

/// <summary>
/// POST /api/v1/auth/login
/// Validates organizer credentials and returns a JWT pair.
/// </summary>
public record LoginRequest
{
    [Required]
    [EmailAddress]
    public string Email { get; init; } = string.Empty;

    [Required]
    public string Password { get; init; } = string.Empty;
}

/// <summary>
/// POST /api/v1/auth/refresh
/// Exchanges a valid refresh token for a new access + refresh token pair.
/// The old refresh token is immediately invalidated (rotation).
///
/// Spec: "Old refresh token invalidated immediately." — this prevents
/// refresh token replay attacks where an attacker reuses a stolen token.
///
/// WHERE THE REFRESH TOKEN COMES FROM:
///   Admin web: httpOnly cookie (sent automatically by the browser)
///   Mobile:    expo-secure-store (sent in request body)
///
/// We accept it from the body to support both platforms.
/// The auth service first checks the body, then falls back to the cookie.
/// </summary>
public record RefreshRequest
{
    /// <summary>
    /// The refresh token from expo-secure-store (mobile) or the request body.
    /// Admin web sends it via the httpOnly cookie — body field is optional for web.
    /// </summary>
    public string? RefreshToken { get; init; }
}

/// <summary>
/// POST /api/v1/auth/logout
/// Invalidates the current refresh token server-side.
/// Returns 204 No Content on success.
/// </summary>
public record LogoutRequest
{
    /// <summary>Refresh token to invalidate. Optional for web (reads from cookie).</summary>
    public string? RefreshToken { get; init; }
}

// ── RESPONSE MODELS ───────────────────────────────────────────────────────────

/// <summary>
/// Returned by /auth/register, /auth/login, and /auth/refresh.
/// Contains both tokens and enough user/org info for the frontend
/// to initialize its state without an extra round-trip.
/// </summary>
public record AuthResponse
{
    /// <summary>
    /// Short-lived JWT access token. Lifetime: 15 minutes.
    /// Sent in the Authorization: Bearer header on every protected request.
    /// Stored in-memory only (never localStorage or disk).
    /// </summary>
    public string AccessToken { get; init; } = string.Empty;

    /// <summary>
    /// Long-lived refresh token. Lifetime: 30 days.
    /// Used to obtain new access tokens when the current one expires.
    /// Storage:
    ///   Admin web → httpOnly cookie (also set in Set-Cookie header by the API)
    ///   Mobile    → expo-secure-store
    /// </summary>
    public string RefreshToken { get; init; } = string.Empty;

    /// <summary>
    /// UTC timestamp when the access token expires.
    /// The frontend uses this to proactively refresh before expiry.
    /// ISO 8601 format: "2024-06-15T09:15:00Z"
    /// </summary>
    public DateTime AccessTokenExpiresAt { get; init; }

    /// <summary>Basic user info to initialize the admin dashboard without a separate API call.</summary>
    public AuthUserInfo User { get; init; } = new();

    /// <summary>The organization this user administers.</summary>
    public AuthOrgInfo Org { get; init; } = new();
}

/// <summary>Subset of user data returned in AuthResponse.</summary>
public record AuthUserInfo
{
    public string Id          { get; init; } = string.Empty;
    public string Email       { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public string Role        { get; init; } = string.Empty;
}

/// <summary>Subset of org data returned in AuthResponse.</summary>
public record AuthOrgInfo
{
    public Guid   Id      { get; init; }
    public string Name    { get; init; } = string.Empty;
    public string Slug    { get; init; } = string.Empty;
    public bool   Is501c3 { get; init; }
}
