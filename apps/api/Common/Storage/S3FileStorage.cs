using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;

namespace GolfFundraiserPro.Api.Common.Storage;

/// <summary>
/// Blob storage on any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO).
/// Objects are keyed "uploads/{category}/{filename}" — the same shape as the
/// local layout — and returned as "{PublicBaseUrl}/uploads/…" absolute URLs.
/// Cache policy travels WITH the object (Cache-Control set at upload), since
/// the static-file middleware never sees these files. This is the required
/// provider for running 2+ API instances.
/// </summary>
public sealed class S3FileStorage : IFileStorage
{
    private readonly IAmazonS3 _s3;
    private readonly S3StorageOptions _opts;
    private readonly string _publicBase;
    private readonly ILogger<S3FileStorage> _logger;

    public S3FileStorage(IAmazonS3 s3, S3StorageOptions opts, ILogger<S3FileStorage> logger)
    {
        _s3         = s3;
        _opts       = opts;
        _publicBase = opts.PublicBaseUrl.TrimEnd('/');
        _logger     = logger;
    }

    public async Task<string> SaveAsync(
        string category, string filename, Stream content, string contentType,
        bool immutableCache = true, CancellationToken ct = default)
    {
        var key = ObjectKey(category, filename);
        var req = new PutObjectRequest
        {
            BucketName      = _opts.Bucket,
            Key             = key,
            InputStream     = content,
            ContentType     = contentType,
            AutoCloseStream = false, // caller owns the stream
        };
        // Same policy pairing as the static-file middleware applies locally.
        req.Headers.CacheControl = immutableCache
            ? "public, max-age=31536000, immutable"
            : "no-cache";

        await _s3.PutObjectAsync(req, ct);
        return $"{_publicBase}/{key}";
    }

    public async Task DeleteAsync(string? url, CancellationToken ct = default)
    {
        var key = TryGetObjectKey(url, _publicBase);
        if (key is null) return;

        try
        {
            await _s3.DeleteObjectAsync(_opts.Bucket, key, ct);
        }
        catch (AmazonS3Exception ex)
        {
            // Best-effort: a failed delete of the replaced file must not fail
            // the new upload; the object just lingers in the bucket.
            _logger.LogWarning(ex, "Could not delete replaced upload {Key}", key);
        }
    }

    internal static string ObjectKey(string category, string filename)
        => $"uploads/{category}/{filename}";

    /// <summary>
    /// Maps a stored URL back to its object key — null when the URL isn't ours
    /// (external logo URL, legacy local "/uploads/…" path, or null).
    /// </summary>
    internal static string? TryGetObjectKey(string? url, string publicBase)
        => url is not null
           && url.StartsWith($"{publicBase}/uploads/", StringComparison.OrdinalIgnoreCase)
            ? url[(publicBase.Length + 1)..]
            : null;

    /// <summary>Builds the S3 client from options — shared by DI registration.</summary>
    public static IAmazonS3 CreateClient(S3StorageOptions o)
    {
        var cfg = new AmazonS3Config { ForcePathStyle = o.ForcePathStyle };
        if (!string.IsNullOrWhiteSpace(o.ServiceUrl))
            cfg.ServiceURL = o.ServiceUrl;     // R2 / MinIO endpoint
        else
            cfg.RegionEndpoint = RegionEndpoint.GetBySystemName(o.Region);

        // SDK v4 defaults to sending CRC checksums on every PUT, which some
        // S3-compatible providers reject — only send when the API requires it.
        cfg.RequestChecksumCalculation  = RequestChecksumCalculation.WHEN_REQUIRED;
        cfg.ResponseChecksumValidation  = ResponseChecksumValidation.WHEN_REQUIRED;

        return string.IsNullOrWhiteSpace(o.AccessKey)
            ? new AmazonS3Client(cfg) // default AWS credential chain (IAM role / env)
            : new AmazonS3Client(new BasicAWSCredentials(o.AccessKey, o.SecretKey), cfg);
    }
}
