// ─────────────────────────────────────────────────────────────────────────────
// Features/Events/Branding/BrandExtractionService.cs
// ─────────────────────────────────────────────────────────────────────────────
//
// Orchestrates brand extraction: SSRF-safe fetch → parse HTML into BrandSignals
// → synthesize palette (IBrandPaletteSynthesizer) → download + store the best
// logo. Returns a suggestion; it does NOT persist branding (the organizer saves
// via PATCH /branding after reviewing). Org-scoped + uses the SSRF-guarded
// "brand-extract" HttpClient.
// ─────────────────────────────────────────────────────────────────────────────

using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;

namespace GolfFundraiserPro.Api.Features.Events.Branding;

public sealed class BrandExtractionService
{
    private const int MaxHtmlBytes = 2 * 1024 * 1024;
    private const int MaxLogoBytes = 2 * 1024 * 1024;

    private static readonly string[] AllowedLogoTypes =
    {
        "image/png", "image/jpeg", "image/svg+xml", "image/webp",
        "image/gif", "image/x-icon", "image/vnd.microsoft.icon",
    };

    private readonly ApplicationDbContext _db;
    private readonly IHttpClientFactory _httpFactory;
    private readonly IBrandPaletteSynthesizer _synthesizer;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<BrandExtractionService> _logger;

    public BrandExtractionService(
        ApplicationDbContext db,
        IHttpClientFactory httpFactory,
        IBrandPaletteSynthesizer synthesizer,
        IWebHostEnvironment env,
        ILogger<BrandExtractionService> logger)
    {
        _db = db;
        _httpFactory = httpFactory;
        _synthesizer = synthesizer;
        _env = env;
        _logger = logger;
    }

    public async Task<BrandExtractionResponse> ExtractAsync(
        Guid orgId, Guid eventId, string websiteUrl, CancellationToken ct = default)
    {
        var pageUrl = NormalizeUrl(websiteUrl);

        // Org-scope: confirm the event belongs to the caller's org (NotFound otherwise).
        var exists = await _db.Events.AnyAsync(e => e.Id == eventId && e.OrgId == orgId, ct);
        if (!exists) throw new NotFoundException("Event", eventId);

        var client = _httpFactory.CreateClient("brand-extract");

        string html;
        Uri finalUrl;
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, pageUrl);
            req.Headers.Accept.ParseAdd("text/html,application/xhtml+xml");
            using var resp = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
            resp.EnsureSuccessStatusCode();
            finalUrl = resp.RequestMessage?.RequestUri ?? pageUrl;
            html = await ReadCappedStringAsync(resp, MaxHtmlBytes, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or IOException)
        {
            _logger.LogInformation(ex, "Brand extraction fetch failed for {Url}", pageUrl);
            throw new ValidationException("Couldn't reach that website. Check the address and try again.");
        }

        var signals = ParseSignals(html, finalUrl);
        var theme   = _synthesizer.Synthesize(signals);
        var logoUrl = await TryStoreLogoAsync(client, signals, eventId, ct);

