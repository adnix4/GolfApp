using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;

namespace GolfFundraiserPro.Api.Features.EmailBuilder;

/// <summary>
/// Provides data for the email advertisement builder and handles
/// SendGrid delivery and HTML export.
/// </summary>
public class EmailBuilderService
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpClientFactory _httpFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<EmailBuilderService> _logger;

    public EmailBuilderService(
        ApplicationDbContext db,
        IHttpClientFactory httpFactory,
        IConfiguration config,
        ILogger<EmailBuilderService> logger)
    {
        _db          = db;
        _httpFactory = httpFactory;
        _config      = config;
        _logger      = logger;
    }

    // ── GET BUILDER DATA ──────────────────────────────────────────────────────

    public async Task<EmailBuilderDataResponse> GetBuilderDataAsync(
        Guid orgId, Guid eventId, CancellationToken ct)
    {
        var evt = await _db.Events
            .Include(e => e.Organization)
            .Include(e => e.Course)
            .Include(e => e.Sponsors)
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct)
            ?? throw new NotFoundException("Event", eventId);

        var org = evt.Organization;

        // Web app base for golfer-facing links; API base for images the email
        // must fetch from us (QR PNG, locally-stored "/uploads/…" logos). In
        // dev neither is set, so links point at the prod domain placeholder and
        // images at the local API. See .env.example.
        var webBase = (_config["APP_BASE_URL"]  ?? "https://golffundraiser.pro").TrimEnd('/');
        var apiBase = (_config["API_PUBLIC_URL"] ?? "http://localhost:5000").TrimEnd('/');

        var registrationUrl = $"{webBase}/e/{org.Slug}/{evt.EventCode}";

        // Unique per-event QR served by our own API (no third-party generator);
        // encodes the registration page, which also hands golfers to the app.
        var qrCodeUrl = $"{apiBase}/api/v1/pub/events/{evt.EventCode}/registration-qr.png";

        // Resolve branding: event value overrides org default
        var resolvedLogoUrl   = evt.LogoUrl          ?? org.LogoUrl;
        var resolvedThemeJson = evt.ThemeJson         ?? org.ThemeJson;
        var missionStatement  = evt.MissionStatement  ?? org.MissionStatement;
        var is501c3           = evt.Is501c3 || org.Is501c3;

        // Extract primary color from resolved ThemeJson if present
        var primaryColor = "#1a1a2e";
        if (!string.IsNullOrEmpty(resolvedThemeJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(resolvedThemeJson);
                if (doc.RootElement.TryGetProperty("primary", out var el))
                    primaryColor = el.GetString() ?? primaryColor;
            }
            catch { /* use default */ }
        }

        var location = evt.Course is not null
            ? $"{evt.Course.City}, {evt.Course.State}"
            : string.Empty;

        // Full street address for the flier: "17 Mile Dr, Pebble Beach, CA 93953"
        // (skips blank parts — Address and Zip are optional on the course).
        var courseAddress = evt.Course is not null
            ? string.Join(", ", new[]
              {
                  evt.Course.Address,
                  evt.Course.City,
                  $"{evt.Course.State} {evt.Course.Zip}".Trim(),
              }.Where(part => !string.IsNullOrWhiteSpace(part)))
            : string.Empty;

        // "Get Directions" link for the ad's location block (mirrors the look
        // of event-page platforms). Falls back to the course name when the
        // street address is missing.
        var directionsQuery = !string.IsNullOrEmpty(courseAddress)
            ? courseAddress
            : evt.Course is not null ? $"{evt.Course.Name}, {location}" : string.Empty;
        var directionsUrl = string.IsNullOrEmpty(directionsQuery)
            ? string.Empty
            : $"https://www.google.com/maps/search/?api=1&query={Uri.EscapeDataString(directionsQuery)}";

        // "7:30 AM · Shotgun start" for the WHEN block; empty when no StartAt.
        var startTypeLabel = evt.StartType == Domain.Enums.EventStartType.Shotgun
            ? "Shotgun start" : "Tee times";
        var eventTime = evt.StartAt is null
            ? string.Empty
            : $"{evt.StartAt.Value.ToString("h:mm tt", System.Globalization.CultureInfo.InvariantCulture)} · {startTypeLabel}";

        return new EmailBuilderDataResponse
        {
            EventName        = evt.Name,
            OrgName          = org.Name,
            OrgLogoUrl       = ToAbsoluteUrl(resolvedLogoUrl, apiBase),
            EventDate        = evt.StartAt?.ToString("MMMM d, yyyy",
                                  System.Globalization.CultureInfo.InvariantCulture)
                              ?? "Date TBD",
            EventTime        = eventTime,
            EventLocation    = location,
            CourseName       = evt.Course?.Name ?? string.Empty,
            CourseAddress    = courseAddress,
            DirectionsUrl    = directionsUrl,
            EntryFeeCents    = ExtractEntryFeeCents(evt.ConfigJson),
            RegistrationUrl  = registrationUrl,
            QrCodeUrl        = qrCodeUrl,
            PrimaryColor     = primaryColor,
            MissionStatement = missionStatement,
            Is501c3          = is501c3,
            Sponsors        = evt.Sponsors
                .Select(s => new EmailSponsorDto
                {
                    Name    = s.Name,
                    LogoUrl = ToAbsoluteUrl(s.LogoUrl, apiBase),
                    Tier    = s.Tier.ToString(),
                })
                .ToList(),
        };
    }

    /// <summary>
    /// Email HTML is rendered outside our site, so root-relative "/uploads/…"
    /// paths (Local file storage) must become absolute against the API host.
    /// Absolute URLs (blob storage, external logos) pass through untouched.
    /// </summary>
    private static string? ToAbsoluteUrl(string? url, string apiBase) =>
        !string.IsNullOrEmpty(url) && url.StartsWith('/') ? $"{apiBase}{url}" : url;

    private static int? ExtractEntryFeeCents(string? configJson)
    {
        if (string.IsNullOrWhiteSpace(configJson)) return null;
        try
        {
            using var doc = JsonDocument.Parse(configJson);
            return doc.RootElement.TryGetProperty("entryFeeCents", out var v)
                   && v.ValueKind == JsonValueKind.Number
                ? v.GetInt32()
                : null;
        }
        catch { return null; }
    }

    // ── SEND VIA SENDGRID ─────────────────────────────────────────────────────

    public async Task SendEmailAsync(
        Guid orgId, Guid eventId,
        SendEmailRequest request,
        CancellationToken ct)
    {
        var evt = await _db.Events
            .Include(e => e.Organization)
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct)
            ?? throw new NotFoundException("Event", eventId);

        var apiKey = _config["SENDGRID_API_KEY"];
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException(
                "SENDGRID_API_KEY is not configured. Add it to .env.local.");

        var payload = new
        {
            personalizations = new[]
            {
                new { to = new[] { new { email = request.ToAddress } } },
            },
            from    = new { email = "noreply@golffundraiser.pro", name = evt.Organization.Name },
            subject = request.Subject,
            content = new[]
            {
                new { type = "text/html", value = request.Html },
            },
        };

        using var http = _httpFactory.CreateClient();
        http.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");

        var response = await http.PostAsJsonAsync(
            "https://api.sendgrid.com/v3/mail/send", payload, ct);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            _logger.LogWarning("SendGrid {Status}: {Body}", response.StatusCode, body);
            throw new InvalidOperationException(
                $"SendGrid returned {(int)response.StatusCode}. Check SENDGRID_API_KEY.");
        }
    }

    // ── EXPORT HTML ───────────────────────────────────────────────────────────

    public async Task<bool> ValidateEventOwnershipAsync(Guid orgId, Guid eventId, CancellationToken ct) =>
        await _db.Events.AnyAsync(e => e.Id == eventId && e.OrgId == orgId, ct);
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

