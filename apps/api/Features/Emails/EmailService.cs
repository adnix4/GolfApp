using Microsoft.EntityFrameworkCore;
using SendGrid;
using SendGrid.Helpers.Mail;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.Emails;

public class EmailService
{
    private readonly ApplicationDbContext _db;
    private readonly IConfiguration _config;
    private readonly ILogger<EmailService> _logger;

    public EmailService(
        ApplicationDbContext db,
        IConfiguration config,
        ILogger<EmailService> logger)
    {
        _db     = db;
        _config = config;
        _logger = logger;
    }

    // ── TEMPLATE CRUD ──────────────────────────────────────────────────────────

    public async Task<EmailTemplateResponse> UpsertTemplateAsync(
        Guid orgId,
        UpsertEmailTemplateRequest request,
        CancellationToken ct = default)
    {
        var existing = await _db.EmailTemplates
            .FirstOrDefaultAsync(t => t.OrgId == orgId && t.TriggerType == request.TriggerType, ct);

        if (existing is not null)
        {
            existing.Subject  = request.Subject;
            existing.HtmlBody = request.HtmlBody;
            existing.IsActive = request.IsActive;

            await _db.SaveChangesAsync(ct);
            _logger.LogInformation(
                "Updated email template {TriggerType} for org {OrgId}", request.TriggerType, orgId);
            return MapToResponse(existing);
        }

        var template = new EmailTemplate
        {
            Id          = Guid.NewGuid(),
            OrgId       = orgId,
            TriggerType = request.TriggerType,
            Subject     = request.Subject,
            HtmlBody    = request.HtmlBody,
            IsActive    = request.IsActive,
        };

        _db.EmailTemplates.Add(template);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Created email template {TriggerType} for org {OrgId}", request.TriggerType, orgId);

        return MapToResponse(template);
    }

    public async Task<List<EmailTemplateResponse>> GetAllAsync(
        Guid orgId, CancellationToken ct = default)
    {
        var templates = await _db.EmailTemplates
            .Where(t => t.OrgId == orgId)
            .OrderBy(t => t.TriggerType)
            .ToListAsync(ct);

        return templates.Select(MapToResponse).ToList();
    }

    public async Task<EmailTemplateResponse> GetByTriggerAsync(
        Guid orgId, EmailTriggerType triggerType, CancellationToken ct = default)
    {
        var template = await _db.EmailTemplates
            .FirstOrDefaultAsync(t => t.OrgId == orgId && t.TriggerType == triggerType, ct);

        if (template is null)
            throw new NotFoundException($"EmailTemplate for trigger {triggerType}", orgId);

        return MapToResponse(template);
    }

    public async Task DeleteTemplateAsync(
        Guid orgId, EmailTriggerType triggerType, CancellationToken ct = default)
    {
        var template = await _db.EmailTemplates
            .FirstOrDefaultAsync(t => t.OrgId == orgId && t.TriggerType == triggerType, ct);

        if (template is null)
            throw new NotFoundException($"EmailTemplate for trigger {triggerType}", orgId);

        _db.EmailTemplates.Remove(template);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Deleted email template {TriggerType} for org {OrgId}", triggerType, orgId);
    }

    // ── SEND HELPERS (called by background jobs) ───────────────────────────────

    /// <summary>
    /// Sends an email via SendGrid using the org's stored HTML template for the given trigger.
    /// Substitutes {{TOKEN}} placeholders with values from dynamicData.
    /// Silently skips if the template is missing or inactive.
    /// </summary>
    public async Task SendAsync(
        Guid orgId,
        EmailTriggerType triggerType,
        string toEmail,
        string toName,
        Dictionary<string, string> dynamicData,
        CancellationToken ct = default)
    {
        var template = await _db.EmailTemplates
            .FirstOrDefaultAsync(t => t.OrgId == orgId && t.TriggerType == triggerType, ct);

        if (template is null || !template.IsActive)
        {
            _logger.LogDebug(
                "Skipping {TriggerType} email to {Email} — template missing or inactive",
                triggerType, toEmail);
            return;
        }

        var subject  = ApplyTokens(template.Subject, dynamicData);
        var htmlBody = ApplyTokens(template.HtmlBody, dynamicData);

        await SendRawAsync(toEmail, toName, subject, htmlBody, ct);
    }