        return new BrandExtractionResponse(theme, logoUrl, finalUrl.ToString());
    }

    // ── URL validation ────────────────────────────────────────────────────────

    private static Uri NormalizeUrl(string input)
    {
        var s = (input ?? string.Empty).Trim();
        if (s.Length == 0) throw new ValidationException("Enter a website address.");
        if (!s.Contains("://")) s = "https://" + s;
        if (!Uri.TryCreate(s, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            || string.IsNullOrEmpty(uri.Host))
            throw new ValidationException("That doesn't look like a valid website address.");
        return uri;
    }

    // ── HTML parsing ────────────────────────────────────────────────────────────

    private static readonly Regex TagRegex =
        new(@"<(meta|link|img)\b[^>]*>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex AttrRegex =
        new(@"([a-zA-Z][\w:-]*)\s*=\s*(?:""([^""]*)""|'([^']*)')", RegexOptions.Compiled);
    private static readonly Regex HexRegex =
        new(@"#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b", RegexOptions.Compiled);
    private static readonly Regex RgbRegex =
        new(@"rgba?\([^)]*\)", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static BrandSignals ParseSignals(string html, Uri baseUri)
    {
        string? themeColor = null;
        var logoOg = new List<Uri>();
        var logoApple = new List<Uri>();
        var logoIcon = new List<Uri>();
        var logoImg = new List<Uri>();

        foreach (Match tag in TagRegex.Matches(html))
        {
            var attrs = ParseAttrs(tag.Value);
            switch (tag.Groups[1].Value.ToLowerInvariant())
            {
                case "meta":
                {
                    var key = (Get(attrs, "name") ?? Get(attrs, "property") ?? "").ToLowerInvariant();
                    var content = Get(attrs, "content");
                    if (key == "theme-color" && themeColor is null && !string.IsNullOrWhiteSpace(content))
                        themeColor = content;
                    if ((key == "og:image" || key == "twitter:image") && content is not null
                        && TryAbs(baseUri, content, out var u))
                        logoOg.Add(u);
                    break;
                }
                case "link":
                {
                    var rel = (Get(attrs, "rel") ?? "").ToLowerInvariant();
                    var href = Get(attrs, "href");
                    if (href is null || !TryAbs(baseUri, href, out var u)) break;
                    if (rel.Contains("apple-touch-icon")) logoApple.Add(u);
                    else if (rel.Contains("icon")) logoIcon.Add(u);
                    break;
                }
                case "img":
                {
                    var src = Get(attrs, "src");
                    var hay = ((Get(attrs, "alt") ?? "") + " " + (Get(attrs, "class") ?? "") + " " + (src ?? ""))
                        .ToLowerInvariant();
                    if (src is not null && hay.Contains("logo") && TryAbs(baseUri, src, out var u))
                        logoImg.Add(u);
                    break;
                }
            }
        }

        // Colours by frequency (normalized hex).
        var freq = new Dictionary<string, int>();
        void Tally(string raw)
        {
            if (BrandColorMath.TryParse(raw) is { } v)
            {
                var h = v.ToHex();
                freq[h] = freq.TryGetValue(h, out var n) ? n + 1 : 1;
            }
        }
        foreach (Match m in HexRegex.Matches(html)) Tally(m.Value);
        foreach (Match m in RgbRegex.Matches(html)) Tally(m.Value);

        var colors = freq.OrderByDescending(kv => kv.Value).Select(kv => kv.Key).ToList();
        var logos = logoOg.Concat(logoApple).Concat(logoIcon).Concat(logoImg).Distinct().Take(6).ToList();

        return new BrandSignals
        {
            SourceUrl = baseUri,
            ThemeColor = themeColor,
            Colors = colors,
            LogoCandidates = logos,
        };
    }

    private static Dictionary<string, string> ParseAttrs(string tag)
    {
        var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match m in AttrRegex.Matches(tag))
        {
            var val = m.Groups[2].Success ? m.Groups[2].Value : m.Groups[3].Value;
            d.TryAdd(m.Groups[1].Value, val);
        }
        return d;
    }

    private static string? Get(Dictionary<string, string> d, string k) => d.TryGetValue(k, out var v) ? v : null;

    private static bool TryAbs(Uri baseUri, string href, out Uri abs)
    {
        if (Uri.TryCreate(baseUri, href.Trim(), out var u)
            && (u.Scheme == Uri.UriSchemeHttp || u.Scheme == Uri.UriSchemeHttps))
        {
            abs = u;
            return true;
        }
        abs = baseUri;
        return false;
    }

    // ── Logo download + store (best-effort) ─────────────────────────────────────

    private async Task<string?> TryStoreLogoAsync(
        HttpClient client, BrandSignals signals, Guid eventId, CancellationToken ct)
    {
        foreach (var candidate in signals.LogoCandidates)
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Get, candidate);
                req.Headers.Accept.ParseAdd("image/*");
                using var resp = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
                if (!resp.IsSuccessStatusCode) continue;

                var contentType = resp.Content.Headers.ContentType?.MediaType?.ToLowerInvariant();
                if (contentType is null || !AllowedLogoTypes.Contains(contentType)) continue;
                var ext = ExtFor(contentType);
                if (ext is null) continue;

                var bytes = await ReadCappedBytesAsync(resp, MaxLogoBytes, ct);
                if (bytes.Length == 0) continue;

                // Distinct "-fetched" name so we never clobber an existing saved
                // logo before the organizer actually saves the suggestion.
                var dir = Path.Combine(_env.WebRootPath, "uploads", "event-logos");
                Directory.CreateDirectory(dir);
                var filename = $"{eventId}-fetched{ext}";
                await File.WriteAllBytesAsync(Path.Combine(dir, filename), bytes, ct);
                return $"/uploads/event-logos/{filename}";
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or IOException)
            {
                _logger.LogInformation(ex, "Logo candidate fetch failed: {Url}", candidate);
            }
        }
        return null;
    }

    private static string? ExtFor(string contentType) => contentType switch
    {
        "image/png" => ".png",
        "image/jpeg" => ".jpg",
        "image/svg+xml" => ".svg",
        "image/webp" => ".webp",
        "image/gif" => ".gif",
        "image/x-icon" or "image/vnd.microsoft.icon" => ".ico",
        _ => null,
    };

    // ── Size-capped readers ─────────────────────────────────────────────────────

    private static async Task<string> ReadCappedStringAsync(HttpResponseMessage resp, int maxBytes, CancellationToken ct)
    {
        await using var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var ms = new MemoryStream();
        var buffer = new byte[8192];
        int read;
        while ((read = await stream.ReadAsync(buffer, ct)) > 0)
        {
            if (ms.Length + read > maxBytes)
            {
                ms.Write(buffer, 0, maxBytes - (int)ms.Length);
                break;
            }
            ms.Write(buffer, 0, read);
        }
        return Encoding.UTF8.GetString(ms.GetBuffer(), 0, (int)ms.Length);
    }

    private static async Task<byte[]> ReadCappedBytesAsync(HttpResponseMessage resp, int maxBytes, CancellationToken ct)
    {
        await using var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var ms = new MemoryStream();
        var buffer = new byte[8192];
        int read;
        while ((read = await stream.ReadAsync(buffer, ct)) > 0)
        {
            if (ms.Length + read > maxBytes) return Array.Empty<byte>(); // oversize → reject
            ms.Write(buffer, 0, read);
        }
        return ms.ToArray();
    }
}
