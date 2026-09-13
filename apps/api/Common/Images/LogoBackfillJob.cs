using GolfFundraiserPro.Api.Common.Storage;
using GolfFundraiserPro.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace GolfFundraiserPro.Api.Common.Images;

/// <summary>
/// Rewrites logo columns that still point at a format React Native cannot draw.
///
/// Normalisation at ingestion only covers logos saved from now on; rows written
/// before it existed keep whatever they had — an SVG on Cloudinary, a scraped
/// favicon. Those render as an empty frame on the scorer, which is the bug that
/// prompted all of this, so they need one pass.
///
/// Safe to run repeatedly: anything already served from our storage as .png is
/// skipped, and a row whose source cannot be fetched or converted is left
/// exactly as it was rather than blanked.
/// </summary>
public sealed class LogoBackfillJob
{
    private readonly ApplicationDbContext _db;
    private readonly RemoteLogoFetcher _fetcher;
    private readonly IFileStorage _storage;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<LogoBackfillJob> _logger;

    public LogoBackfillJob(
        ApplicationDbContext db, RemoteLogoFetcher fetcher, IFileStorage storage,
        IWebHostEnvironment env, ILogger<LogoBackfillJob> logger)
    {
        _db      = db;
        _fetcher = fetcher;
        _storage = storage;
        _env     = env;
        _logger  = logger;
    }

    public sealed record Result(int Examined, int Converted, int Skipped, int Failed);

    /// <summary>
    /// A URL needs work unless it is one of ours AND already a PNG. External
    /// URLs always get pulled in: the Scheels logo has no file extension at all,
    /// so the path tells us nothing about what will come back.
    /// </summary>
    private static bool NeedsWork(string? url) =>
        !string.IsNullOrWhiteSpace(url) &&
        !(url.Contains("/uploads/", StringComparison.Ordinal) &&
          url.EndsWith(ImageNormalizer.PngExtension, StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// Converts a file already stored under wwwroot/uploads, returning the new
    /// URL. Null when the URL is not local or the file is missing, so the caller
    /// can fall through to the HTTP fetcher (blob storage serves absolute URLs).
    /// </summary>
    private async Task<string?> TryConvertLocalAsync(
        string url, string category, string name, CancellationToken ct)
    {
        if (!url.StartsWith("/uploads/", StringComparison.Ordinal)) return null;

        var path = Path.Combine(
            _env.WebRootPath, url.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
        if (!File.Exists(path)) return null;

        try
        {
            await using var source = File.OpenRead(path);
            var contentType = Path.GetExtension(path).ToLowerInvariant() switch
            {
                ".svg"            => "image/svg+xml",
                ".ico"            => "image/x-icon",
                ".jpg" or ".jpeg" => "image/jpeg",
                ".webp"           => "image/webp",
                ".gif"            => "image/gif",
                _                 => "image/png",
            };
            using var png = await ImageNormalizer.ToPngAsync(source, contentType, ct);
            var stored = await _storage.SaveAsync(
                category, name + ImageNormalizer.PngExtension, png,
                ImageNormalizer.PngContentType, ct: ct);
            _logger.LogInformation("Converted local logo {Old} to {New}", url, stored);
            return stored;
        }
        catch (Exception ex)
        {
            _logger.LogInformation(ex, "Local logo conversion failed for {Url}", url);
            return null;
        }
    }

    public async Task<Result> RunAsync(CancellationToken ct = default)
    {
        int examined = 0, converted = 0, skipped = 0, failed = 0;

        async Task<string?> Convert(string? url, string category, string name)
        {
            if (!NeedsWork(url)) { skipped++; return null; }
            examined++;

            // A file already on our local disk cannot be re-fetched over HTTP —
            // PrivateNetworkGuard blocks loopback, correctly. Read it straight
            // off disk instead. This is how the brand-extracted ".ico" event
            // logo gets converted.
            var rehosted = await TryConvertLocalAsync(url!, category, name, ct)
                        ?? await _fetcher.TryRehostAsync(url, category, name, ct);

            if (rehosted is null) { failed++; return null; }
            converted++;
            return rehosted;
        }

        var sponsors = await _db.Sponsors
            .Where(s => s.LogoUrl != null && s.LogoUrl != "")
            .ToListAsync(ct);
        foreach (var s in sponsors)
        {
            var url = await Convert(s.LogoUrl, "sponsor-logos", $"{s.Id}-{DateTime.UtcNow.Ticks}");
            if (url is not null) s.LogoUrl = url;
        }

        var events = await _db.Events
            .Where(e => e.LogoUrl != null && e.LogoUrl != "")
            .ToListAsync(ct);
        foreach (var e in events)
        {
            var url = await Convert(e.LogoUrl, "event-logos", $"{e.Id}-{DateTime.UtcNow.Ticks}");
            if (url is not null) e.LogoUrl = url;
        }

        var orgs = await _db.Organizations
            .Where(o => o.LogoUrl != null && o.LogoUrl != "")
            .ToListAsync(ct);
        foreach (var o in orgs)
        {
            var url = await Convert(o.LogoUrl, "logos", $"{o.Id}-{DateTime.UtcNow.Ticks}");
            if (url is not null) o.LogoUrl = url;
        }

        await _db.SaveChangesAsync(ct);

        var result = new Result(examined, converted, skipped, failed);
        _logger.LogInformation(
            "Logo backfill complete: {Examined} examined, {Converted} converted, {Skipped} already PNG, {Failed} left as-is",
            result.Examined, result.Converted, result.Skipped, result.Failed);
        return result;
    }
}