    /// <summary>Sends a test email with sample placeholder values.</summary>
    public async Task<SendTestEmailResponse> SendTestAsync(
        Guid orgId,
        SendTestEmailRequest request,
        CancellationToken ct = default)
    {
        var template = await _db.EmailTemplates
            .FirstOrDefaultAsync(t => t.OrgId == orgId && t.TriggerType == request.TriggerType, ct);

        if (template is null)
            throw new NotFoundException($"EmailTemplate for trigger {request.TriggerType}", orgId);

        var sampleData = new Dictionary<string, string>
        {
            ["FIRST_NAME"]  = "Test",
            ["LAST_NAME"]   = "User",
            ["EVENT_NAME"]  = "Sample Golf Tournament",
            ["TEAM_NAME"]   = "Sample Team",
            ["ORG_NAME"]    = "Sample Organization",
            ["CHECKIN_URL"] = "https://golffundraiser.pro/checkin/sample",
            ["INVITE_URL"]  = "https://golffundraiser.pro/invite/sample",
        };

        try
        {
            var subject  = ApplyTokens(template.Subject, sampleData);
            var htmlBody = ApplyTokens(template.HtmlBody, sampleData);
            await SendRawAsync(request.ToEmail, "Test User", subject, htmlBody, ct);
            return new SendTestEmailResponse { Success = true, Message = $"Test email sent to {request.ToEmail}." };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Test email send failed for org {OrgId}, trigger {TriggerType}", orgId, request.TriggerType);
            return new SendTestEmailResponse { Success = false, Message = ex.Message };
        }
    }

    // ── PRIVATE ────────────────────────────────────────────────────────────────

    private async Task SendRawAsync(
        string toEmail, string toName,
        string subject, string htmlBody,
        CancellationToken ct)
    {
        var apiKey = _config["SENDGRID_API_KEY"]
            ?? throw new InvalidOperationException("SENDGRID_API_KEY not configured.");

        var fromEmail = _config["SENDGRID_FROM_EMAIL"] ?? "noreply@golffundraiser.pro";
        var fromName  = _config["SENDGRID_FROM_NAME"]  ?? "Golf Fundraiser Pro";

        var client  = new SendGridClient(apiKey);
        var from    = new EmailAddress(fromEmail, fromName);
        var to      = new EmailAddress(toEmail, toName);
        var message = MailHelper.CreateSingleEmail(from, to, subject, null, htmlBody);

        var response = await client.SendEmailAsync(message, ct);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Body.ReadAsStringAsync(ct);
            _logger.LogError(
                "SendGrid returned {Status} for email to {Email}: {Body}",
                (int)response.StatusCode, toEmail, body);
            throw new InvalidOperationException($"SendGrid error ({(int)response.StatusCode}): {body}");
        }

        _logger.LogInformation("Email '{Subject}' sent to {Email}", subject, toEmail);
    }

    private static string ApplyTokens(string template, Dictionary<string, string> data)
    {
        foreach (var (key, value) in data)
            template = template.Replace($"{{{{{key}}}}}", value, StringComparison.OrdinalIgnoreCase);
        return template;
    }

    private static EmailTemplateResponse MapToResponse(EmailTemplate t) => new()
    {
        Id          = t.Id,
        OrgId       = t.OrgId,
        TriggerType = t.TriggerType.ToString(),
        Subject     = t.Subject,
        HtmlBody    = t.HtmlBody,
        IsActive    = t.IsActive,
    };
}
