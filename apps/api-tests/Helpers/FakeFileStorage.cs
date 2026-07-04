using GolfFundraiserPro.Api.Common.Storage;

namespace WebAPI.Tests.Helpers;

/// <summary>
/// In-memory IFileStorage — records saves/deletes and returns local-shaped
/// "/uploads/{category}/{filename}" URLs without touching the filesystem.
/// </summary>
public sealed class FakeFileStorage : IFileStorage
{
    public List<string> SavedUrls   { get; } = [];
    public List<string> DeletedUrls { get; } = [];

    public Task<string> SaveAsync(
        string category, string filename, Stream content, string contentType,
        bool immutableCache = true, CancellationToken ct = default)
    {
        var url = $"/uploads/{category}/{filename}";
        SavedUrls.Add(url);
        return Task.FromResult(url);
    }

    public Task DeleteAsync(string? url, CancellationToken ct = default)
    {
        if (url is not null) DeletedUrls.Add(url);
        return Task.CompletedTask;
    }
}
