using System.Net;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Features.Auth;
using GolfFundraiserPro.Api.Features.Emails;

namespace GolfFundraiserPro.Api.Features.Orgs;

/// <summary>
/// Who can sign in to an org, and inviting more people (problemList D20).
///
/// Before this the only way in was /auth/register, which always creates a NEW
/// org, so every desk volunteer signed in as the organizer with full organizer
/// power. An OrgAdmin now invites people by email as EventStaff (check-in, fees,
/// score entry, QR import, auction checkout; the API's existing "EventStaff"
/// policy) or as a second OrgAdmin (a co-organizer, which also means the org is
/// not locked out if one organizer loses their password). The invited person
/// sets their own name and password from the link (AccountService.AcceptInviteAsync).
/// </summary>
public class OrgMembersService
{
    public static readonly TimeSpan InviteLifetime = TimeSpan.FromDays(7);
    public static readonly string[] InvitableRoles = { AuthService.RoleEventStaff, AuthService.RoleOrgAdmin };

    private readonly ApplicationDbContext         _db;
    private readonly UserManager<ApplicationUser> _users;
    private readonly TokenService                 _tokens;
    private readonly EmailService                 _email;
    private readonly IConfiguration               _config;
    private readonly IHostEnvironment             _env;
    private readonly ILogger<OrgMembersService>   _log;

    public OrgMembersService(
        ApplicationDbContext db, UserManager<ApplicationUser> users, TokenService tokens,
        EmailService email, IConfiguration config, IHostEnvironment env, ILogger<OrgMembersService> log)
    {
        _db = db; _users = users; _tokens = tokens; _email = email; _config = config; _env = env; _log = log;
    }

    public async Task<OrgMembersResponse> ListAsync(Guid orgId, string requesterUserId, CancellationToken ct)
    {
        // One query for every member's role rather than a GetRolesAsync per user.
        var members = await (
            from u in _db.Users
            where u.OrgId == orgId
            join ur in _db.UserRoles on u.Id equals ur.UserId into urs
            from ur in urs.DefaultIfEmpty()
            join r in _db.Roles on ur.RoleId equals r.Id into rs
            from r in rs.DefaultIfEmpty()
            orderby u.Email
            select new OrgMemberDto
            {
                UserId      = u.Id,
                Email       = u.Email ?? string.Empty,
                DisplayName = u.DisplayName,
                Role        = r != null ? r.Name ?? string.Empty : string.Empty,
                IsYou       = u.Id == requesterUserId,
            }).AsNoTracking().ToListAsync(ct);

        var now = DateTime.UtcNow;
        var invites = await _db.OrgInvites.AsNoTracking()
            .Where(i => i.OrgId == orgId && i.AcceptedAt == null && i.RevokedAt == null && i.ExpiresAt > now)
            .OrderByDescending(i => i.CreatedAt)
            .Select(i => new OrgInviteDto
            {
                Id = i.Id, Email = i.Email, Role = i.Role, CreatedAt = i.CreatedAt, ExpiresAt = i.ExpiresAt,
            })
            .ToListAsync(ct);

        return new OrgMembersResponse { Members = members, Invites = invites };
    }

