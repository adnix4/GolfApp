// ─────────────────────────────────────────────────────────────────────────────
// Features/Auth/AuthController.cs — Auth HTTP Endpoints
// ─────────────────────────────────────────────────────────────────────────────
//
// ENDPOINTS (spec Phase 1 §9 + Foundation §5.1):
//   POST /api/v1/auth/register  — create organizer account + org
//   POST /api/v1/auth/login     — validate credentials
//   POST /api/v1/auth/refresh   — exchange refresh token for new pair
//   POST /api/v1/auth/logout    — invalidate refresh token
//
// COOKIE STRATEGY (spec Foundation §5.2):
//   Admin web (Expo Router) stores refresh tokens in httpOnly cookies.
//   Mobile (React Native) receives the token in the JSON body and stores
//   it in expo-secure-store.
//
//   This controller handles BOTH:
//     1. JSON body refresh token  → for mobile
//     2. httpOnly cookie          → for admin web (set by Set-Cookie header)
//
//   On login/register/refresh, if the request comes from a browser
//   (detected by User-Agent or a custom header), the refresh token is
//   ALSO set in a Set-Cookie header. The JSON body still contains it
//   for mobile compatibility.
//
// THIN CONTROLLER RULE:
//   All business logic lives in AuthService. The controller only:
//     1. Reads the HTTP request
//     2. Calls the service
//     3. Sets cookies for web clients
//     4. Returns the HTTP response
// ─────────────────────────────────────────────────────────────────────────────

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using GolfFundraiserPro.Api.Common.Middleware;

namespace GolfFundraiserPro.Api.Features.Auth;

[ApiController]
[Route("api/v1/auth")]
[Tags("Authentication")]
public class AuthController : ControllerBase
{
    // ── COOKIE CONFIGURATION ──────────────────────────────────────────────────

    /// <summary>
    /// Name of the httpOnly refresh token cookie.
    /// httpOnly means JavaScript cannot read this cookie — only the browser
    /// sends it automatically on requests to our domain.
    /// This prevents XSS attacks from stealing the refresh token.
    /// </summary>
    private const string RefreshTokenCookieName = "gfp_refresh_token";

    /// <summary>
    /// Refresh token cookie lifetime matches the token's 30-day lifetime.
    /// The browser automatically discards the cookie after this time.
    /// </summary>
    private static readonly TimeSpan CookieLifetime = TimeSpan.FromDays(30);

    private readonly AuthService _authService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(AuthService authService, ILogger<AuthController> logger)
    {
        _authService = authService;
        _logger      = logger;
    }

    // ── REGISTER ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Creates a new organizer account and organization in a single call.
    /// Returns a JWT access token and refresh token immediately (no separate login step).
    ///
    /// HTTP 201 Created on success.
    /// HTTP 400 Bad Request if validation fails (duplicate email, bad slug, etc.)
    /// HTTP 409 Conflict if org slug is already taken (caught by unique constraint).
    /// </summary>
    [HttpPost("register")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AuthResponse>> Register(
        [FromBody] RegisterRequest request,
        CancellationToken ct)
    {
        var response = await _authService.RegisterAsync(request, ct);

        // Set the httpOnly cookie for admin web clients
        SetRefreshTokenCookie(response.RefreshToken);

        // 201 Created — the organizer account and org are new resources
        return StatusCode(StatusCodes.Status201Created, response);
    }

    // ── LOGIN ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Validates organizer credentials and returns a JWT pair.
    ///
    /// HTTP 200 OK on success.
    /// HTTP 400 Bad Request for invalid credentials (same message for both
    ///          wrong-email and wrong-password to prevent email enumeration).
    /// HTTP 400 Bad Request if account is locked out.
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<AuthResponse>> Login(
        [FromBody] LoginRequest request,
        CancellationToken ct)
    {
        var response = await _authService.LoginAsync(request, ct);

        // Set the httpOnly cookie for admin web clients
        SetRefreshTokenCookie(response.RefreshToken);

        return Ok(response);
    }

    // ── REFRESH ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Exchanges a valid refresh token for a new access + refresh token pair.
    /// The old refresh token is immediately invalidated (rotation).
    ///
    /// TOKEN SOURCE (checked in order):
    ///   1. Request body (mobile — from expo-secure-store)
    ///   2. httpOnly cookie (admin web — sent automatically by the browser)
    ///
    /// HTTP 200 OK with new tokens on success.
    /// HTTP 400 Bad Request if the token is invalid, expired, or already used.
    /// </summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<AuthResponse>> Refresh(
        [FromBody] RefreshRequest request,
        CancellationToken ct)
    {
        // Check both sources for the refresh token
        var refreshToken = request.RefreshToken
            ?? Request.Cookies[RefreshTokenCookieName];

        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            return BadRequest(new ErrorResponse
            {
                Error = "Refresh token is required. Provide it in the request body " +
                        "or ensure the browser is sending the auth cookie.",
                Code  = "VALIDATION_ERROR",
            });
        }

