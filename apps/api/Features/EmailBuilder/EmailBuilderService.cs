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

        var org             = evt.Organization;
        var registrationUrl = $"https://golffundraiser.pro/e/{org.Slug}/{evt.EventCode}";
        var qrCodeUrl       = $"https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={Uri.EscapeDataString(registrationUrl)}";

        // Extract primary color from org ThemeJson if present
        var primaryColor = "#1a1a2e";
        if (!string.IsNullOrEmpty(org.ThemeJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(org.ThemeJson);
                if (doc.RootElement.TryGetProperty("primary", out var el))
                    primaryColor = el.GetString() ?? primaryColor;
            }
            catch { /* use default */ }
        }

        var location = evt.Course is not null
            ? $"{evt.Course.City}, {evt.Course.State}"
            : string.Empty;

        return new EmailBuilderDataResponse
        {
            EventName       = evt.Name,
            OrgName         = org.Name,
            OrgLogoUrl      = org.LogoUrl,
            EventDate       = evt.StartAt?.ToString("MMMM d, yyyy",
                                 System.Globalization.CultureInfo.InvariantCulture)
                             ?? "Date TBD",
            EventLocation   = location,
            RegistrationUrl = registrationUrl,
            QrCodeUrl       = qrCodeUrl,
            PrimaryColor    = primaryColor,
            MissionStatement = org.MissionStatement,
            Sponsors        = evt.Sponsors
                .Select(s => new EmailSponsorDto
                {
                    Name    = s.Name,
                    LogoUrl = s.LogoUrl,
                    Tier    = s.Tier.ToString(),
                })
                .ToList(),
        };
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
    public string  EventLocation    { get; init; } = string.Empty;
    public string  RegistrationUrl  { get; init; } = string.Empty;
    public string  QrCodeUrl        { get; init; } = string.Empty;
    public string  PrimaryColor     { get; init; } = "#1a1a2e";
    public string? MissionStatement { get; init; }
    public List<EmailSponsorDto> Sponsors { get; init; } = [];
}

public sealed record EmailSponsorDto
{
    public string  Name    { get; init; } = string.Empty;
    public string? LogoUrl { get; init; }
    public string  Tier    { get; init; } = string.Empty;
}

public sealed record SendEmailRequest(string ToAddress, string Subject, string Html);
