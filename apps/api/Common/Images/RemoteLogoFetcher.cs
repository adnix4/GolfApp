using GolfFundraiserPro.Api.Common.Storage;

namespace GolfFundraiserPro.Api.Common.Images;

/// <summary>
/// Pulls a logo the organizer pasted as a URL, converts it to PNG, and re-hosts
/// it on our own storage.
///
/// WHY: an uploaded logo goes through IFileStorage and can be normalised on the
/// way in, but a pasted URL used to be stored verbatim and rendered straight
/// from the third party. That is how the Scheels logo — an SVG served by
/// Cloudinary with no file extension — reached the scorer, where React Native's
/// Image cannot decode SVG and drew an empty frame. Re-hosting closes the last
/// ingestion path that could still put a non-PNG in front of a golfer.
///
/// Best-effort by design: a fetch or convert failure returns null and the caller
/// keeps the URL as typed. A working external PNG must never block saving a
/// sponsor, and an unreachable host is the organizer's problem to see on screen,
/// not a 500.
///
/// Reuses the SSRF-guarded "brand-extract" HttpClient (PrivateNetworkGuard
/// validates the resolved IP on every hop, bounded redirects and timeouts), so
/// this adds no new outbound attack surface.
/// </summary>
public sealed class RemoteLogoFetcher
{
    private const int MaxLogoBytes = 4 * 1024 * 1024;

    private readonly IHttpClientFactory _httpFactory;
    private readonly IFileStorage _storage;
    private readonly ILogger<RemoteLogoFetcher> _logger;

    public RemoteLogoFetcher(
        IHttpClientFactory httpFactory, IFileStorage storage, ILogger<RemoteLogoFetcher> logger)
    {
        _httpFactory = httpFactory;
        _storage     = storage;
        _logger      = logger;
    }

    /// <summary>
    /// True when the URL is something we should try to pull in: absolute http(s)
    /// and not already one of ours. Root-relative "/uploads/…" is local storage;
    /// an absolute URL to our own blob bucket was produced by SaveAsync and is
    /// already normalised, so it is left alone.
    /// </summary>
    public static bool IsExternal(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return false;
        var trimmed = url.Trim();
        if (trimmed.StartsWith("/uploads/", StringComparison.Ordinal)) return false;
        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri))     return false;
        if (uri.Scheme is not ("http" or "https"))                      return false;
        return !uri.AbsolutePath.Contains("/uploads/", StringComparison.Ordinal);
    }

    /// <summary>
    /// Fetches, converts and stores <paramref name="url"/>, returning the new
    /// URL — or null if anything went wrong, in which case the caller keeps the
    /// original. <paramref name="category"/> and <paramref name="filename"/>
    /// follow the same conventions as the upload paths; the extension is added
    /// here so callers cannot accidentally store a non-PNG name.
    /// </summary>
    public async Task<string?> TryRehostAsync(
        string? url, string category, string filenameWithoutExtension,
        CancellationToken ct = default)
    {
        if (!IsExternal(url)) return null;

        try
        {
            var client = _httpFactory.CreateClient("brand-extract");
            using var req = new HttpRequestMessage(HttpMethod.Get, url!.Trim());
            req.Headers.Accept.ParseAdd("image/*");

            using var resp = await client.SendAsync(
                req, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogInformation(
                    "Logo re-host skipped, {Status} from {Url}", (int)resp.StatusCode, url);
                return null;
            }

            // Content-Type is the only reliable signal here: the Scheels URL has
            // no file extension at all, so sniffing the path would have missed it.
            var contentType = resp.Content.Headers.ContentType?.MediaType?.ToLowerInvariant();
            if (!ImageNormalizer.IsSupported(contentType))
            {
                _logger.LogInformation(
                    "Logo re-host skipped, unsupported type {Type} at {Url}", contentType, url);
                return null;
            }

            await using var body = await resp.Content.ReadAsStreamAsync(ct);
            using var capped = new MemoryStream();
            var buffer = new byte[81920];
            int read;
            while ((read = await body.ReadAsync(buffer, ct)) > 0)
            {
                if (capped.Length + read > MaxLogoBytes)
                {
                    _logger.LogInformation("Logo re-host skipped, over {Max} bytes: {Url}", MaxLogoBytes, url);
                    return null;
                }
                await capped.WriteAsync(buffer.AsMemory(0, read), ct);
            }
            capped.Position = 0;
            if (capped.Length == 0) return null;

            using var png = await ImageNormalizer.ToPngAsync(capped, contentType, ct);
            var stored = await _storage.SaveAsync(
                category,
                filenameWithoutExtension + ImageNormalizer.PngExtension,
                png,
                ImageNormalizer.PngContentType,
                ct: ct);

            _logger.LogInformation("Re-hosted external logo {Url} as {Stored}", url, stored);
            return stored;
        }
        catch (Exception ex)
        {
            // Deliberately broad: this is an optional improvement to a save that
            // must succeed regardless. Anything from DNS failure to a malformed
            // image leaves the pasted URL in place.
            _logger.LogInformation(ex, "Logo re-host failed for {Url}", url);
            return null;
        }
    }
}
