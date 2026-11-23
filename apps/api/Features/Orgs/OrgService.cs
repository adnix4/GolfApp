using GolfFundraiserPro.Api.Common.Images;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Common.Storage;
using GolfFundraiserPro.Api.Data;

namespace GolfFundraiserPro.Api.Features.Orgs;

public class OrgService
{
    private readonly ApplicationDbContext _db;
    private readonly IFileStorage         _storage;
    private readonly ILogger<OrgService>  _logger;

    private const long MaxLogoBytes = 2 * 1024 * 1024; // 2 MB

    // Optional so existing test constructions compile; without it an org theme
    // change reaches devices on their fallback poll instead of at once.
    private readonly RealTime.IRealTimeService? _realTime;

    public OrgService(ApplicationDbContext db, IFileStorage storage, ILogger<OrgService> logger,
        RealTime.IRealTimeService? realTime = null)
    {
        _db       = db;
        _storage  = storage;
        _logger   = logger;
        _realTime = realTime;
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

        var themeBefore = org.ThemeJson;
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
        if (org.ThemeJson != themeBefore) await BroadcastOrgThemeAsync(orgId, ct);
        return Map(org);
    }

    /// <summary>
    /// The org theme is every event's fallback brand, so a change repaints each
    /// live event that has no theme of its own. Completed and Cancelled events
    /// are skipped: nobody is looking at them, and a device catches up on its
    /// fallback poll anyway (problemList PF1).
    /// </summary>
    private async Task BroadcastOrgThemeAsync(Guid orgId, CancellationToken ct)
    {
        if (_realTime is null) return;
        // Read back: the column is jsonb, so Postgres re-serialises it. The push
        // must match the status endpoint's text byte for byte (see EventService).
        var themeJson = await _db.Organizations.AsNoTracking()
            .Where(o => o.Id == orgId).Select(o => o.ThemeJson).FirstOrDefaultAsync(ct);
        var events = await _db.Events.AsNoTracking()
            .Where(e => e.OrgId == orgId && e.ThemeJson == null
                && e.Status != Domain.Enums.EventStatus.Completed
                && e.Status != Domain.Enums.EventStatus.Cancelled)
            .Select(e => new { e.EventCode, e.Status })
            .ToListAsync(ct);
        foreach (var e in events)
            await _realTime.SendEventStatusChangedAsync(e.EventCode, e.Status.ToString(), themeJson, ct);
    }

    /// <summary>
    /// Stores the uploaded logo via IFileStorage and updates the org's LogoUrl.
    /// Returns the stored URL (/uploads/logos/… locally, absolute on blob storage).
    /// </summary>
    public async Task<string> UploadLogoAsync(
        Guid orgId, IFormFile file, CancellationToken ct = default)
    {
        if (file.Length == 0)
            throw new ValidationException("Uploaded file is empty.");
        if (file.Length > MaxLogoBytes)
            throw new ValidationException("Logo must be 2 MB or smaller.");
        if (!ImageNormalizer.IsSupported(file.ContentType))
            throw new ValidationException("Logo must be PNG, JPEG, WebP, GIF, SVG, or ICO. PNG is recommended.");

        var org = await _db.Organizations.FirstOrDefaultAsync(o => o.Id == orgId, ct)
            ?? throw new NotFoundException("Organization", orgId);

        // Every stored logo is normalised to PNG: React Native's Image cannot
        // decode SVG or ICO, so those render as an empty frame on the scorer
        // while looking fine on web and admin. See Common/Images/ImageNormalizer.
        await using var source = file.OpenReadStream();
        await using var png    = await ImageNormalizer.ToPngAsync(source, file.ContentType, ct);
        // Versioned filename: each upload gets a unique URL so it can be served
        // with immutable cache headers. The replaced file is deleted below, so
        // replacements don't accumulate.
        var filename = $"{orgId}-{DateTime.UtcNow.Ticks}{ImageNormalizer.PngExtension}";
        var url = await _storage.SaveAsync(
            "logos", filename, png, ImageNormalizer.PngContentType, ct: ct);

        var previousUrl = org.LogoUrl;
        org.LogoUrl = url;
        await _db.SaveChangesAsync(ct);
        // Delete the replaced upload only after the new one is saved and
        // referenced — a failed save must not orphan the current logo.
        await _storage.DeleteAsync(previousUrl, ct);

        _logger.LogInformation("Logo uploaded for org {OrgId}: {Url}", orgId, url);
        return url;
    }

    // ── WCAG VALIDATION ───────────────────────────────────────────────────────
    // Shared with the per-event branding save — see Common/ThemeValidation.cs.

    private static void ValidateTheme(string themeJson) => ThemeValidation.Validate(themeJson);

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
}
