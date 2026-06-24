using Xunit;
using GolfFundraiserPro.Api.Features.Events.Branding;
using static GolfFundraiserPro.Api.Features.Events.Branding.BrandColorMath;

namespace WebAPI.Tests.Branding;

/// <summary>
/// Colour parsing + WCAG math underpin the heuristic palette. The luminance /
/// contrast formulas must match packages/theme so the server's palette honors
/// the same 4.5:1 rule the admin save-gate enforces.
/// </summary>
public class BrandColorMathTests
{
    [Theory]
    [InlineData("#ffffff", 255, 255, 255)]
    [InlineData("#000000", 0, 0, 0)]
    [InlineData("#31572c", 0x31, 0x57, 0x2c)]
    [InlineData("#fff", 255, 255, 255)]            // shorthand
    [InlineData("#31572cff", 0x31, 0x57, 0x2c)]    // 8-digit, alpha dropped
    [InlineData("rgb(64, 145, 81)", 64, 145, 81)]
    [InlineData("rgba(10,20,30,0.5)", 10, 20, 30)]
    [InlineData("rgb(100%, 0%, 0%)", 255, 0, 0)]   // percentage channels
    public void TryParse_parses_valid_colors(string input, int r, int g, int b)
    {
        var c = BrandColorMath.TryParse(input);
        Assert.NotNull(c);
        Assert.Equal(r, c!.Value.R);
        Assert.Equal(g, c.Value.G);
        Assert.Equal(b, c.Value.B);
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("not-a-color")]
    [InlineData("#xyz")]
    [InlineData("#12")]
    [InlineData("rgb()")]
    public void TryParse_returns_null_for_invalid(string? input)
    {
        Assert.Null(BrandColorMath.TryParse(input));
    }

    [Fact]
    public void ToHex_roundtrips()
    {
        Assert.Equal("#31572c", BrandColorMath.TryParse("#31572c")!.Value.ToHex());
    }

    [Fact]
    public void Luminance_white_is_one_black_is_zero()
    {
        Assert.Equal(1.0, RelativeLuminance(new Rgb(255, 255, 255)), 3);
        Assert.Equal(0.0, RelativeLuminance(new Rgb(0, 0, 0)), 3);
    }

    [Fact]
    public void Contrast_white_on_black_is_max()
    {
        Assert.Equal(21.0, ContrastRatio(new Rgb(255, 255, 255), new Rgb(0, 0, 0)), 1);
    }

    [Fact]
    public void Contrast_same_color_is_one()
    {
        Assert.Equal(1.0, ContrastRatio(new Rgb(50, 50, 50), new Rgb(50, 50, 50)), 3);
    }

    [Fact]
    public void EcoGreen_primary_on_surface_passes_AA()
    {
        var primary = BrandColorMath.TryParse("#31572c")!.Value;
        var surface = BrandColorMath.TryParse("#f4f7de")!.Value;
        Assert.True(ContrastRatio(primary, surface) >= 4.5);
    }

    [Fact]
    public void Mix_halfway_black_white_is_mid_grey()
    {
        var mid = Mix(new Rgb(0, 0, 0), new Rgb(255, 255, 255), 0.5);
        Assert.Equal(128, mid.R);
        Assert.Equal(128, mid.G);
        Assert.Equal(128, mid.B);
    }

    [Fact]
    public void Lighten_and_darken_extremes()
    {
        Assert.Equal("#ffffff", Lighten(new Rgb(0, 0, 0), 1).ToHex());
        Assert.Equal("#000000", Darken(new Rgb(255, 255, 255), 1).ToHex());
    }

    [Fact]
    public void Saturation_grey_zero_red_one()
    {
        Assert.Equal(0.0, Saturation(new Rgb(128, 128, 128)), 3);
        Assert.Equal(1.0, Saturation(new Rgb(255, 0, 0)), 3);
    }
}
