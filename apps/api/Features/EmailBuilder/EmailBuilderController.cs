using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using GolfFundraiserPro.Api.Common.Middleware;

namespace GolfFundraiserPro.Api.Features.EmailBuilder;

[ApiController]
[Route("api/v1/events/{eventId:guid}/email-builder")]
[Authorize(Policy = "EventStaff")]
public class EmailBuilderController : ControllerBase
{
    private readonly EmailBuilderService _svc;

    public EmailBuilderController(EmailBuilderService svc) => _svc = svc;

    private Guid OrgId => Guid.TryParse(User.FindFirstValue("orgId"), out var id)
        ? id
        : throw new ForbiddenException();

    /// <summary>GET /events/{id}/email-builder/data — Pre-populated builder payload.</summary>
    [HttpGet("data")]
    public async Task<IActionResult> GetData(Guid eventId, CancellationToken ct) =>
        Ok(await _svc.GetBuilderDataAsync(OrgId, eventId, ct));

    /// <summary>POST /events/{id}/email-builder/send — Send via SendGrid.</summary>
    [HttpPost("send")]
    public async Task<IActionResult> Send(
        Guid eventId,
        [FromBody] SendEmailRequest request,
        CancellationToken ct)
    {
        await _svc.SendEmailAsync(OrgId, eventId, request, ct);
        return Ok(new { sent = true });
    }

    /// <summary>POST /events/{id}/email-builder/export — Download HTML file.</summary>
    [HttpPost("export")]
    public async Task<IActionResult> Export(
        Guid eventId,
        [FromBody] ExportEmailRequest request,
        CancellationToken ct)
    {
        var valid = await _svc.ValidateEventOwnershipAsync(OrgId, eventId, ct);
        if (!valid) return NotFound(new { error = "Event not found." });

        var bytes = Encoding.UTF8.GetBytes(request.Html);
        return File(bytes, "text/html", $"gfp-email-{eventId:N}.html");
    }
}

public sealed record ExportEmailRequest(string Html);
