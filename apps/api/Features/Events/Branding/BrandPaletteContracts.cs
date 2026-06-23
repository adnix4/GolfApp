// ─────────────────────────────────────────────────────────────────────────────
// Features/Events/Branding/BrandPaletteContracts.cs
// ─────────────────────────────────────────────────────────────────────────────
//
// The swappable seam. Brand extraction is a fixed pipeline:
//
//   URL → [SSRF-safe fetch] → [parse HTML → BrandSignals]
//                                   │
//                                   ▼
//                  IBrandPaletteSynthesizer.Synthesize  ◀── the ONLY step that
//                                   │                        differs by strategy
//                                   ▼
//                  [download + store logo] → BrandTheme + logo URL
//
// Today: HeuristicBrandPaletteSynthesizer (no external dependency / no API key).
// To add an AI version later, implement IBrandPaletteSynthesizer and change one
// DI registration — the fetch/parse/logo/endpoint/UI code is untouched.
// ─────────────────────────────────────────────────────────────────────────────

namespace GolfFundraiserPro.Api.Features.Events.Branding;

/// <summary>
/// Brand signals scraped from a website's HTML/CSS — the input to a synthesizer.
/// </summary>
public sealed record BrandSignals
{
    /// <summary>Absolute page URL actually fetched (after redirects).</summary>
    public required Uri SourceUrl { get; init; }

    /// <summary>&lt;meta name="theme-color"&gt; value, if present (strongest brand hint).</summary>
    public string? ThemeColor { get; init; }

    /// <summary>Hex colours found in the markup, most frequent first.</summary>
    public IReadOnlyList<string> Colors { get; init; } = Array.Empty<string>();

    /// <summary>Candidate logo image URLs (absolute), best-guess first.</summary>
    public IReadOnlyList<Uri> LogoCandidates { get; init; } = Array.Empty<Uri>();
}

/// <summary>The 5-token GFP palette (mirrors packages/theme GFPTheme). Hex strings.</summary>
public sealed record BrandTheme(
    string Primary, string Action, string Accent, string Highlight, string Surface);

/// <summary>
/// Turns scraped colour signals into a coherent, WCAG-valid 5-token palette.
/// The one strategy-specific step in brand extraction.
/// </summary>
public interface IBrandPaletteSynthesizer
{
    BrandTheme Synthesize(BrandSignals signals);
}
