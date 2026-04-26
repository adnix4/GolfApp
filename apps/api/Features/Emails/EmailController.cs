using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.Emails;

[ApiController]
[Tags("Email Templates")]
[Authorize(Policy = "OrgAdmin")]
public class EmailController : ControllerBase
{
    private readonly EmailService _emailService;

    public EmailController(EmailService emailService)
    {
        _emailService = emailService;
    }

    [HttpPut("api/v1/email-templates/{triggerType}")]
    [ProducesResponseType(typeof(EmailTemplateResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<EmailTemplateResponse>> Upsert(
        [FromRoute] EmailTriggerType triggerType,
        [FromBody] UpsertEmailTemplateRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _emailService.UpsertTemplateAsync(orgId, request with { TriggerType = triggerType }, ct);
        return Ok(response);
    }

    [HttpGet("api/v1/email-templates")]
    [ProducesResponseType(typeof(List<EmailTemplateResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<EmailTemplateResponse>>> GetAll(CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _emailService.GetAllAsync(orgId, ct);
        return Ok(response);
    }

    [HttpGet("api/v1/email-templates/{triggerType}")]
    [ProducesResponseType(typeof(EmailTemplateResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<EmailTemplateResponse>> GetByTrigger(
        [FromRoute] EmailTriggerType triggerType,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _emailService.GetByTriggerAsync(orgId, triggerType, ct);
        return Ok(response);
    }

    [HttpDelete("api/v1/email-templates/{triggerType}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(
        [FromRoute] EmailTriggerType triggerType,
        CancellationToken ct)
    {
        var orgId = GetOrgId();
        await _emailService.DeleteTemplateAsync(orgId, triggerType, ct);
        return NoContent();
    }

    [HttpPost("api/v1/email-templates/test")]
    [ProducesResponseType(typeof(SendTestEmailResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<SendTestEmailResponse>> SendTest(
        [FromBody] SendTestEmailRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _emailService.SendTestAsync(orgId, request, ct);
        return Ok(response);
    }

    private Guid GetOrgId()
    {
        var claim = User.FindFirst("orgId")?.Value;
        if (string.IsNullOrWhiteSpace(claim) || !Guid.TryParse(claim, out var orgId))
            throw new ForbiddenException("Your account is not associated with an organization.");
        return orgId;
    }
}
