using Xunit;
using GolfFundraiserPro.Api.Features.Events;

namespace WebAPI.Tests;

public class EventCodeRulesTests
{
    [Fact]
    public void Generated_code_is_exactly_8_characters()
    {
        var code = EventCodeRules.Generate();
        Assert.Equal(8, code.Length);
    }

    [Fact]
    public void Generated_code_contains_only_valid_characters()
    {
        for (int i = 0; i < 50; i++)
        {
            var code = EventCodeRules.Generate();
            Assert.True(
                code.All(c => EventCodeRules.ValidChars.Contains(c)),
                $"Code '{code}' contains an invalid character");
        }
    }

    [Fact]
    public void Generated_code_never_contains_ambiguous_characters()
    {
        // O and 0 look alike; I and 1 look alike — spec excludes both
        var ambiguous = new[] { 'O', '0', 'I', '1' };
        for (int i = 0; i < 100; i++)
        {
            var code = EventCodeRules.Generate();
            Assert.True(
                code.All(c => !ambiguous.Contains(c)),
                $"Code '{code}' contains an ambiguous character");
        }
    }

    [Theory]
    [InlineData("ABCD1234")]  // contains '1' — ambiguous
    [InlineData("ABCDO234")]  // contains 'O' — ambiguous
    [InlineData("ABCDI234")]  // contains 'I' — ambiguous
    [InlineData("ABCD023")]   // 7 chars — too short
    [InlineData("ABCD02345")] // 9 chars — too long
    [InlineData("abcd2345")]  // lowercase
    [InlineData("")]
    [InlineData(null)]
    public void IsValidFormat_returns_false_for_invalid_codes(string? code)
    {
        Assert.False(EventCodeRules.IsValidFormat(code));
    }

    [Theory]
    [InlineData("ABCD2345")]
    [InlineData("ZZZZXXXX")]
    [InlineData("22334455")]
    public void IsValidFormat_returns_true_for_valid_codes(string code)
    {
        Assert.True(EventCodeRules.IsValidFormat(code));
    }

    [Fact]
    public void Generated_code_passes_IsValidFormat()
    {
        for (int i = 0; i < 20; i++)
            Assert.True(EventCodeRules.IsValidFormat(EventCodeRules.Generate()));
    }
}
