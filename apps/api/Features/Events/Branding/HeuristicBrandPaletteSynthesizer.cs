// ─────────────────────────────────────────────────────────────────────────────
// Features/Events/Branding/HeuristicBrandPaletteSynthesizer.cs
// ─────────────────────────────────────────────────────────────────────────────
//
// No-key heuristic: derive the 5-token palette from scraped colour signals using
// frequency + saturation + WCAG luminance — no external service. This is the
// default IBrandPaletteSynthesizer; an AI implementation can replace it later
// (see BrandPaletteContracts.cs) without touching the rest of the pipeline.
// ─────────────────────────────────────────────────────────────────────────────

using static GolfFundraiserPro.Api.Features.Events.Branding.BrandColorMath;

namespace GolfFundraiserPro.Api.Features.Events.Branding;

public sealed class HeuristicBrandPaletteSynthesizer : IBrandPaletteSynthesizer
{
    // Eco-Green fallbacks — keep in sync with packages/theme ECO_GREEN_DEFAULT.
    private const string FallbackPrimary = "#31572c";

    public BrandTheme Synthesize(BrandSignals signals)
    {
        // Candidate colours: theme-color first (strongest signal), then markup
        // colours in frequency order. Parse + dedupe (Rgb has value equality).
        var candidates = new List<Rgb>();
        void Add(string? raw)
        {
            if (TryParse(raw) is { } v && !candidates.Contains(v)) candidates.Add(v);
        }
        Add(signals.ThemeColor);
        foreach (var c in signals.Colors) Add(c);

        // Surface: a near-white background so dark brand text reads on it. Prefer
        // the lightest very-light candidate; else a neutral off-white.
        var surface = candidates
            .Where(c => RelativeLuminance(c) > 0.8)
            .OrderByDescending(RelativeLuminance)
            .Select(c => (Rgb?)c)
            .FirstOrDefault() ?? new Rgb(0xf8, 0xf9, 0xfa);

        // Primary: the most prominent brand colour — saturated and dark enough to
        // contrast. Fall back progressively, then to Eco-Green.
        var primary = candidates
                .Where(c => Saturation(c) >= 0.15 && RelativeLuminance(c) < 0.55)
                .Select(c => (Rgb?)c).FirstOrDefault()
            ?? candidates.Where(c => RelativeLuminance(c) < 0.6).Select(c => (Rgb?)c).FirstOrDefault()
            ?? TryParse(FallbackPrimary)!.Value;

        // Enforce WCAG AA (4.5:1) primary-on-surface — same gate as the admin save.
        primary = EnsureContrast(primary, surface);

        // Action (CTAs/links): a lighter, still-vivid take on primary.
        var action = Lighten(primary, 0.18);

        // Accent (decorative): a different vivid candidate, else a muted primary.
        var accent = candidates
            .Where(c => !c.Equals(primary) && Saturation(c) >= 0.2)
            .Select(c => (Rgb?)c).FirstOrDefault() ?? Mix(primary, surface, 0.45);

        // Highlight (selected states/banners): a pale tint of primary.
        var highlight = Lighten(primary, 0.75);

        return new BrandTheme(
            primary.ToHex(), action.ToHex(), accent.ToHex(), highlight.ToHex(), surface.ToHex());
    }

    // Darken the foreground in small steps until it clears 4.5:1 on the surface;
    // if it can't, use Eco-Green primary (guaranteed to pass on a light surface).
    private static Rgb EnsureContrast(Rgb fg, Rgb bg)
    {
        if (ContrastRatio(fg, bg) >= 4.5) return fg;
        var c = fg;
        for (var i = 0; i < 12 && ContrastRatio(c, bg) < 4.5; i++)
            c = Darken(c, 0.12);
        if (ContrastRatio(c, bg) >= 4.5) return c;
        var fallback = TryParse(FallbackPrimary)!.Value;
        return ContrastRatio(fallback, bg) >= 4.5 ? fallback : new Rgb(0x20, 0x20, 0x20);
    }
}