        var response = await _authService.RefreshAsync(refreshToken, ct);

        // Rotate the cookie: old cookie is overwritten with new refresh token
        SetRefreshTokenCookie(response.RefreshToken);

        return Ok(response);
    }

    // ── LOGOUT ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Revokes the current refresh token server-side.
    /// The client should discard the access token from memory.
    ///
    /// HTTP 204 No Content on success (no body — nothing to return after logout).
    /// HTTP 204 also on "token not found" — idempotent (safe to call twice).
    /// </summary>
    [HttpPost("logout")]
    [AllowAnonymous] // AllowAnonymous because the access token may already be expired
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout(
        [FromBody] LogoutRequest request,
        CancellationToken ct)
    {
        // Get refresh token from body or cookie
        var refreshToken = request.RefreshToken
            ?? Request.Cookies[RefreshTokenCookieName];

        if (!string.IsNullOrWhiteSpace(refreshToken))
        {
            await _authService.LogoutAsync(refreshToken, ct);
        }

        // Delete the httpOnly cookie (web clients)
        // Setting an expired cookie causes the browser to delete it immediately.
        Response.Cookies.Delete(RefreshTokenCookieName, new CookieOptions
        {
            HttpOnly = true,
            Secure   = !HttpContext.Request.IsHttps ? false : true,
            SameSite = SameSiteMode.Strict,
        });

        // 204 No Content — standard response for successful logout
        return NoContent();
    }

    // ── ME (bonus — useful for frontend on page load) ─────────────────────────

    /// <summary>
    /// Returns the current authenticated user's info.
    /// The frontend calls this on page load to rehydrate its auth state
    /// from an access token stored in memory.
    ///
    /// HTTP 200 OK with user info if authenticated.
    /// HTTP 401 if the access token is missing or expired.
    /// </summary>
    [HttpGet("me")]
    [Authorize] // Requires valid JWT access token
    [ProducesResponseType(typeof(AuthUserInfo), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public IActionResult Me()
    {
        // Claims are already parsed from the JWT by the JwtBearer middleware.
        // We just read them from HttpContext.User.
        var userId      = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var email       = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value;
        var role        = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
        var displayName = User.FindFirst("displayName")?.Value;

        return Ok(new AuthUserInfo
        {
            Id          = userId          ?? string.Empty,
            Email       = email           ?? string.Empty,
            Role        = role            ?? string.Empty,
            DisplayName = displayName     ?? string.Empty,
        });
    }

    // ── PRIVATE HELPERS ───────────────────────────────────────────────────────

    /// <summary>
    /// Sets the httpOnly refresh token cookie on the response.
    /// Called after every successful login, register, or refresh.
    ///
    /// COOKIE ATTRIBUTES EXPLAINED:
    ///   HttpOnly = true  → JavaScript cannot read or modify this cookie.
    ///                      Prevents XSS attacks from stealing the refresh token.
    ///   Secure = true    → Cookie is only sent over HTTPS.
    ///                      Prevents the token from being transmitted in cleartext.
    ///                      Set to false in development (no local HTTPS).
    ///   SameSite = Strict → Cookie is only sent on same-site requests.
    ///                      Prevents CSRF attacks where a malicious site tricks
    ///                      the browser into sending the refresh token.
    ///   Path = /api/v1/auth → Cookie is only sent to auth endpoints.
    ///                      The refresh token is only needed by /auth/refresh and
    ///                      /auth/logout — no reason to send it to every API call.
    /// </summary>
    private void SetRefreshTokenCookie(string refreshToken)
    {
        var isHttps = HttpContext.Request.IsHttps;

        Response.Cookies.Append(RefreshTokenCookieName, refreshToken, new CookieOptions
        {
            HttpOnly = true,
            Secure   = isHttps,        // false in local dev (HTTP), true in production (HTTPS)
            SameSite = SameSiteMode.Strict,
            Expires  = DateTimeOffset.UtcNow.Add(CookieLifetime),
            Path     = "/api/v1/auth", // scoped — only sent to auth endpoints
        });
    }
}
