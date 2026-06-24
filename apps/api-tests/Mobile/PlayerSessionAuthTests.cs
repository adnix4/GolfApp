using Xunit;
using GolfFundraiserPro.Api.Common;

namespace WebAPI.Tests.Mobile;

/// <summary>
/// The session-token check authorizes every player self-service action (profile
/// edit, score sync, bids, payments). It must fail closed on empty input and only
/// accept an exact match — these properties are security-critical, so they are
/// pinned directly.
/// </summary>
public class PlayerSessionAuthTests
{
    [Fact]
    public void Matches_exact_token() => Assert.True(PlayerSessionAuth.Matches("tok-abc", "tok-abc"));

    [Fact]
    public void Rejects_different_token() => Assert.False(PlayerSessionAuth.Matches("tok-abc", "tok-xyz"));

    [Fact]
    public void Rejects_prefix() => Assert.False(PlayerSessionAuth.Matches("tok-abc", "tok-ab"));

    [Theory]
    [InlineData(null, "provided")]
    [InlineData("", "provided")]
    [InlineData("stored", null)]
    [InlineData("stored", "")]
    [InlineData(null, null)]
    [InlineData("", "")]
    public void Fails_closed_on_empty_or_null(string? stored, string? provided)
        => Assert.False(PlayerSessionAuth.Matches(stored, provided));
}
