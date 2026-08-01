using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Xunit;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Features.Auth;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Services;

/// <summary>
/// Tests for TokenService: JWT claim/expiry generation, refresh-token entropy,
/// and the DB-backed refresh-token lifecycle (hash-at-rest, validate, rotate,
/// revoke, revoke-all).
/// </summary>
public class TokenServiceTests
{
    private const string Secret = "test-jwt-secret-that-is-definitely-long-enough-32+";

    private static TokenService Build(GolfFundraiserPro.Api.Data.ApplicationDbContext db, bool withSecret = true)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(withSecret
                ? new Dictionary<string, string?> { ["JWT_SECRET"] = Secret }
                : new Dictionary<string, string?>())
            .Build();
        return new TokenService(db, config, NullLogger<TokenService>.Instance);
    }

    private static ApplicationUser User() => new()
    {
        Id = Guid.NewGuid().ToString(), Email = "org@example.com",
        UserName = "org@example.com", DisplayName = "Org Admin",
    };

    [Fact]
    public void GenerateAccessToken_embeds_claims_and_expiry()
    {
        using var db = InMemoryDbFactory.Create();
        var orgId = Guid.NewGuid();
        var user = User();

        var (token, expiresAt) = Build(db).GenerateAccessToken(user, "OrgAdmin", orgId);

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
        Assert.Equal(user.Id, jwt.Claims.First(c => c.Type == JwtRegisteredClaimNames.Sub).Value);
        Assert.Equal("org@example.com", jwt.Claims.First(c => c.Type == JwtRegisteredClaimNames.Email).Value);
        Assert.Equal("OrgAdmin", jwt.Claims.First(c => c.Type == ClaimTypes.Role).Value);
        Assert.Equal(orgId.ToString(), jwt.Claims.First(c => c.Type == "orgId").Value);
        // ~15 minute lifetime
        Assert.InRange(expiresAt, DateTime.UtcNow.AddMinutes(14), DateTime.UtcNow.AddMinutes(16));
    }

    [Fact]
    public void GenerateAccessToken_throws_without_secret()
    {
        using var db = InMemoryDbFactory.Create();
        Assert.Throws<InvalidOperationException>(
            () => Build(db, withSecret: false).GenerateAccessToken(User(), "OrgAdmin", Guid.NewGuid()));
    }

    [Fact]
    public void GenerateRefreshToken_is_url_safe_and_unique()
    {
        using var db = InMemoryDbFactory.Create();
        var svc = Build(db);
        var a = svc.GenerateRefreshToken();
        var b = svc.GenerateRefreshToken();

        Assert.NotEqual(a, b);
        Assert.DoesNotContain('+', a);
        Assert.DoesNotContain('/', a);
        Assert.DoesNotContain('=', a);
        Assert.True(a.Length >= 80);
    }

    [Fact]
    public async Task StoreRefreshToken_persists_a_hash_not_the_raw_token()
    {
        using var db = InMemoryDbFactory.Create();
        var svc = Build(db);
        var raw = svc.GenerateRefreshToken();

        await svc.StoreRefreshTokenAsync("user-1", raw);

        var record = db.RefreshTokens.Single();
        Assert.NotEqual(raw, record.Token);          // stored value is hashed
        Assert.False(record.IsRevoked);
    }

    [Fact]
    public async Task ValidateRefreshToken_returns_user_for_a_valid_token()
    {
        using var db = InMemoryDbFactory.Create();
        var svc = Build(db);
        var raw = svc.GenerateRefreshToken();
        await svc.StoreRefreshTokenAsync("user-1", raw);

        Assert.Equal("user-1", await svc.ValidateRefreshTokenAsync(raw));
    }

    [Fact]
    public async Task ValidateRefreshToken_returns_null_for_unknown_token()
    {
        using var db = InMemoryDbFactory.Create();
        Assert.Null(await Build(db).ValidateRefreshTokenAsync("never-stored"));
    }

    [Fact]
    public async Task ValidateRefreshToken_returns_null_when_expired()
    {
        using var db = InMemoryDbFactory.Create();
        var svc = Build(db);
        var raw = svc.GenerateRefreshToken();
        await svc.StoreRefreshTokenAsync("user-1", raw);

        var record = db.RefreshTokens.Single();
        record.ExpiresAt = DateTime.UtcNow.AddDays(-1);
        await db.SaveChangesAsync();

        Assert.Null(await svc.ValidateRefreshTokenAsync(raw));
    }

    [Fact]
    public async Task RevokeRefreshToken_invalidates_the_token()
    {
        using var db = InMemoryDbFactory.Create();
        var svc = Build(db);
        var raw = svc.GenerateRefreshToken();
        await svc.StoreRefreshTokenAsync("user-1", raw);

        await svc.RevokeRefreshTokenAsync(raw);

        Assert.Null(await svc.ValidateRefreshTokenAsync(raw));
        Assert.True(db.RefreshTokens.Single().IsRevoked);
    }

    [Fact]
    public async Task RevokeAllUserTokens_revokes_every_active_token_for_the_user()
    {
        using var db = InMemoryDbFactory.Create();
        var svc = Build(db);
        var a = svc.GenerateRefreshToken();
        var b = svc.GenerateRefreshToken();
        await svc.StoreRefreshTokenAsync("user-1", a);
        await svc.StoreRefreshTokenAsync("user-1", b);
        await svc.StoreRefreshTokenAsync("user-2", svc.GenerateRefreshToken());

        await svc.RevokeAllUserTokensAsync("user-1");

        Assert.Null(await svc.ValidateRefreshTokenAsync(a));
        Assert.Null(await svc.ValidateRefreshTokenAsync(b));
        Assert.Equal(1, db.RefreshTokens.Count(t => t.UserId == "user-2" && !t.IsRevoked));
    }

    // ── Concurrent-refresh grace window (D17) ────────────────────────────────
    //
    // Two tabs (or admin + mobile) hit the same expiry with the same refresh
    // token. Rotation revokes on the first; without a grace window the others
    // were told "log in again" and cleared a live session.

    [Fact]
    public async Task Token_rotated_moments_ago_is_still_accepted()
    {
        using var db = InMemoryDbFactory.Create();
        var svc = Build(db);
        var raw = svc.GenerateRefreshToken();
        await svc.StoreRefreshTokenAsync("user-1", raw);

        await svc.RevokeRefreshTokenAsync(raw, dueToRotation: true);

        // The losing racer arrives a beat later and must NOT be logged out.
        Assert.Equal("user-1", await svc.ValidateRefreshTokenAsync(raw));
    }

    [Fact]
    public async Task Token_rotated_long_ago_is_rejected_as_reuse()
    {
        using var db = InMemoryDbFactory.Create();
        var svc = Build(db);
        var raw = svc.GenerateRefreshToken();
        await svc.StoreRefreshTokenAsync("user-1", raw);
        await svc.RevokeRefreshTokenAsync(raw, dueToRotation: true);

        // Age it well past the grace window — this is the stolen-token case.
        var record = db.RefreshTokens.Single();
        record.RotatedAt = DateTime.UtcNow.AddMinutes(-5);
        record.RevokedAt = record.RotatedAt;
        await db.SaveChangesAsync();

        Assert.Null(await svc.ValidateRefreshTokenAsync(raw));
    }

    [Fact]
    public async Task Logout_revocation_gets_no_grace()
    {
        using var db = InMemoryDbFactory.Create();
        var svc = Build(db);
        var raw = svc.GenerateRefreshToken();
        await svc.StoreRefreshTokenAsync("user-1", raw);

        // Default (dueToRotation: false) is what LogoutAsync uses. A logged-out
        // token must die immediately — the grace window is only for rotation.
        await svc.RevokeRefreshTokenAsync(raw);

        Assert.Null(await svc.ValidateRefreshTokenAsync(raw));
        Assert.Null(db.RefreshTokens.Single().RotatedAt);
    }

    [Fact]
    public async Task Password_change_revocation_gets_no_grace()
    {
        using var db = InMemoryDbFactory.Create();
        var svc = Build(db);
        var raw = svc.GenerateRefreshToken();
        await svc.StoreRefreshTokenAsync("user-1", raw);

        await svc.RevokeAllUserTokensAsync("user-1");

        Assert.Null(await svc.ValidateRefreshTokenAsync(raw));
        Assert.Null(db.RefreshTokens.Single().RotatedAt);
    }

    [Fact]
    public async Task Expired_token_is_rejected_even_inside_the_grace_window()
    {
        using var db = InMemoryDbFactory.Create();
        var svc = Build(db);
        var raw = svc.GenerateRefreshToken();
        await svc.StoreRefreshTokenAsync("user-1", raw);
        await svc.RevokeRefreshTokenAsync(raw, dueToRotation: true);

        // Grace must not resurrect a token past its 30-day life.
        var record = db.RefreshTokens.Single();
        record.ExpiresAt = DateTime.UtcNow.AddSeconds(-1);
        await db.SaveChangesAsync();

        Assert.Null(await svc.ValidateRefreshTokenAsync(raw));
    }
}
