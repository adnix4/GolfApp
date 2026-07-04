namespace GolfFundraiserPro.Api.Common.Storage;

/// <summary>
/// Binds the "Storage" configuration section (appsettings or environment
/// variables, e.g. Storage__Provider / Storage__S3__Bucket).
/// </summary>
public sealed class StorageOptions
{
    public const string SectionName = "Storage";

    /// <summary>"Local" (default — wwwroot/uploads) or "S3" (S3/R2/MinIO).</summary>
    public string Provider { get; set; } = "Local";

    public S3StorageOptions S3 { get; set; } = new();
}

public sealed class S3StorageOptions
{
    /// <summary>Bucket name. Required when Provider = S3.</summary>
    public string Bucket { get; set; } = "";

    /// <summary>
    /// Custom endpoint for S3-compatible providers, e.g.
    /// "https://{accountId}.r2.cloudflarestorage.com" (Cloudflare R2) or
    /// "http://localhost:9000" (MinIO). Leave empty for AWS S3 (Region is used).
    /// </summary>
    public string ServiceUrl { get; set; } = "";

    /// <summary>AWS region — only used when ServiceUrl is empty.</summary>
    public string Region { get; set; } = "us-east-1";

    /// <summary>
    /// Base URL clients fetch objects from — a CDN or public bucket domain,
    /// e.g. "https://cdn.example.com". Required when Provider = S3: the bucket
    /// must be publicly readable through this host (uploads are logos/photos
    /// rendered on public pages). Object URLs become {PublicBaseUrl}/uploads/….
    /// </summary>
    public string PublicBaseUrl { get; set; } = "";

    /// <summary>
    /// Access key pair. Leave both empty on AWS to use the default credential
    /// chain (IAM role / instance profile / AWS_* environment variables).
    /// </summary>
    public string AccessKey { get; set; } = "";
    public string SecretKey { get; set; } = "";

    /// <summary>Path-style addressing — required by MinIO, harmless for R2.</summary>
    public bool ForcePathStyle { get; set; }
}
