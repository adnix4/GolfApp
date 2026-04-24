// ─────────────────────────────────────────────────────────────────────────────
// Features/Auth/AuthService.cs — Auth Business Logic
// ─────────────────────────────────────────────────────────────────────────────
//
// WHY A SERVICE LAYER BETWEEN CONTROLLER AND IDENTITY:
//   The controller's job is HTTP: read the request, call the service,
//   return the response. The service's job is business logic: orchestrate
//   Identity, the DB, and the token service. This separation means:
//     • The auth logic is testable without an HTTP context
//     • The controller stays thin (no business logic leaks into it)
//     • We can reuse AuthService from background jobs if needed
//
// REGISTER FLOW:
//   1. Validate request (FluentValidation catches duplicates before we get here)
//   2. Create Organization in DB
//   3. Create ApplicationUser via Identity (handles password hashing)
//   4. Assign OrgAdmin role
//   5. Generate access + refresh tokens
//   6. Return AuthResponse
//
// LOGIN FLOW:
//   1. Find user by email
//   2. Verify password via Identity
//   3. Check account is not locked out
//   4. Generate access + refresh tokens
//   5. Return AuthResponse
//
// REFRESH FLOW:
//   1. Validate the incoming refresh token (DB lookup, expiry check)
//   2. Load the user
//   3. Revoke the old refresh token (rotation — prevent reuse)
//   4. Generate new access + refresh tokens
//   5. Return AuthResponse
// ─────────────────────────────────────────────────────────────────────────────

using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;

namespace GolfFundraiserPro.Api.Features.Auth;

/// <summary>
/// Handles all authentication operations: register, login, refresh, logout.
/// Registered as scoped in DI (one instance per HTTP request).
/// </summary>
public class AuthService
{
    private readonly ApplicationDbContext  _db;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly RoleManager<IdentityRole>    _roleManager;
    private readonly TokenService          _tokenService;
    private readonly ILogger<AuthService>  _logger;

    // Role name constants — match the spec Foundation §5.3 exactly
    public const string RoleOrgAdmin   = "OrgAdmin";
    public const string RoleEventStaff = "EventStaff";
    public const string RoleGolfer     = "Golfer";

    public AuthService(
        ApplicationDbContext db,
        UserManager<ApplicationUser> userManager,
        RoleManager<IdentityRole> roleManager,
        TokenService tokenService,
        ILogger<AuthService> logger)
    {
        _db           = db;
        _userManager  = userManager;
        _roleManager  = roleManager;
        _tokenService = tokenService;
        _logger       = logger;
    }

    // ── REGISTER ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Creates a new organizer account + organization in a single transaction.
    /// Spec: "POST /auth/register — creates user + organization in one call."
    ///
    /// Uses a DB transaction so that if Identity user creation fails,
    /// the Organization row is rolled back too (no orphaned org records).
    /// </summary>
    public async Task<AuthResponse> RegisterAsync(
        RegisterRequest request,
        CancellationToken ct = default)
    {
        // Ensure the required roles exist in the DB (idempotent)
        await EnsureRolesExistAsync();

        // Use a transaction — both org and user must succeed together
        await using var transaction = await _db.Database.BeginTransactionAsync(ct);

        try
        {
            // ── STEP 1: CREATE ORGANIZATION ───────────────────────────────
            var org = new Organization
            {
                Id        = Guid.NewGuid(),
                Name      = request.OrgName,
                Slug      = request.OrgSlug,
                Is501c3   = request.Is501c3,
                CreatedAt = DateTime.UtcNow,
                // Theme is null → ECO_GREEN_DEFAULT applied at the service layer
                ThemeJson = null,
            };

            _db.Organizations.Add(org);
            await _db.SaveChangesAsync(ct);

            _logger.LogInformation(
                "Created organization '{Name}' (slug: {Slug}, id: {Id})",
                org.Name, org.Slug, org.Id);

            // ── STEP 2: CREATE IDENTITY USER ──────────────────────────────
            var user = new ApplicationUser
            {
                // Identity requires UserName — we use email as the username.
                // This is the standard pattern; users log in with email.
                UserName    = request.Email,
                Email       = request.Email,
                DisplayName = request.DisplayName,
                OrgId       = org.Id,
                // EmailConfirmed = true for Phase 1 — no email verification step.
                // Phase 3 can add email verification if required.
                EmailConfirmed = true,
            };

            var result = await _userManager.CreateAsync(user, request.Password);

            if (!result.Succeeded)
            {
                // Identity validation failed (e.g. password too short, duplicate email)
                // This shouldn't happen if FluentValidation ran correctly,
                // but we handle it defensively.
                var errors = string.Join(", ", result.Errors.Select(e => e.Description));
                _logger.LogWarning("Identity user creation failed: {Errors}", errors);
                throw new ValidationException($"Account creation failed: {errors}");
            }

            // ── STEP 3: ASSIGN ROLE ───────────────────────────────────────
            // The first user for an org is always OrgAdmin.
            // OrgAdmin has full access to their org's events, members, settings.
            await _userManager.AddToRoleAsync(user, RoleOrgAdmin);

            // ── STEP 4: COMMIT TRANSACTION ────────────────────────────────
            await transaction.CommitAsync(ct);

            _logger.LogInformation(
                "Registered new OrgAdmin '{Email}' for org '{OrgName}'",
                user.Email, org.Name);

            // ── STEP 5: GENERATE TOKENS ───────────────────────────────────
            return await BuildAuthResponseAsync(user, RoleOrgAdmin, org, ct);
        }
        catch
        {
            await transaction.RollbackAsync(ct);
            throw;
        }
    }

