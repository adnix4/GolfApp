// ─────────────────────────────────────────────────────────────────────────────
// Features/Events/Branding/BrandExtractionModels.cs — endpoint request/response
// ─────────────────────────────────────────────────────────────────────────────

using System.ComponentModel.DataAnnotations;

namespace GolfFundraiserPro.Api.Features.Events.Branding;

public sealed class ExtractBrandRequest
{
    [Required]
    [MaxLength(2048)]
    public string WebsiteUrl { get; init; } = string.Empty;
}

/// <summary>
/// A brand SUGGESTION — not persisted. The organizer reviews/edits it and then
/// saves via PATCH /branding. Theme serializes to { primary, action, accent,
/// highlight, surface } to match the admin GFPTheme shape.
/// </summary>
public sealed record BrandExtractionResponse(BrandTheme Theme, string? LogoUrl, string SourceUrl);
