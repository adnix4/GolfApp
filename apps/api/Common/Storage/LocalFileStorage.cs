namespace GolfFundraiserPro.Api.Common.Storage;

/// <summary>
/// Default storage: writes under wwwroot/uploads/{category}/ and returns
/// root-relative "/uploads/…" URLs. Files are served by the static-file
/// middleware in Program.cs, which applies the cache policy (immutable for
/// versioned names, no-cache for the "-fetched" brand suggestion) — so
/// immutableCache is encoded in the filename convention, not stored here.
/// Single-instance only: the disk isn't shared across API replicas.
/// </summary>
public sealed class LocalFileStorage : IFileStorage
{
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<LocalFileStorage> _logger;

    public LocalFileStorage(IWebHostEnvironment env, ILogger<LocalFileStorage> logger)
    {
        _env    = env;
        _logger = logger;
    }

    public async Task<string> SaveAsync(
        string category, string filename, Stream content, string contentType,
        bool immutableCache = true, CancellationToken ct = default)
    {
        var dir = Path.Combine(_env.WebRootPath, "uploads", category);
        Directory.CreateDirectory(dir);

        await using var file = new FileStream(
            Path.Combine(dir, filename), FileMode.Create, FileAccess.Write);
        await content.CopyToAsync(file, ct);

        return $"/uploads/{category}/{filename}";
    }

    public Task DeleteAsync(string? url, CancellationToken ct = default)
    {
        if (url?.StartsWith("/uploads/") != true) return Task.CompletedTask;

        var path = Path.Combine(
            _env.WebRootPath,
            url.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch (IOException ex)
        {
            // Best-effort: a locked/undeletable old file must not fail the
            // replacement upload; it just lingers on disk.
            _logger.LogWarning(ex, "Could not delete replaced upload {Path}", path);
        }
        return Task.CompletedTask;
    }
}
