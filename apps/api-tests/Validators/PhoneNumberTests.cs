using Xunit;
using GolfFundraiserPro.Api.Common;
using GolfFundraiserPro.Api.Common.Middleware;

namespace WebAPI.Tests.Validators;

/// <summary>
/// PhoneNumber.Normalize — every phone write goes through it, so a stored phone
/// is always 10 digits and anything else is a 400.
/// </summary>
public class PhoneNumberTests
{
    [Theory]
    [InlineData("5558675309")]
    [InlineData("(555) 867-5309")]
    [InlineData("555.867.5309")]
    [InlineData(" 555 867 5309 ")]
    [InlineData("+1 (555) 867-5309")]
    [InlineData("15558675309")]
    public void Normalizes_common_formats_to_10_digits(string raw) =>
        Assert.Equal("5558675309", PhoneNumber.Normalize(raw));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Blank_means_no_phone(string? raw) => Assert.Null(PhoneNumber.Normalize(raw));

    [Theory]
    [InlineData("555-1234")]            // 7 digits
    [InlineData("55586753091")]         // 11 digits, not a +1
    [InlineData("(055) 867-5309")]      // area code can't start with 0
    [InlineData("(155) 867-5309")]      // ...or 1
    [InlineData("(555) 167-5309")]      // exchange can't start with 1
    [InlineData("555-867-5309 x12")]    // letters
    [InlineData("call me")]
    public void Rejects_anything_else(string raw)
    {
        var ex = Assert.Throws<ValidationException>(() => PhoneNumber.Normalize(raw));
        Assert.Equal(PhoneNumber.Invalid, ex.Message);
    }
}
