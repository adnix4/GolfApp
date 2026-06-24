using Xunit;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Features.Events.Branding;

namespace WebAPI.Tests.Branding;

/// <summary>
/// HTML scraping + URL validation are where regex bugs hide. These exercise the
/// internal ParseSignals / NormalizeUrl helpers directly.
/// </summary>
public class BrandExtractionParseTests
{
    private static readonly Uri Base = new("https://example.org/page");

    // ── NormalizeUrl ────────────────────────────────────────────────────────

    [Theory]
    [InlineData("example.org", "https://example.org/")]            // scheme added
    [InlineData("https://foo.com/x", "https://foo.com/x")]
    [InlineData("http://foo.com", "http://foo.com/")]              // http preserved
    public void NormalizeUrl_accepts_and_normalizes(string input, string expected)
    {
        Assert.Equal(expected, BrandExtractionService.NormalizeUrl(input).ToString());
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("ftp://foo.com")]      // non-http(s) scheme
    [InlineData("javascript:alert(1)")]
    [InlineData("hello world")]        // not a URL
    public void NormalizeUrl_rejects_invalid(string input)
    {
        Assert.Throws<ValidationException>(() => BrandExtractionService.NormalizeUrl(input));
    }

    // ── ParseSignals ────────────────────────────────────────────────────────

    [Fact]
    public void Extracts_theme_color()
    {
        var s = BrandExtractionService.ParseSignals(
            "<meta name=\"theme-color\" content=\"#1a73e8\">", Base);
        Assert.Equal("#1a73e8", s.ThemeColor);
    }

    [Fact]
    public void Extracts_theme_color_regardless_of_attribute_order()
    {
        var s = BrandExtractionService.ParseSignals(
            "<meta content=\"#abcdef\" name=\"theme-color\">", Base);
        Assert.Equal("#abcdef", s.ThemeColor);
    }

    [Fact]
    public void Resolves_relative_logo_to_absolute()
    {
        var s = BrandExtractionService.ParseSignals(
            "<link rel=\"icon\" href=\"/favicon.ico\">", Base);
        Assert.Contains(new Uri("https://example.org/favicon.ico"), s.LogoCandidates);
    }

    [Fact]
    public void Logo_candidates_prefer_og_image_first()
    {
        var html =
            "<link rel=\"icon\" href=\"/favicon.ico\">" +
            "<meta property=\"og:image\" content=\"https://cdn.example.org/logo.png\">" +
            "<link rel=\"apple-touch-icon\" href=\"/touch.png\">";
        var s = BrandExtractionService.ParseSignals(html, Base);
        Assert.Equal(new Uri("https://cdn.example.org/logo.png"), s.LogoCandidates[0]);
    }

    [Fact]
    public void Img_with_logo_keyword_is_a_candidate()
    {
        var s = BrandExtractionService.ParseSignals(
            "<img src=\"/brand.svg\" alt=\"Acme logo\">", Base);
        Assert.Contains(new Uri("https://example.org/brand.svg"), s.LogoCandidates);
    }

    [Fact]
    public void Img_without_logo_keyword_is_ignored()
    {
        var s = BrandExtractionService.ParseSignals(
            "<img src=\"/hero.jpg\" alt=\"sunset\">", Base);
        Assert.Empty(s.LogoCandidates);
    }

    [Fact]
    public void Colors_are_ordered_by_frequency()
    {
        var html = "<style>.a{color:#ff0000}.b{color:#ff0000}.c{background:#ff0000}.d{color:#00ff00}</style>";
        var s = BrandExtractionService.ParseSignals(html, Base);
        Assert.Equal("#ff0000", s.Colors[0]);
        Assert.Contains("#00ff00", s.Colors);
    }
}
