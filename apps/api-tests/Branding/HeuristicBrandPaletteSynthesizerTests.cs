using Xunit;
using GolfFundraiserPro.Api.Features.Events.Branding;
using static GolfFundraiserPro.Api.Features.Events.Branding.BrandColorMath;

namespace WebAPI.Tests.Branding;

/// <summary>
/// The heuristic synthesizer is the no-key strategy. Whatever the scraped
/// signals look like, its output must (1) be five valid hex tokens and (2)
/// satisfy WCAG AA primary-on-surface — the same gate the admin save enforces —
/// so a suggested palette can never be saved into an unreadable state.
/// </summary>
public class HeuristicBrandPaletteSynthesizerTests
{
    private const string HexPattern = "^#[0-9a-f]{6}$";
    private readonly HeuristicBrandPaletteSynthesizer _synth = new();

    private static BrandSignals Signals(string? themeColor, params string[] colors) => new()
    {
        SourceUrl = new Uri("https://example.org"),
        ThemeColor = themeColor,
        Colors = colors,
    };

    private static void AssertValidPalette(BrandTheme t)
    {
        foreach (var hex in new[] { t.Primary, t.Action, t.Accent, t.Highlight, t.Surface })
            Assert.Matches(HexPattern, hex);

        var primary = BrandColorMath.TryParse(t.Primary)!.Value;
        var surface = BrandColorMath.TryParse(t.Surface)!.Value;
        Assert.True(
            ContrastRatio(primary, surface) >= 4.5,
            $"primary {t.Primary} on surface {t.Surface} = {ContrastRatio(primary, surface):F2}:1");
    }

    [Fact]
    public void Empty_signals_yield_a_valid_contrasting_palette()
    {
        AssertValidPalette(_synth.Synthesize(Signals(null)));
    }

    [Fact]
    public void Vivid_brand_color_yields_valid_palette()
    {
        AssertValidPalette(_synth.Synthesize(Signals("#1a73e8", "#1a73e8", "#ffffff", "#202124")));
    }

    [Fact]
    public void Light_only_colors_still_contrast()
    {
        // Nothing dark to pick — primary must fall back / darken so it still reads.
        AssertValidPalette(_synth.Synthesize(Signals(null, "#fafafa", "#eeeeee", "#f0f0f0")));
    }

    [Fact]
    public void Low_contrast_theme_color_is_corrected()
    {
        // A pale theme-color would fail untouched; EnsureContrast must fix it.
        AssertValidPalette(_synth.Synthesize(Signals("#fff2a8", "#fff2a8")));
    }

    [Fact]
    public void Frequent_vivid_color_drives_a_valid_palette()
    {
        AssertValidPalette(_synth.Synthesize(Signals(null, "#8e24aa", "#8e24aa", "#8e24aa", "#ffffff")));
    }
}