    // ── LOGIN ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Validates organizer credentials and returns a JWT pair.
    /// Spec: "POST /auth/login — validate credentials. Returns access + refresh tokens."
    ///
    /// SECURITY: We return the same error message for "user not found" and
    /// "wrong password" to prevent email enumeration attacks. An attacker
    /// should not be able to determine which emails are registered by
    /// observing different error messages.
    /// </summary>
    public async Task<AuthResponse> LoginAsync(
        LoginRequest request,
        CancellationToken ct = default)
    {
        // Generic error message — same for user-not-found and wrong-password
        const string invalidCredentials = "Invalid email or password.";

        // Find user by email (case-insensitive via NormalizedEmail)
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user is null)
        {
            // User not found — but we don't reveal this to the caller
            _logger.LogWarning(
                "Login attempt for non-existent email: {Email}", request.Email);
            throw new ValidationException(invalidCredentials);
        }

        // Check if the account is locked out (too many failed attempts)
        if (await _userManager.IsLockedOutAsync(user))
        {
            _logger.LogWarning(
                "Login attempt on locked account: {Email}", request.Email);
            throw new ValidationException(
                "Account temporarily locked due to too many failed attempts. " +
                "Please try again in 5 minutes.");
        }

        // Verify password
        var passwordValid = await _userManager.CheckPasswordAsync(user, request.Password);
        if (!passwordValid)
        {
            // Increment failed login counter — triggers lockout after 5 failures
            await _userManager.AccessFailedAsync(user);

            _logger.LogWarning(
                "Failed login attempt for: {Email}", request.Email);
            throw new ValidationException(invalidCredentials);
        }

        // Password correct — reset the failed login counter
        await _userManager.ResetAccessFailedCountAsync(user);

        // Load the user's organization for the response
        var org = await _db.Organizations.FindAsync([user.OrgId], ct);
        if (org is null)
        {
            // Should never happen — but handle it defensively
            throw new NotFoundException("Organization", user.OrgId ?? Guid.Empty);
        }

        // Get the user's role for the JWT claims
        var roles = await _userManager.GetRolesAsync(user);
        var role  = roles.FirstOrDefault() ?? RoleOrgAdmin;

        _logger.LogInformation(
            "Successful login for '{Email}' (role: {Role})", user.Email, role);

