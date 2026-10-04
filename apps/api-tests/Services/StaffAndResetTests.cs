using Xunit;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using GolfFundraiserPro.Api.Common;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Features.Auth;
using GolfFundraiserPro.Api.Features.Emails;
using GolfFundraiserPro.Api.Features.Orgs;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Services;

/// <summary>
/// Staff invites (problemList D20) and password reset (D21) over a real Identity
/// stack on InMemory EF. Email has no SendGrid key here, so every send fails;
/// both flows must carry on regardless (the invite link is returned to the
/// organizer; a reset request never reveals whether the account exists).
/// </summary>
public class StaffAndResetTests
{
    private const string Secret   = "test-jwt-secret-that-is-definitely-long-enough-32+";
    private const string Password = "Passw0rd!";

    private sealed class H
    {
        public ApplicationDbContext Db = null!;
        public UserManager<ApplicationUser> Users = null!;
        public AuthService Auth = null!;
        public TokenService Tokens = null!;
        public OrgMembersService Members = null!;
        public AccountService Accounts = null!;
        public Guid OrgId;
        public string OwnerId = null!;
    }

    private static async Task<H> Build()
    {
        var db = InMemoryDbFactory.Create(Guid.NewGuid().ToString(), ignoreTransactions: true);
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["JWT_SECRET"] = Secret })
            .Build();

        var users = new UserManager<ApplicationUser>(
            new UserStore<ApplicationUser>(db), Options.Create(new IdentityOptions()), new PasswordHasher<ApplicationUser>(),
            new IUserValidator<ApplicationUser>[] { new UserValidator<ApplicationUser>() },
            new IPasswordValidator<ApplicationUser>[] { new PasswordValidator<ApplicationUser>() },
            new UpperInvariantLookupNormalizer(), new IdentityErrorDescriber(), null!,
            NullLogger<UserManager<ApplicationUser>>.Instance);
        // What AddDefaultTokenProviders registers in the app: reset tokens come from it.
        users.RegisterTokenProvider(TokenOptions.DefaultProvider, new DataProtectorTokenProvider<ApplicationUser>(
            new EphemeralDataProtectionProvider(),
            Options.Create(new DataProtectionTokenProviderOptions { TokenLifespan = TimeSpan.FromHours(1) }),
            NullLogger<DataProtectorTokenProvider<ApplicationUser>>.Instance));

        var roles = new RoleManager<IdentityRole>(
            new RoleStore<IdentityRole>(db), new IRoleValidator<IdentityRole>[] { new RoleValidator<IdentityRole>() },
            new UpperInvariantLookupNormalizer(), new IdentityErrorDescriber(), NullLogger<RoleManager<IdentityRole>>.Instance);

        var tokens = new TokenService(db, config, NullLogger<TokenService>.Instance);
        var auth   = new AuthService(db, users, roles, tokens, NullLogger<AuthService>.Instance);
        var email  = new EmailService(db, config, NullLogger<EmailService>.Instance);
        var env    = new NullWebHostEnvironment();

        var owner = await auth.RegisterAsync(new RegisterRequest
        {
            Email = "owner@example.com", Password = Password, DisplayName = "Olive Owner",
            OrgName = "Acme Boosters", OrgSlug = "acme", Is501c3 = true,
        });

        return new H
        {
            Db = db, Users = users, Auth = auth, Tokens = tokens,
            Members  = new OrgMembersService(db, users, tokens, email, config, env, NullLogger<OrgMembersService>.Instance),
            Accounts = new AccountService(db, users, auth, tokens, email, config, env, NullLogger<AccountService>.Instance),
            OrgId = owner.Org.Id, OwnerId = owner.User.Id,
        };
    }

    private static string TokenFrom(string inviteUrl) =>
        Uri.UnescapeDataString(inviteUrl[(inviteUrl.IndexOf("token=", StringComparison.Ordinal) + 6)..]);

    private static Task<CreateInviteResponse> Invite(H h, string email = "Sam.Staff@Example.com", string role = "EventStaff") =>
        h.Members.CreateInviteAsync(h.OrgId, h.OwnerId, new CreateInviteRequest { Email = email, Role = role }, default);

    private static Task<AuthResponse> Accept(H h, string token, string name = "Sam Staff", string pw = Password) =>
        h.Accounts.AcceptInviteAsync(new AcceptInviteRequest { Token = token, DisplayName = name, Password = pw }, default);

    // ── D20: invites ────────────────────────────────────────────────────────

    [Fact]
    public async Task Invite_returns_a_working_link_but_stores_only_its_hash()
    {
        var h = await Build();
        var created = await Invite(h);

        Assert.Equal("sam.staff@example.com", created.Invite.Email);   // normalized
        Assert.Equal("EventStaff", created.Invite.Role);
        Assert.False(created.EmailSent);                                 // no SendGrid key in tests
        Assert.StartsWith("https://app.golffundraiser.pro/accept-invite?token=", created.InviteUrl);

        var token = TokenFrom(created.InviteUrl);
        var row = h.Db.OrgInvites.Single();
        Assert.NotEqual(token, row.TokenHash);
        Assert.Equal(AccountLinks.Hash(token), row.TokenHash);
        Assert.Equal(created.Invite.ExpiresAt - created.Invite.CreatedAt, OrgMembersService.InviteLifetime);
    }

    [Theory]
    [InlineData("Golfer")]
    [InlineData("SuperAdmin")]
    [InlineData("nonsense")]
    public async Task Invite_only_grants_staff_or_organizer(string role)
    {
        var h = await Build();
        await Assert.ThrowsAsync<ValidationException>(() => Invite(h, role: role));
    }

    [Fact]
    public async Task Inviting_an_existing_account_is_a_conflict()
    {
        var h = await Build();
        await Assert.ThrowsAsync<ConflictException>(() => Invite(h, email: "OWNER@example.com"));
    }

    [Fact]
    public async Task Accepting_creates_a_staff_account_in_the_inviting_org_and_signs_in()
    {
        var h = await Build();
        var token = TokenFrom((await Invite(h)).InviteUrl);

        var preview = await h.Accounts.PreviewInviteAsync(token, default);
        Assert.Equal(("Acme Boosters", "sam.staff@example.com", "EventStaff"), (preview.OrgName, preview.Email, preview.Role));

        var signedIn = await Accept(h, token);
        Assert.Equal("EventStaff", signedIn.User.Role);
        Assert.Equal(h.OrgId, signedIn.Org.Id);
        Assert.False(string.IsNullOrEmpty(signedIn.AccessToken));

        var user = await h.Users.FindByEmailAsync("sam.staff@example.com");
        Assert.NotNull(user);
        Assert.Equal(h.OrgId, user!.OrgId);
        Assert.True(await h.Users.IsInRoleAsync(user, "EventStaff"));
        Assert.False(await h.Users.IsInRoleAsync(user, "OrgAdmin"));
        Assert.NotNull(h.Db.OrgInvites.Single().AcceptedAt);

        // And the new account can log in normally.
        var login = await h.Auth.LoginAsync(new LoginRequest { Email = "sam.staff@example.com", Password = Password });
        Assert.Equal("EventStaff", login.User.Role);
    }

    [Fact]
    public async Task A_co_organizer_invite_grants_OrgAdmin()
    {
        var h = await Build();
        var signedIn = await Accept(h, TokenFrom((await Invite(h, "co@example.com", "OrgAdmin")).InviteUrl));
        Assert.Equal("OrgAdmin", signedIn.User.Role);
    }

    [Fact]
    public async Task A_link_works_once()
    {
        var h = await Build();
        var token = TokenFrom((await Invite(h)).InviteUrl);
        await Accept(h, token);
        var again = await Assert.ThrowsAsync<NotFoundException>(() => Accept(h, token));
        Assert.Equal(AccountService.InvalidInvite, again.Message);
    }

    [Fact]
    public async Task Revoked_expired_and_made_up_links_all_fail_the_same_way()
    {
        var h = await Build();

        var revoked = await Invite(h, "r@example.com");
        await h.Members.RevokeInviteAsync(h.OrgId, revoked.Invite.Id, default);

        var expired = await Invite(h, "e@example.com");
        h.Db.OrgInvites.Single(i => i.Id == expired.Invite.Id).ExpiresAt = DateTime.UtcNow.AddMinutes(-1);
        await h.Db.SaveChangesAsync();

        foreach (var token in new[] { TokenFrom(revoked.InviteUrl), TokenFrom(expired.InviteUrl), "made-up" })
        {
            var ex = await Assert.ThrowsAsync<NotFoundException>(() => h.Accounts.PreviewInviteAsync(token, default));
            Assert.Equal(AccountService.InvalidInvite, ex.Message);
        }
    }

    [Fact]
    public async Task Re_inviting_replaces_the_old_link()
    {
        var h = await Build();
        var first  = TokenFrom((await Invite(h)).InviteUrl);
        var second = TokenFrom((await Invite(h)).InviteUrl);
        await Assert.ThrowsAsync<NotFoundException>(() => h.Accounts.PreviewInviteAsync(first, default));
        Assert.Equal("sam.staff@example.com", (await h.Accounts.PreviewInviteAsync(second, default)).Email);
    }

    [Fact]
    public async Task A_weak_password_is_refused_and_leaves_the_invite_usable()
    {
        var h = await Build();
        var token = TokenFrom((await Invite(h)).InviteUrl);
        await Assert.ThrowsAsync<ValidationException>(() => Accept(h, token, pw: "short"));
        Assert.Null(await h.Users.FindByEmailAsync("sam.staff@example.com"));
        Assert.Equal("EventStaff", (await Accept(h, token)).User.Role);
    }

    [Fact]
    public async Task Members_list_shows_roles_and_only_pending_invites()
    {
        var h = await Build();
        await Accept(h, TokenFrom((await Invite(h)).InviteUrl));      // accepted: a member now
        await Invite(h, "pending@example.com");                          // pending
        var revoked = await Invite(h, "gone@example.com");
        await h.Members.RevokeInviteAsync(h.OrgId, revoked.Invite.Id, default);

        var list = await h.Members.ListAsync(h.OrgId, h.OwnerId, default);
        Assert.Equal(new[] { ("owner@example.com", "OrgAdmin", true), ("sam.staff@example.com", "EventStaff", false) },
                     list.Members.Select(m => (m.Email, m.Role, m.IsYou)).OrderBy(x => x.Email).ToArray());
        Assert.Equal(new[] { "pending@example.com" }, list.Invites.Select(i => i.Email).ToArray());
    }

    [Fact]
    public async Task Removing_staff_deletes_the_account_and_its_sessions()
    {
        var h = await Build();
        var staff = await Accept(h, TokenFrom((await Invite(h)).InviteUrl));

        await h.Members.RemoveMemberAsync(h.OrgId, h.OwnerId, staff.User.Id, default);

        Assert.Null(await h.Users.FindByIdAsync(staff.User.Id));
        Assert.Null(await h.Tokens.ValidateRefreshTokenAsync(staff.RefreshToken));
    }

    [Fact]
    public async Task You_cannot_remove_yourself_or_the_last_organizer()
    {
        var h = await Build();
        await Assert.ThrowsAsync<ValidationException>(() =>
            h.Members.RemoveMemberAsync(h.OrgId, h.OwnerId, h.OwnerId, default));

        // With two organizers, one may remove the other; the one left can't be removed by anyone.
        var co = await Accept(h, TokenFrom((await Invite(h, "co@example.com", "OrgAdmin")).InviteUrl));
        await h.Members.RemoveMemberAsync(h.OrgId, co.User.Id, h.OwnerId, default);   // two → one: allowed
        await Assert.ThrowsAsync<ValidationException>(() =>
            h.Members.RemoveMemberAsync(h.OrgId, "someone-else", co.User.Id, default)); // last one: refused
    }

    [Fact]
    public async Task Members_of_another_org_are_invisible()
    {
        var h = await Build();
        var staff = await Accept(h, TokenFrom((await Invite(h)).InviteUrl));
        await Assert.ThrowsAsync<NotFoundException>(() =>
            h.Members.RemoveMemberAsync(Guid.NewGuid(), h.OwnerId, staff.User.Id, default));
    }

    // ── D21: password reset ─────────────────────────────────────────────────

    [Fact]
    public async Task Forgot_password_never_reveals_whether_an_account_exists()
    {
        var h = await Build();
        // Neither throws: unknown email, and a known one whose email send fails.
        await h.Accounts.ForgotPasswordAsync(new ForgotPasswordRequest { Email = "nobody@example.com" }, default);
        await h.Accounts.ForgotPasswordAsync(new ForgotPasswordRequest { Email = "owner@example.com" }, default);
    }

    private static async Task<string> ResetToken(H h, string email = "owner@example.com") =>
        await h.Users.GeneratePasswordResetTokenAsync((await h.Users.FindByEmailAsync(email))!);

    [Fact]
    public async Task Reset_sets_the_new_password_and_signs_out_every_session()
    {
        var h = await Build();
        var session = await h.Auth.LoginAsync(new LoginRequest { Email = "owner@example.com", Password = Password });

        await h.Accounts.ResetPasswordAsync(new ResetPasswordRequest
            { Email = "Owner@Example.com", Token = await ResetToken(h), NewPassword = "N3wPassword!" }, default);

        Assert.Null(await h.Tokens.ValidateRefreshTokenAsync(session.RefreshToken));
        await Assert.ThrowsAsync<ValidationException>(() =>
            h.Auth.LoginAsync(new LoginRequest { Email = "owner@example.com", Password = Password }));
        var fresh = await h.Auth.LoginAsync(new LoginRequest { Email = "owner@example.com", Password = "N3wPassword!" });
        Assert.Equal("OrgAdmin", fresh.User.Role);
    }

    [Fact]
    public async Task A_reset_link_works_once()
    {
        var h = await Build();
        var token = await ResetToken(h);
        await h.Accounts.ResetPasswordAsync(new ResetPasswordRequest
            { Email = "owner@example.com", Token = token, NewPassword = "N3wPassword!" }, default);
        var again = await Assert.ThrowsAsync<ValidationException>(() => h.Accounts.ResetPasswordAsync(
            new ResetPasswordRequest { Email = "owner@example.com", Token = token, NewPassword = "An0therPass!" }, default));
        Assert.Equal(AccountService.InvalidReset, again.Message);
    }

    [Fact]
    public async Task A_bad_token_or_unknown_email_gives_the_same_invalid_link_message()
    {
        var h = await Build();
        var bad = await Assert.ThrowsAsync<ValidationException>(() => h.Accounts.ResetPasswordAsync(
            new ResetPasswordRequest { Email = "owner@example.com", Token = "forged", NewPassword = "N3wPassword!" }, default));
        var unknown = await Assert.ThrowsAsync<ValidationException>(() => h.Accounts.ResetPasswordAsync(
            new ResetPasswordRequest { Email = "nobody@example.com", Token = "x", NewPassword = "N3wPassword!" }, default));
        Assert.Equal(AccountService.InvalidReset, bad.Message);
        Assert.Equal(AccountService.InvalidReset, unknown.Message);
    }

    [Fact]
    public async Task A_weak_new_password_says_why_and_keeps_the_old_one()
    {
        var h = await Build();
        var token = await ResetToken(h);
        var rule = await Assert.ThrowsAsync<ValidationException>(() => h.Accounts.ResetPasswordAsync(
            new ResetPasswordRequest { Email = "owner@example.com", Token = token, NewPassword = "short" }, default));
        Assert.NotEqual(AccountService.InvalidReset, rule.Message);   // a rule the person can fix, not "bad link"
        Assert.NotNull(await h.Auth.LoginAsync(new LoginRequest { Email = "owner@example.com", Password = Password }));
    }

    [Fact]
    public async Task A_reset_also_unlocks_a_locked_account()
    {
        var h = await Build();
        var user = (await h.Users.FindByEmailAsync("owner@example.com"))!;
        await h.Users.SetLockoutEndDateAsync(user, DateTimeOffset.UtcNow.AddMinutes(5));
        Assert.True(await h.Users.IsLockedOutAsync(user));

        await h.Accounts.ResetPasswordAsync(new ResetPasswordRequest
            { Email = "owner@example.com", Token = await ResetToken(h), NewPassword = "N3wPassword!" }, default);

        Assert.False(await h.Users.IsLockedOutAsync((await h.Users.FindByEmailAsync("owner@example.com"))!));
    }
}