public sealed record EmailBuilderDataResponse
{
    public string  EventName        { get; init; } = string.Empty;
    public string  OrgName          { get; init; } = string.Empty;
    public string? OrgLogoUrl       { get; init; }
    public string  EventDate        { get; init; } = string.Empty;
    /// <summary>"7:30 AM · Shotgun start" for the WHEN block; empty when StartAt is unset.</summary>
    public string  EventTime        { get; init; } = string.Empty;
    public string  EventLocation    { get; init; } = string.Empty;
    /// <summary>Golf course name for the flier; empty when no course attached.</summary>
    public string  CourseName       { get; init; } = string.Empty;
    /// <summary>Full course street address ("17 Mile Dr, Pebble Beach, CA 93953"); empty when no course.</summary>
    public string  CourseAddress    { get; init; } = string.Empty;
    /// <summary>Google Maps "Get Directions" link for the location block; empty when no course.</summary>
    public string  DirectionsUrl    { get; init; } = string.Empty;
    /// <summary>Team entry fee from the event config; null when registration is free/unset.</summary>
    public int?    EntryFeeCents    { get; init; }
    public string  RegistrationUrl  { get; init; } = string.Empty;
    /// <summary>Self-hosted per-event QR PNG (encodes the registration page URL).</summary>
    public string  QrCodeUrl        { get; init; } = string.Empty;
    public string  PrimaryColor     { get; init; } = "#1a1a2e";
    public string? MissionStatement { get; init; }
    public bool    Is501c3          { get; init; }
    public List<EmailSponsorDto> Sponsors { get; init; } = [];
}

public sealed record EmailSponsorDto
{
    public string  Name    { get; init; } = string.Empty;
    public string? LogoUrl { get; init; }
    public string  Tier    { get; init; } = string.Empty;
}

public sealed record SendEmailRequest(string ToAddress, string Subject, string Html);
