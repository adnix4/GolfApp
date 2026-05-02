using Xunit;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Features.Teams;

namespace WebAPI.Tests;

public class InviteTokenHelperTests
{
    private const string Secret = "test-secret-at-least-32-chars-long!";

    // ── Round-trip ──────────────────────────────────────────────────────────

    [Fact]
    public void Generate_then_Validate_returns_the_original_team_id()
    {
        var teamId = Guid.NewGuid();
        var (token, _) = InviteTokenHelper.Generate(teamId, Secret);
        var result = InviteTokenHelper.Validate(token, Secret);
        Assert.Equal(teamId, result);
    }

    [Fact]
    public void ExpiresAt_is_48_hours_after_now()
    {
        var now    = DateTimeOffset.UtcNow;
        var (_, expiresAt) = InviteTokenHelper.Generate(Guid.NewGuid(), Secret, now);
        Assert.Equal(now.Add(InviteTokenHelper.Lifetime).UtcDateTime, expiresAt,
            precision: TimeSpan.FromSeconds(1));
    }

    // ── Expiry ──────────────────────────────────────────────────────────────

    [Fact]
    public void Validate_throws_when_token_is_expired()
    {
        var past   = DateTimeOffset.UtcNow.AddHours(-49); // issued 49h ago
        var (token, _) = InviteTokenHelper.Generate(Guid.NewGuid(), Secret, past);

        var ex = Assert.Throws<ValidationException>(() =>
            InviteTokenHelper.Validate(token, Secret));

        Assert.Contains("expired", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Validate_succeeds_one_second_before_expiry()
    {
        var now    = DateTimeOffset.UtcNow;
        var (token, expiresAt) = InviteTokenHelper.Generate(Guid.NewGuid(), Secret, now);

        // Validate at one second before expiry — should not throw
        var justBefore = new DateTimeOffset(expiresAt).AddSeconds(-1);
        var result = InviteTokenHelper.Validate(token, Secret, justBefore);
        Assert.IsType<Guid>(result);
    }

    // ── Tamper / wrong secret ───────────────────────────────────────────────

    [Fact]
    public void Validate_throws_when_signature_is_tampered()
    {
        var (token, _) = InviteTokenHelper.Generate(Guid.NewGuid(), Secret);
        var parts = token.Split('.');
        var tampered = $"{parts[0]}.INVALIDSIGNATURE";

        Assert.Throws<ValidationException>(() =>
            InviteTokenHelper.Validate(tampered, Secret));
    }

    [Fact]
    public void Validate_throws_when_payload_is_tampered()
    {
        // Swap in a different team ID in the payload, keeping the original signature
        var (token, _) = InviteTokenHelper.Generate(Guid.NewGuid(), Secret);
        var parts         = token.Split('.');
        var (fakeToken, _) = InviteTokenHelper.Generate(Guid.NewGuid(), Secret);
        var fakePayload   = fakeToken.Split('.')[0];
        var tampered      = $"{fakePayload}.{parts[1]}";

        Assert.Throws<ValidationException>(() =>
            InviteTokenHelper.Validate(tampered, Secret));
    }

    [Fact]
    public void Validate_throws_when_wrong_secret_is_used()
    {
        var (token, _) = InviteTokenHelper.Generate(Guid.NewGuid(), Secret);
        Assert.Throws<ValidationException>(() =>
            InviteTokenHelper.Validate(token, "wrong-secret-completely-different!"));
    }

    // ── Malformed tokens ────────────────────────────────────────────────────

    [Theory]
    [InlineData("")]
    [InlineData("nodot")]
    [InlineData("too.many.dots.here")]
    [InlineData("garbage.garbage")]
    public void Validate_throws_for_malformed_tokens(string bad)
    {
        Assert.Throws<ValidationException>(() =>
            InviteTokenHelper.Validate(bad, Secret));
    }

    // ── Different tokens per invocation ────────────────────────────────────

    [Fact]
    public void Two_tokens_for_same_team_generated_at_same_time_are_identical()
    {
        var teamId = Guid.NewGuid();
        var now    = DateTimeOffset.UtcNow;
        var (t1, _) = InviteTokenHelper.Generate(teamId, Secret, now);
        var (t2, _) = InviteTokenHelper.Generate(teamId, Secret, now);
        // same inputs → deterministic output (HMAC is deterministic)
        Assert.Equal(t1, t2);
    }

    [Fact]
    public void Two_tokens_for_different_teams_are_different()
    {
        var now = DateTimeOffset.UtcNow;
        var (t1, _) = InviteTokenHelper.Generate(Guid.NewGuid(), Secret, now);
        var (t2, _) = InviteTokenHelper.Generate(Guid.NewGuid(), Secret, now);
        Assert.NotEqual(t1, t2);
    }
}
