using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;

namespace GolfFundraiserPro.Api.Features.Orgs;

public class OrgService
{
    private readonly ApplicationDbContext _db;
    private readonly IWebHostEnvironment  _env;
    private readonly ILogger<OrgService>  _logger;

    private static readonly string[] AllowedImageTypes = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    private const long MaxLogoBytes = 2 * 1024 * 1024; // 2 MB

    public OrgService(ApplicationDbContext db, IWebHostEnvironment env, ILogger<OrgService> logger)
    {
        _db     = db;
        _env    = env;
        _logger = logger;
    }

    public async Task<OrgResponse> GetAsync(Guid orgId, CancellationToken ct = default)
    {
        var org = await _db.Organizations.FirstOrDefaultAsync(o => o.Id == orgId, ct)
            ?? throw new NotFoundException("Organization", orgId);
        return Map(org);
    }

    public async Task<OrgResponse> UpdateAsync(
        Guid orgId, UpdateOrgRequest request, CancellationToken ct = default)
    {
        var org = await _db.Organizations.FirstOrDefaultAsync(o => o.Id == orgId, ct)
            ?? throw new NotFoundException("Organization", orgId);

        if (request.Name is not null)
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                throw new ValidationException("Organization name cannot be blank.");
            org.Name = request.Name.Trim();
        }

        if (request.LogoUrl is not null)
            org.LogoUrl = string.IsNullOrWhiteSpace(request.LogoUrl) ? null : request.LogoUrl.Trim();

        if (request.MissionStatement is not null)
            org.MissionStatement = string.IsNullOrWhiteSpace(request.MissionStatement)
                ? null : request.MissionStatement.Trim();

        if (request.Is501c3 is not null)
            org.Is501c3 = request.Is501c3.Value;

        if (request.ThemeJson is not null)
        {
            if (string.IsNullOrWhiteSpace(request.ThemeJson))
            {
                org.ThemeJson = null;
            }
            else
            {
                ValidateTheme(request.ThemeJson);
                org.ThemeJson = request.ThemeJson;
            }
        }

        await _db.SaveChangesAsync(ct);
        _logger.LogInformation("Org {OrgId} updated", orgId);
        return Map(org);
    }

    /// <summary>
    /// Stores the uploaded logo file under wwwroot/uploads/logos/ and updates
    /// the org's LogoUrl. Returns the public-relative URL (/uploads/logos/…).
    /// </summary>
    public async Task<string> UploadLogoAsync(
        Guid orgId, IFormFile file, string requestBaseUrl, CancellationToken ct = default)
    {
        if (file.Length == 0)
            throw new ValidationException("Uploaded file is empty.");
        if (file.Length > MaxLogoBytes)
            throw new ValidationException("Logo must be 2 MB or smaller.");
        if (!AllowedImageTypes.Contains(file.ContentType.ToLowerInvariant()))
            throw new ValidationException("Logo must be PNG, JPEG, SVG, or WebP.");

        var org = await _db.Organizations.FirstOrDefaultAsync(o => o.Id == orgId, ct)
            ?? throw new NotFoundException("Organization", orgId);

        // Delete previous upload if it was a local upload (path starts with /uploads/)
        if (org.LogoUrl?.StartsWith("/uploads/") == true)
        {
            var oldPath = Path.Combine(_env.WebRootPath, org.LogoUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
            if (File.Exists(oldPath)) File.Delete(oldPath);
        }

        var ext      = Path.GetExtension(file.FileName).ToLowerInvariant();
        var filename = $"{orgId}{ext}";
        var dir      = Path.Combine(_env.WebRootPath, "uploads", "logos");
        Directory.CreateDirectory(dir);
        var fullPath = Path.Combine(dir, filename);

        await using var stream = new FileStream(fullPath, FileMode.Create, FileAccess.Write);
        await file.CopyToAsync(stream, ct);

        var relativeUrl = $"/uploads/logos/{filename}";
        org.LogoUrl = relativeUrl;
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Logo uploaded for org {OrgId}: {Url}", orgId, relativeUrl);
        return relativeUrl;
    }

    // ── WCAG VALIDATION ───────────────────────────────────────────────────────

    private static void ValidateTheme(string themeJson)
    {
        OrgThemeDto theme;
        try
        {
            theme = JsonSerializer.Deserialize<OrgThemeDto>(themeJson,
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

    private static OrgResponse Map(Domain.Entities.Organization org) => new()
    {
        Id               = org.Id,
        Name             = org.Name,
        Slug             = org.Slug,
        LogoUrl          = org.LogoUrl,
        MissionStatement = org.MissionStatement,
        Is501c3          = org.Is501c3,
        ThemeJson        = org.ThemeJson,
        CreatedAt        = org.CreatedAt,
    };

    // Internal DTO for deserializing theme JSON for validation only
    private sealed class OrgThemeDto
    {
        public string Primary   { get; init; } = string.Empty;
        public string Action    { get; init; } = string.Empty;
        public string Accent    { get; init; } = string.Empty;
        public string Highlight { get; init; } = string.Empty;
        public string Surface   { get; init; } = string.Empty;
    }
}
