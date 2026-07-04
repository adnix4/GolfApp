using Xunit;
using Microsoft.Extensions.Logging.Abstractions;
using GolfFundraiserPro.Api.Common.Storage;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Services;

/// <summary>
/// Tests for the upload-storage backends: LocalFileStorage round-trips against
/// a temp wwwroot, and S3FileStorage's URL↔key mapping (the pure part — actual
/// bucket IO isn't exercised here).
/// </summary>
public class FileStorageTests
{
    // ── LocalFileStorage ────────────────────────────────────────────────────────

    private static (LocalFileStorage storage, string webRoot) BuildLocal()
    {
        var webRoot = Path.Combine(Path.GetTempPath(), "gfp-storage-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(webRoot);
        var env = new NullWebHostEnvironment { WebRootPath = webRoot };
        return (new LocalFileStorage(env, NullLogger<LocalFileStorage>.Instance), webRoot);
    }

    [Fact]
    public async Task Local_save_writes_file_and_returns_relative_url()
    {
        var (storage, webRoot) = BuildLocal();
        using var content = new MemoryStream([1, 2, 3]);

        var url = await storage.SaveAsync("logos", "org-1.png", content, "image/png");

        Assert.Equal("/uploads/logos/org-1.png", url);
        var path = Path.Combine(webRoot, "uploads", "logos", "org-1.png");
        Assert.True(File.Exists(path));
        Assert.Equal(3, new FileInfo(path).Length);
    }

    [Fact]
    public async Task Local_delete_removes_a_previously_saved_upload()
    {
        var (storage, webRoot) = BuildLocal();
        using var content = new MemoryStream([1]);
        var url = await storage.SaveAsync("logos", "org-2.png", content, "image/png");

        await storage.DeleteAsync(url);

        Assert.False(File.Exists(Path.Combine(webRoot, "uploads", "logos", "org-2.png")));
    }

    [Fact]
    public async Task Local_delete_ignores_null_external_and_missing_urls()
    {
        var (storage, _) = BuildLocal();
        await storage.DeleteAsync(null);
        await storage.DeleteAsync("https://example.com/logo.png");
        await storage.DeleteAsync("/uploads/logos/never-existed.png"); // no throw
    }

    // ── S3FileStorage URL ↔ key mapping ─────────────────────────────────────────

    [Fact]
    public void S3_object_key_matches_local_layout()
        => Assert.Equal("uploads/sponsor-logos/s-1.png",
                        S3FileStorage.ObjectKey("sponsor-logos", "s-1.png"));

    [Theory]
    [InlineData("https://cdn.example.com/uploads/logos/a.png", "uploads/logos/a.png")]
    [InlineData("https://CDN.example.com/uploads/logos/a.png", "uploads/logos/a.png")] // host case-insensitive
    public void S3_maps_own_urls_back_to_keys(string url, string expectedKey)
        => Assert.Equal(expectedKey, S3FileStorage.TryGetObjectKey(url, "https://cdn.example.com"));

    [Theory]
    [InlineData(null)]                                        // nothing stored yet
    [InlineData("https://other.example.com/uploads/x.png")]   // foreign host
    [InlineData("/uploads/logos/legacy-local.png")]           // legacy local upload
    [InlineData("https://cdn.example.com/other/x.png")]       // ours but not an upload
    public void S3_rejects_urls_it_does_not_own(string? url)
        => Assert.Null(S3FileStorage.TryGetObjectKey(url, "https://cdn.example.com"));
}
