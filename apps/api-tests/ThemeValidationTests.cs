using Xunit;
using GolfFundraiserPro.Api.Common;
using GolfFundraiserPro.Api.Common.Middleware;

namespace WebAPI.Tests;

public class ThemeValidationTests
{
    private static string ThemeJson(
        string primary   = "#31572c",
        string action    = "#409151",
        string accent    = "#8ba955",
        string highlight = "#ecf39e",
        string surface   = "#f4f7de") =>
        $$"""{"primary":"{{primary}}","action":"{{action}}","accent":"{{accent}}","highlight":"{{highlight}}","surface":"{{surface}}"}""";

    // ── Accepts ─────────────────────────────────────────────────────────────

    [Fact]
    public void Accepts_the_default_eco_green_palette()
    {
        ThemeValidation.Validate(ThemeJson()); // must not throw
    }

    [Fact]
    public void Accepts_a_custom_brand_with_dark_primary_and_light_surface()
    {
        ThemeValidation.Validate(ThemeJson(primary: "#1a1a2e", surface: "#ffc0cb"));
    }

    // ── Rejects: malformed input ────────────────────────────────────────────

    [Fact]
    public void Rejects_malformed_json()
    {
        Assert.Throws<ValidationException>(() => ThemeValidation.Validate("{not json"));
    }

    [Fact]
    public void Rejects_non_hex_token_values()
    {
        Assert.Throws<ValidationException>(() => ThemeValidation.Validate(ThemeJson(primary: "green")));
        Assert.Throws<ValidationException>(() => ThemeValidation.Validate(ThemeJson(surface: "#fff"))); // 3-digit not allowed
    }

    // ── Rejects: WCAG contrast ──────────────────────────────────────────────

    [Fact]
    public void Rejects_low_primary_on_surface_contrast()
    {
        // Mid-grey on off-white ≈ 3.5:1 — below the 4.5:1 AA floor.
        Assert.Throws<ValidationException>(() => ThemeValidation.Validate(ThemeJson(primary: "#888888", surface: "#ffffff")));
    }

    // ── Rejects: dark surface ───────────────────────────────────────────────

    [Fact]
    public void Rejects_dark_surface_even_when_contrast_passes()
    {
        // Light primary on dark navy passes 4.5:1, but cards render as white
        // panels — a dark surface would put light primary text on white.
        Assert.Throws<ValidationException>(() => ThemeValidation.Validate(ThemeJson(primary: "#ecf39e", surface: "#1a1a2e")));
    }

    [Fact]
    public void Rejects_saturated_mid_tone_surface()
    {
        Assert.Throws<ValidationException>(() => ThemeValidation.Validate(ThemeJson(primary: "#ffffff", surface: "#e74c3c")));
    }

    // ── Brand priority: organizer chose their colors over the contrast rules ──

    private static string WithPriority(string json, bool priority) =>
        json.TrimEnd('}') + $",\"brandPriority\":{(priority ? "true" : "false")}}}";

    [Fact]
    public void Accepts_failing_contrast_and_dark_surface_when_brand_priority_is_set()
    {
        ThemeValidation.Validate(WithPriority(ThemeJson(primary: "#888888", surface: "#ffffff"), true));
        ThemeValidation.Validate(WithPriority(ThemeJson(primary: "#ecf39e", surface: "#1a1a2e"), true));
    }

    [Fact]
    public void Brand_priority_false_still_enforces_the_gates()
    {
        Assert.Throws<ValidationException>(() =>
            ThemeValidation.Validate(WithPriority(ThemeJson(primary: "#888888", surface: "#ffffff"), false)));
    }

    [Fact]
    public void Brand_priority_does_not_waive_well_formed_hex()
    {
        Assert.Throws<ValidationException>(() =>
            ThemeValidation.Validate(WithPriority(ThemeJson(primary: "green"), true)));
    }
}
