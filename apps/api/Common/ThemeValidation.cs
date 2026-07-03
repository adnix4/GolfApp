// ─────────────────────────────────────────────────────────────────────────────
// Common/ThemeValidation.cs — server-side gate for org/event theme JSON
// ─────────────────────────────────────────────────────────────────────────────
//
// Mirrors packages/theme (validateContrast + isLightSurface) so the API rejects
// exactly the palettes the admin editors reject. Called from both the org
// profile update (OrgService) and the per-event branding update (EventService).
// ─────────────────────────────────────────────────────────────────────────────

using System.Text.Json;
using GolfFundraiserPro.Api.Common.Middleware;

namespace GolfFundraiserPro.Api.Common;

public static class ThemeValidation
{
    /// <summary>
    /// Surfaces below this relative luminance are rejected: cards render as
    /// white panels on every surface across all three apps, and combined with
    /// the 4.5:1 primary↔surface gate this floor forces primary dark enough
    /// to read on white cards. Mirrors MIN_SURFACE_LUMINANCE in packages/theme.
    /// </summary>
    public const double MinSurfaceLuminance = 0.4;

    /// <summary>
    /// Validates a 5-token theme JSON blob. Throws ValidationException when the
    /// JSON is malformed, a token is not 6-digit hex, primary-on-surface fails
    /// WCAG 2.1 AA (4.5:1), or the surface is too dark to sit behind white cards.
    /// </summary>
    public static void Validate(string themeJson)
    {
        ThemeDto theme;
        try
        {
            theme = JsonSerializer.Deserialize<ThemeDto>(themeJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? throw new ValidationException("Theme JSON could not be parsed.");
        }
        catch (JsonException)
        {
            throw new ValidationException("Theme JSON is malformed.");
        }

        if (!IsValidHex(theme.Primary)   || !IsValidHex(theme.Action) ||
            !IsValidHex(theme.Accent)    || !IsValidHex(theme.Highlight) ||
            !IsValidHex(theme.Surface))
            throw new ValidationException("All theme colors must be valid 6-digit hex strings (e.g. #31572c).");

        var ratio = GetContrastRatio(theme.Primary, theme.Surface);
        if (ratio < 4.5)
            throw new ValidationException(
                $"Theme fails WCAG 2.1 AA: primary ({theme.Primary}) on surface ({theme.Surface}) " +
                $"is {ratio:F1}:1 — must be ≥ 4.5:1.");

        if (GetRelativeLuminance(theme.Surface) < MinSurfaceLuminance)
            throw new ValidationException(
                $"Theme surface ({theme.Surface}) is too dark — it sits behind white cards. " +
                "Pick a pale tint (relative luminance ≥ 0.4).");
    }

    private static bool IsValidHex(string? hex) =>
        !string.IsNullOrWhiteSpace(hex) &&
        hex.StartsWith('#') &&
        hex.Length == 7 &&
        hex[1..].All(c => "0123456789abcdefABCDEF".Contains(c));

    private static double GetContrastRatio(string a, string b)
    {
        var lumA = GetRelativeLuminance(a);
        var lumB = GetRelativeLuminance(b);
        var lighter = Math.Max(lumA, lumB);
        var darker  = Math.Min(lumA, lumB);
        return (lighter + 0.05) / (darker + 0.05);
    }

    private static double GetRelativeLuminance(string hex)
    {
        var (r, g, b) = HexToLinearRgb(hex);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    private static (double r, double g, double b) HexToLinearRgb(string hex)
    {
        var clean = hex.TrimStart('#');
        var r8 = Convert.ToInt32(clean[..2], 16) / 255.0;
        var g8 = Convert.ToInt32(clean[2..4], 16) / 255.0;
        var b8 = Convert.ToInt32(clean[4..6], 16) / 255.0;
        static double Lin(double c) => c <= 0.04045 ? c / 12.92 : Math.Pow((c + 0.055) / 1.055, 2.4);
        return (Lin(r8), Lin(g8), Lin(b8));
    }

    private sealed class ThemeDto
    {
        public string Primary   { get; init; } = string.Empty;
        public string Action    { get; init; } = string.Empty;
        public string Accent    { get; init; } = string.Empty;
        public string Highlight { get; init; } = string.Empty;
        public string Surface   { get; init; } = string.Empty;
    }
}
