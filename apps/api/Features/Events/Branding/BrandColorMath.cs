// ─────────────────────────────────────────────────────────────────────────────
// Features/Events/Branding/BrandColorMath.cs — dependency-free colour helper
// ─────────────────────────────────────────────────────────────────────────────
//
// Parsing + WCAG math for the heuristic palette synthesizer. The luminance /
// contrast formulas mirror packages/theme (validateContrast) so the server's
// palette respects the same 4.5:1 rule the admin save-gate enforces.
// ─────────────────────────────────────────────────────────────────────────────

using System.Globalization;

namespace GolfFundraiserPro.Api.Features.Events.Branding;

public static class BrandColorMath
{
    public readonly record struct Rgb(int R, int G, int B)
    {
        public string ToHex() => $"#{R:x2}{G:x2}{B:x2}";
    }

    /// <summary>Parse #rgb / #rrggbb / #rrggbbaa / rgb() / rgba(). Null if unparseable.</summary>
    public static Rgb? TryParse(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var s = value.Trim();

        if (s.StartsWith('#'))
        {
            var hex = s[1..];
            if (hex.Length == 3)
                hex = string.Concat(hex[0], hex[0], hex[1], hex[1], hex[2], hex[2]);
            if ((hex.Length == 6 || hex.Length == 8)
                && int.TryParse(hex.AsSpan(0, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var r)
                && int.TryParse(hex.AsSpan(2, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var g)
                && int.TryParse(hex.AsSpan(4, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var b))
                return new Rgb(r, g, b);
            return null;
        }

        if (s.StartsWith("rgb", StringComparison.OrdinalIgnoreCase))
        {
            var open = s.IndexOf('(');
            var close = s.IndexOf(')');
            if (open < 0 || close <= open) return null;
            var parts = s[(open + 1)..close].Split(',');
            if (parts.Length >= 3 && TryByte(parts[0], out var r) && TryByte(parts[1], out var g) && TryByte(parts[2], out var b))
                return new Rgb(r, g, b);
        }
        return null;
    }

    private static bool TryByte(string s, out int v)
    {
        v = 0;
        s = s.Trim();
        if (s.EndsWith('%') && double.TryParse(s.AsSpan(0, s.Length - 1), NumberStyles.Float, CultureInfo.InvariantCulture, out var pct))
        { v = Clamp((int)Math.Round(pct / 100.0 * 255)); return true; }
        if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var n))
        { v = Clamp((int)Math.Round(n)); return true; }
        return false;
    }

    private static int Clamp(int v) => Math.Max(0, Math.Min(255, v));

    private static double Linearize(double c)
    {
        c /= 255.0;
        return c <= 0.04045 ? c / 12.92 : Math.Pow((c + 0.055) / 1.055, 2.4);
    }

    public static double RelativeLuminance(Rgb c) =>
        0.2126 * Linearize(c.R) + 0.7152 * Linearize(c.G) + 0.0722 * Linearize(c.B);

    public static double ContrastRatio(Rgb a, Rgb b)
    {
        var la = RelativeLuminance(a);
        var lb = RelativeLuminance(b);
        var hi = Math.Max(la, lb);
        var lo = Math.Min(la, lb);
        return (hi + 0.05) / (lo + 0.05);
    }

    /// <summary>Mix toward <paramref name="target"/> by t (0..1).</summary>
    public static Rgb Mix(Rgb c, Rgb target, double t)
    {
        t = Math.Max(0, Math.Min(1, t));
        return new Rgb(
            (int)Math.Round(c.R + (target.R - c.R) * t),
            (int)Math.Round(c.G + (target.G - c.G) * t),
            (int)Math.Round(c.B + (target.B - c.B) * t));
    }

    public static Rgb Darken(Rgb c, double t)  => Mix(c, new Rgb(0, 0, 0), t);
    public static Rgb Lighten(Rgb c, double t) => Mix(c, new Rgb(255, 255, 255), t);

    /// <summary>HSL saturation (0..1) — used to prefer vivid brand colours over greys.</summary>
    public static double Saturation(Rgb c)
    {
        double r = c.R / 255.0, g = c.G / 255.0, b = c.B / 255.0;
        double max = Math.Max(r, Math.Max(g, b)), min = Math.Min(r, Math.Min(g, b));
        double l = (max + min) / 2.0;
        double d = max - min;
        if (d < 1e-6) return 0;
        return d / (1 - Math.Abs(2 * l - 1));
    }
}
