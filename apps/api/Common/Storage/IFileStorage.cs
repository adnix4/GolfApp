namespace GolfFundraiserPro.Api.Common.Storage;

/// <summary>
/// Abstraction over uploaded-file persistence (org/event/sponsor logos, auction
/// photos, brand-extraction suggestions). Two implementations:
///   • LocalFileStorage — wwwroot/uploads on the API host's disk. Fine for a
///     single instance; files are served by the static-file middleware.
///   • S3FileStorage — any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO).
///     Required for running 2+ API instances, since local disk isn't shared.
/// URLs returned by SaveAsync are stored verbatim on entities (LogoUrl,
/// PhotoUrlsJson) and rendered by clients as-is, so they must be directly
/// fetchable: root-relative "/uploads/…" for local (clients prepend the API
/// base), absolute "https://…/uploads/…" for blob storage.
/// </summary>
public interface IFileStorage
{
    /// <summary>
    /// Persists <paramref name="content"/> under uploads/{category}/{filename}
    /// and returns the public URL to store on the entity.
    /// When <paramref name="immutableCache"/> is true the URL is served with an
    /// immutable cache policy, so the filename MUST be unique per upload
    /// (versioned, e.g. "{id}-{ticks}.png"). Pass false only for files that
    /// deliberately overwrite themselves under a stable name (the
    /// brand-extraction "-fetched" suggestion).
    /// </summary>
    Task<string> SaveAsync(
        string category,
        string filename,
        Stream content,
        string contentType,
        bool immutableCache = true,
        CancellationToken ct = default);

    /// <summary>
    /// Best-effort delete of a file behind a URL previously returned by
    /// SaveAsync. No-ops on null, external (not ours), or already-deleted URLs,
    /// so callers can pass an entity's current LogoUrl unconditionally before
    /// replacing it. Never throws for a missing file.
    /// </summary>
    Task DeleteAsync(string? url, CancellationToken ct = default);
}