        return await BuildAuthResponseAsync(user, role, org, ct);
    }

    // ── REFRESH ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Exchanges a valid refresh token for a new access + refresh pair.
    /// Spec: "POST /auth/refresh — exchange refresh token for new access + refresh pair.
    ///        Old refresh token invalidated immediately."
    ///
    /// TOKEN ROTATION PATTERN:
    ///   If a refresh token is used successfully, the old one is revoked and
    ///   a new pair is issued. This means a refresh token can only be used once.
    ///   If the same refresh token is used twice (replay attack), the second
    ///   use returns 401 because the token is already revoked.
    /// </summary>
    public async Task<AuthResponse> RefreshAsync(
        string refreshToken,
        CancellationToken ct = default)
    {
        // Validate the refresh token — checks: exists, not revoked, not expired
        var userId = await _tokenService.ValidateRefreshTokenAsync(refreshToken, ct);
        if (userId is null)
        {
            throw new ValidationException(
                "The refresh token is invalid or has expired. Please log in again.")
            {
            };
        }

        // Load the user
        var user = await _userManager.FindByIdAsync(userId);
        if (user is null || user.OrgId is null)
        {
            throw new ValidationException("User account not found. Please log in again.");
        }

        // Load the org
        var org = await _db.Organizations.FindAsync([user.OrgId], ct);
        if (org is null)
        {
            throw new NotFoundException("Organization", user.OrgId.Value);
        }

        // ── ROTATE THE REFRESH TOKEN ──────────────────────────────────────
        // Revoke the old token BEFORE issuing the new one.
        // This is the critical security step — prevents the old token from
        // being used again even if someone captured it in transit.
        await _tokenService.RevokeRefreshTokenAsync(refreshToken, ct);

        var roles = await _userManager.GetRolesAsync(user);
        var role  = roles.FirstOrDefault() ?? RoleOrgAdmin;

        _logger.LogInformation(
            "Refreshed tokens for user '{Email}'", user.Email);

        // Issue new access + refresh tokens
        return await BuildAuthResponseAsync(user, role, org, ct);
    }

    // ── LOGOUT ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Revokes the provided refresh token server-side.
    /// Spec: "POST /auth/logout — invalidate refresh token server-side."
    ///
    /// After logout, the client should discard the access token from memory.
    /// The access token will naturally expire in ≤15 minutes.
    /// The refresh token is immediately unusable after this call.
    /// </summary>
    public async Task LogoutAsync(
        string refreshToken,
        CancellationToken ct = default)
    {
        // Revoke the specific refresh token
        // If the token doesn't exist (already revoked), this is a no-op — safe.
        await _tokenService.RevokeRefreshTokenAsync(refreshToken, ct);

        _logger.LogInformation("User logged out — refresh token revoked.");
    }

    // ── PRIVATE HELPERS ───────────────────────────────────────────────────────

    /// <summary>
    /// Generates access + refresh tokens and builds the AuthResponse.
    /// Extracted to avoid duplicating this logic across Register, Login, Refresh.
    /// </summary>
    private async Task<AuthResponse> BuildAuthResponseAsync(
        ApplicationUser user,
        string role,
        Organization org,
        CancellationToken ct)
    {
        // Generate JWT access token (15 min)
        var (accessToken, expiresAt) = _tokenService.GenerateAccessToken(
            user, role, org.Id);

        // Generate opaque refresh token (30 days) and store its hash in DB
        var refreshToken = _tokenService.GenerateRefreshToken();
        await _tokenService.StoreRefreshTokenAsync(user.Id, refreshToken, ct);

        return new AuthResponse
        {
            AccessToken        = accessToken,
            RefreshToken       = refreshToken,
            AccessTokenExpiresAt = expiresAt,
            User = new AuthUserInfo
            {
                Id          = user.Id,
                Email       = user.Email ?? string.Empty,
                DisplayName = user.DisplayName,
                Role        = role,
            },
            Org = new AuthOrgInfo
            {
                Id      = org.Id,
                Name    = org.Name,
                Slug    = org.Slug,
                Is501c3 = org.Is501c3,
            }
        };
    }

    /// <summary>
    /// Creates the three application roles if they don't exist.
    /// Called once per app lifecycle via RegisterAsync (first call creates roles).
    /// Subsequent calls are no-ops because CreateAsync checks for existence.
    /// </summary>
    private async Task EnsureRolesExistAsync()
    {
        foreach (var roleName in new[] { RoleOrgAdmin, RoleEventStaff, RoleGolfer })
        {
            if (!await _roleManager.RoleExistsAsync(roleName))
            {
                await _roleManager.CreateAsync(new IdentityRole(roleName));
                _logger.LogInformation("Created role: {Role}", roleName);
            }
        }
    }
}