    public async Task<CreateInviteResponse> CreateInviteAsync(
        Guid orgId, string inviterUserId, CreateInviteRequest request, CancellationToken ct)
    {
        var role = InvitableRoles.FirstOrDefault(r => string.Equals(r, request.Role, StringComparison.OrdinalIgnoreCase))
            ?? throw new ValidationException($"Role must be one of: {string.Join(", ", InvitableRoles)}.");
        var email = AccountLinks.NormalizeEmail(request.Email);

        // One account per email (UserName is the email). Inviting someone who
        // already has one would create an invite that can never be accepted.
        if (await _users.FindByEmailAsync(email) is not null)
            throw new ConflictException($"{email} already has an account.");

        var org = await _db.Organizations.FindAsync([orgId], ct)
            ?? throw new NotFoundException("Organization", orgId);

        // Re-inviting replaces the old link, so only the newest one works.
        var now = DateTime.UtcNow;
        var pending = await _db.OrgInvites
            .Where(i => i.OrgId == orgId && i.Email == email && i.AcceptedAt == null && i.RevokedAt == null)
            .ToListAsync(ct);
        foreach (var old in pending) old.RevokedAt = now;

        var token  = AccountLinks.NewToken();
        var invite = new OrgInvite
        {
            Id              = Guid.NewGuid(),
            OrgId           = orgId,
            Email           = email,
            Role            = role,
            TokenHash       = AccountLinks.Hash(token),
            InvitedByUserId = inviterUserId,
            CreatedAt       = now,
            ExpiresAt       = now.Add(InviteLifetime),
        };
        _db.OrgInvites.Add(invite);
        await _db.SaveChangesAsync(ct);

        var url = $"{AccountLinks.AdminBaseUrl(_config, _env)}/accept-invite?token={Uri.EscapeDataString(token)}";
        var sent = await TrySendInviteEmailAsync(email, org.Name, role, url, ct);

        _log.LogInformation("Org {OrgId}: invited {Email} as {Role} (email sent: {Sent})", orgId, email, role, sent);

        return new CreateInviteResponse
        {
            Invite = new OrgInviteDto
            {
                Id = invite.Id, Email = email, Role = role, CreatedAt = invite.CreatedAt, ExpiresAt = invite.ExpiresAt,
            },
            InviteUrl = url,
            EmailSent = sent,
        };
    }

    public async Task RevokeInviteAsync(Guid orgId, Guid inviteId, CancellationToken ct)
    {
        var invite = await _db.OrgInvites.FirstOrDefaultAsync(i => i.Id == inviteId && i.OrgId == orgId, ct)
            ?? throw new NotFoundException("Invite", inviteId);
        if (invite.AcceptedAt is not null)
            throw new ValidationException("This invite was already accepted. Remove the member instead.");
        invite.RevokedAt ??= DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Removes someone from the org: signs them out everywhere and deletes the
    /// account. Refuses to remove yourself or the org's last OrgAdmin, either of
    /// which could leave nobody able to manage the org.
    /// </summary>
    public async Task RemoveMemberAsync(Guid orgId, string requesterUserId, string userId, CancellationToken ct)
    {
        if (userId == requesterUserId)
            throw new ValidationException("You can't remove yourself.");

        var user = await _users.FindByIdAsync(userId);
        if (user is null || user.OrgId != orgId)
            throw new NotFoundException("Member not found.");

        if (await _users.IsInRoleAsync(user, AuthService.RoleOrgAdmin))
        {
            var admins = await _users.GetUsersInRoleAsync(AuthService.RoleOrgAdmin);
            if (admins.Count(a => a.OrgId == orgId) <= 1)
                throw new ValidationException("An org needs at least one organizer. Invite another first.");
        }

        await _tokens.RevokeAllUserTokensAsync(user.Id, ct);
        var result = await _users.DeleteAsync(user);
        if (!result.Succeeded)
            throw new ValidationException(string.Join(", ", result.Errors.Select(e => e.Description)));

        _log.LogInformation("Org {OrgId}: removed member {UserId} ({Email})", orgId, user.Id, user.Email);
    }

    private async Task<bool> TrySendInviteEmailAsync(
        string email, string orgName, string role, string url, CancellationToken ct)
    {
        var what = role == AuthService.RoleOrgAdmin ? "an organizer" : "event staff";
        var org  = WebUtility.HtmlEncode(orgName);
        var html =
            $"<p>You've been invited to help run <strong>{org}</strong> on Golf Fundraiser Pro as {what}.</p>" +
            $"<p><a href=\"{WebUtility.HtmlEncode(url)}\">Accept the invite and set your password</a></p>" +
            $"<p>The link works once and expires in {InviteLifetime.TotalDays:0} days.</p>";
        try
        {
            await _email.SendTransactionalAsync(email, email, $"You're invited to {orgName}", html, ct);
            return true;
        }
        catch (Exception ex)
        {
            // The organizer still gets the link in the response to share by hand.
            _log.LogWarning(ex, "Invite email to {Email} failed; the organizer can share the link directly", email);
            return false;
        }
    }
}
