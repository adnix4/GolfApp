using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.Emails;

// ── REQUEST MODELS ─────────────────────────────────────────────────────────────

public record UpsertEmailTemplateRequest
{
    public EmailTriggerType TriggerType { get; init; }
    public string Subject { get; init; } = string.Empty;
    /// <summary>
    /// Full HTML body. Use {{PLACEHOLDER}} tokens for dynamic data.
    /// Standard tokens: {{FIRST_NAME}}, {{LAST_NAME}}, {{EVENT_NAME}},
    /// {{TEAM_NAME}}, {{CHECKIN_URL}}, {{INVITE_URL}}, {{ORG_NAME}}.
    /// </summary>
    public string HtmlBody { get; init; } = string.Empty;
    public bool IsActive { get; init; } = true;
}

public record SendTestEmailRequest
{
    /// <summary>Recipient email address for the test.</summary>
    public string ToEmail { get; init; } = string.Empty;
    public EmailTriggerType TriggerType { get; init; }
}

// ── RESPONSE MODELS ────────────────────────────────────────────────────────────

public record EmailTemplateResponse
{
    public Guid   Id          { get; init; }
    public Guid   OrgId       { get; init; }
    public string TriggerType { get; init; } = string.Empty;
    public string Subject     { get; init; } = string.Empty;
    public string HtmlBody    { get; init; } = string.Empty;
    public bool   IsActive    { get; init; }
}

public record SendTestEmailResponse
{
    public bool   Success { get; init; }
    public string Message { get; init; } = string.Empty;
}
