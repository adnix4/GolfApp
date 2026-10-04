using System.Net;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Features.Emails;

namespace GolfFundraiserPro.Api.Features.Auth;

/// <summary>
/// The anonymous account flows that arrive by emailed link: accepting a staff
/// invite (problemList D20) and resetting a forgotten password (D21). Kept out
/// of AuthService so its constructor (and its tests) stay as they were; tokens
/// are still issued by AuthService.BuildAuthResponseAsync.
/// </summary>
public class AccountService
{
    /// <summary>Same message for every bad or used link, so the endpoint reveals nothing.</summary>
    public const string InvalidInvite = "This invite link is invalid or has expired. Ask the organizer for a new one.";
    public const string InvalidReset  = "This reset link is invalid or has expired. Request a new one.";

    private readonly ApplicationDbContext         _db;
    private readonly UserManager<ApplicationUser> _users;
    private readonly AuthService                  _auth;
    private readonly TokenService                 _tokens;
    private readonly EmailService                 _email;
    private readonly IConfiguration               _config;
    private readonly IHostEnvironment             _env;
    private readonly ILogger<AccountService>      _log;

    public AccountService(
        ApplicationDbContext db, UserManager<ApplicationUser> users, AuthService auth, TokenService tokens,
        EmailService email, IConfiguration config, IHostEnvironment env, ILogger<AccountService> log)
    {
        _db = db; _users = users; _auth = auth; _tokens = tokens; _email = email; _config = config; _env = env; _log = log;
    }

    // ── INVITES ───────────────────────────────────────────────────────────────

    private async Task<Domain.Entities.OrgInvite?> FindUsableInviteAsync(string token, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        var hash = AccountLinks.Hash(token);
        var now  = DateTime.UtcNow;
        return await _db.OrgInvites.Include(i => i.Organization)
            .FirstOrDefaultAsync(i => i.TokenHash == hash && i.AcceptedAt == null
                                      && i.RevokedAt == null && i.ExpiresAt > now, ct);
    }

    public async Task<InvitePreviewResponse> PreviewInviteAsync(string token, CancellationToken ct)
    {
        var invite = await FindUsableInviteAsync(token, ct) ?? throw new NotFoundException(InvalidInvite);
        return new InvitePreviewResponse { OrgName = invite.Organization.Name, Email = invite.Email, Role = invite.Role };
    }

    /// <summary>
    /// Creates the invited person's account in the inviting org with the
    /// invite's role, marks the invite used, and signs them in.
    /// </summary>
    public async Task<AuthResponse> AcceptInviteAsync(AcceptInviteRequest request, CancellationToken ct)
    {
        var invite = await FindUsableInviteAsync(request.Token, ct) ?? throw new NotFoundException(InvalidInvite);
        if (await _users.FindByEmailAsync(invite.Email) is not null)
            throw new ConflictException($"{invite.Email} already has an account. Sign in instead.");

        await _auth.EnsureRolesExistAsync();

        var user = new ApplicationUser
        {
            UserName       = invite.Email,
            Email          = invite.Email,
            DisplayName    = request.DisplayName.Trim(),
            OrgId          = invite.OrgId,
            EmailConfirmed = true, // they proved the address by opening the emailed link
        };
        var created = await _users.CreateAsync(user, request.Password);
        if (!created.Succeeded)
            throw new ValidationException(string.Join(" ", created.Errors.Select(e => e.Description)));

        var roled = await _users.AddToRoleAsync(user, invite.Role);
        if (!roled.Succeeded)
        {
            // Never leave a role-less user behind: no role means no access anyway.
            await _users.DeleteAsync(user);
            throw new ValidationException(string.Join(" ", roled.Errors.Select(e => e.Description)));
        }

        invite.AcceptedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        _log.LogInformation("Invite {InviteId} accepted: {Email} joined org {OrgId} as {Role}",
            invite.Id, invite.Email, invite.OrgId, invite.Role);

        return await _auth.BuildAuthResponseAsync(user, invite.Role, invite.Organization, ct);
    }

    // ── PASSWORD RESET ────────────────────────────────────────────────────────

    /// <summary>
    /// Emails a reset link if the address has an account. Always returns
    /// normally, account or not, so the endpoint cannot be used to discover
    /// which emails are registered (matching LoginAsync's generic error).
    /// </summary>
    public async Task ForgotPasswordAsync(ForgotPasswordRequest request, CancellationToken ct)
    {
        var email = AccountLinks.NormalizeEmail(request.Email);
        var user  = await _users.FindByEmailAsync(email);
        if (user is null)
        {
            _log.LogInformation("Password reset requested for an unknown email");
            return;
        }

        // Identity's data-protection token: tied to this user's security stamp,
        // so it stops working once used (the reset changes the stamp) and after
        // its lifespan (1 hour, set in AddIdentity's configuration).
        var token = await _users.GeneratePasswordResetTokenAsync(user);
        var url   = $"{AccountLinks.AdminBaseUrl(_config, _env)}/reset-password" +
                    $"?email={Uri.EscapeDataString(email)}&token={Uri.EscapeDataString(token)}";

        // Local SendGrid keys are placeholders, so in Development the link is
        // logged to make the flow usable and testable. Never outside Development.
        if (_env.IsDevelopment())
            _log.LogInformation("DEV password reset link for {Email}: {Url}", email, url);

        var html =
            "<p>Someone asked to reset the password for this Golf Fundraiser Pro account.</p>" +
            $"<p><a href=\"{WebUtility.HtmlEncode(url)}\">Choose a new password</a></p>" +
            "<p>The link expires in 1 hour and works once. If you didn't ask for this, ignore this email; " +
            "your password has not changed.</p>";
        try
        {
            await _email.SendTransactionalAsync(email, user.DisplayName, "Reset your Golf Fundraiser Pro password", html, ct);
        }
        catch (Exception ex)
        {
            // Still a normal return: the caller must not learn the account exists.
            _log.LogWarning(ex, "Password reset email to {Email} failed", email);
        }
    }

    /// <summary>
    /// Sets a new password from a reset link, then signs the account out
    /// everywhere and clears any lockout, so a reset also recovers a locked
    /// account and evicts anyone who had the old password.
    /// </summary>
    public async Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken ct)
    {
        var user = await _users.FindByEmailAsync(AccountLinks.NormalizeEmail(request.Email))
            ?? throw new ValidationException(InvalidReset);

        var result = await _users.ResetPasswordAsync(user, request.Token, request.NewPassword);
        if (!result.Succeeded)
        {
            // A bad or used token is "invalid link"; anything else is the new
            // password failing the rules, which the person can fix.
            if (result.Errors.Any(e => e.Code == nameof(IdentityErrorDescriber.InvalidToken)))
                throw new ValidationException(InvalidReset);
            throw new ValidationException(string.Join(" ", result.Errors.Select(e => e.Description)));
        }

        await _tokens.RevokeAllUserTokensAsync(user.Id, ct);
        await _users.ResetAccessFailedCountAsync(user);
        await _users.SetLockoutEndDateAsync(user, null);

        _log.LogInformation("Password reset completed for {Email}; all sessions revoked", user.Email);
    }
}
