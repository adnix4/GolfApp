using Xunit;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Features.Auth;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Services;

/// <summary>
/// Integration tests for AuthService over a real ASP.NET Identity stack (UserManager
/// + RoleManager) backed by InMemory EF Core. Covers register (org+user+role+tokens),
/// login (success, generic failure, lockout), refresh-token rotation, and logout.
/// </summary>
public class AuthServiceTests
{
    private const string Secret = "test-jwt-secret-that-is-definitely-long-enough-32+";

    private sealed class Harness
    {
        public ApplicationDbContext Db = null!;
        public AuthService Svc = null!;
        public UserManager<ApplicationUser> Users = null!;
        public TokenService Tokens = null!;
    }

    private static Harness Build()
    {
        // Same in-memory database name so the UserStore and AuthService share state,
        // with transaction warnings suppressed for RegisterAsync's BeginTransaction.
        var dbName = Guid.NewGuid().ToString();
        var db = InMemoryDbFactory.Create(dbName, ignoreTransactions: true);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["JWT_SECRET"] = Secret })
            .Build();

        var idOptions = Options.Create(new IdentityOptions());
        var userStore = new UserStore<ApplicationUser>(db);
        var users = new UserManager<ApplicationUser>(
            userStore, idOptions, new PasswordHasher<ApplicationUser>(),
            new IUserValidator<ApplicationUser>[] { new UserValidator<ApplicationUser>() },
            new IPasswordValidator<ApplicationUser>[] { new PasswordValidator<ApplicationUser>() },
            new UpperInvariantLookupNormalizer(), new IdentityErrorDescriber(), null!,
            NullLogger<UserManager<ApplicationUser>>.Instance);

        var roleStore = new RoleStore<IdentityRole>(db);
        var roles = new RoleManager<IdentityRole>(
            roleStore, new IRoleValidator<IdentityRole>[] { new RoleValidator<IdentityRole>() },
            new UpperInvariantLookupNormalizer(), new IdentityErrorDescriber(),
            NullLogger<RoleManager<IdentityRole>>.Instance);

        var tokens = new TokenService(db, config, NullLogger<TokenService>.Instance);
        var svc = new AuthService(db, users, roles, tokens, NullLogger<AuthService>.Instance);

        return new Harness { Db = db, Svc = svc, Users = users, Tokens = tokens };
    }

    private static RegisterRequest Reg(string email = "jane@example.com", string slug = "acme") => new()
    {
        Email = email, Password = "Passw0rd!", DisplayName = "Jane Smith",
        OrgName = "Acme Boosters", OrgSlug = slug, Is501c3 = true,
    };

    // ── Register ──────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Register_creates_org_user_role_and_tokens()
    {
        var h = Build();
        var res = await h.Svc.RegisterAsync(Reg());

        Assert.False(string.IsNullOrEmpty(res.AccessToken));
        Assert.False(string.IsNullOrEmpty(res.RefreshToken));
        Assert.Equal("jane@example.com", res.User.Email);
        Assert.Equal(AuthService.RoleOrgAdmin, res.User.Role);
        Assert.Equal("acme", res.Org.Slug);

        Assert.Single(h.Db.Organizations);
        var user = h.Users.Users.Single();
        Assert.Contains(AuthService.RoleOrgAdmin, await h.Users.GetRolesAsync(user));
        Assert.Equal(1, h.Db.RefreshTokens.Count()); // refresh token persisted
    }

    [Fact]
    public async Task Register_rejects_a_duplicate_slug()
    {
        var h = Build();
        await h.Svc.RegisterAsync(Reg(email: "a@example.com", slug: "dup"));
        await Assert.ThrowsAsync<ConflictException>(
            () => h.Svc.RegisterAsync(Reg(email: "b@example.com", slug: "dup")));
    }

    [Fact]
    public async Task Register_rejects_a_weak_password_and_rolls_back_the_org()
    {
        var h = Build();
        var weak = Reg() with { Password = "weak" }; // no digit/upper/symbol, too short
        await Assert.ThrowsAsync<ValidationException>(() => h.Svc.RegisterAsync(weak));

        Assert.Empty(h.Users.Users);
    }

    // ── Login ───────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Login_succeeds_with_correct_credentials()
    {
        var h = Build();
        await h.Svc.RegisterAsync(Reg());

        var res = await h.Svc.LoginAsync(new LoginRequest { Email = "jane@example.com", Password = "Passw0rd!" });
        Assert.False(string.IsNullOrEmpty(res.AccessToken));
        Assert.Equal("jane@example.com", res.User.Email);
    }

    [Fact]
    public async Task Login_wrong_password_throws_generic_error()
    {
        var h = Build();
        await h.Svc.RegisterAsync(Reg());

        var ex = await Assert.ThrowsAsync<ValidationException>(
            () => h.Svc.LoginAsync(new LoginRequest { Email = "jane@example.com", Password = "WrongPass1!" }));
        Assert.Equal("Invalid email or password.", ex.Message);
    }

    [Fact]
    public async Task Login_unknown_email_throws_the_same_generic_error()
    {
        var h = Build();
        var ex = await Assert.ThrowsAsync<ValidationException>(
            () => h.Svc.LoginAsync(new LoginRequest { Email = "nobody@example.com", Password = "whatever1!" }));
        Assert.Equal("Invalid email or password.", ex.Message); // no email enumeration
    }

    [Fact]
    public async Task Login_locks_out_after_repeated_failures()
    {
        var h = Build();
        await h.Svc.RegisterAsync(Reg());

        // Default Identity lockout threshold is 5 failed attempts.
        for (int i = 0; i < 5; i++)
            await Assert.ThrowsAsync<ValidationException>(
                () => h.Svc.LoginAsync(new LoginRequest { Email = "jane@example.com", Password = "WrongPass1!" }));

        var ex = await Assert.ThrowsAsync<ValidationException>(
            () => h.Svc.LoginAsync(new LoginRequest { Email = "jane@example.com", Password = "Passw0rd!" }));
        Assert.Contains("locked", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    // ── Refresh + logout ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Refresh_rotates_tokens_and_revokes_the_old_one()
    {
        var h = Build();
        var first = await h.Svc.RegisterAsync(Reg());

        var second = await h.Svc.RefreshAsync(first.RefreshToken);
        Assert.NotEqual(first.RefreshToken, second.RefreshToken);

        // Re-using the original (now revoked) token must fail — replay protection.
        await Assert.ThrowsAsync<ValidationException>(() => h.Svc.RefreshAsync(first.RefreshToken));
        // The freshly issued token still works.
        Assert.NotNull(await h.Svc.RefreshAsync(second.RefreshToken));
    }

    [Fact]
    public async Task Refresh_rejects_an_invalid_token()
    {
        var h = Build();
        await Assert.ThrowsAsync<ValidationException>(() => h.Svc.RefreshAsync("garbage-token"));
    }

    [Fact]
    public async Task Logout_revokes_the_refresh_token()
    {
        var h = Build();
        var res = await h.Svc.RegisterAsync(Reg());

        await h.Svc.LogoutAsync(res.RefreshToken);

        await Assert.ThrowsAsync<ValidationException>(() => h.Svc.RefreshAsync(res.RefreshToken));
    }
}
