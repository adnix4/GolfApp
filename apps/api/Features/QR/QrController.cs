using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using GolfFundraiserPro.Api.Common.Middleware;

namespace GolfFundraiserPro.Api.Features.QR;

[ApiController]
[Tags("QR Codes")]
public class QrController : ControllerBase
{
    private readonly QrService _qrService;

    public QrController(QrService qrService)
    {
        _qrService = qrService;
    }

    [HttpPost("api/v1/events/{eventId:guid}/qr/generate")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(GenerateQrResultResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<GenerateQrResultResponse>> Generate(
        [FromRoute] Guid eventId,
        [FromBody] GenerateQrRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _qrService.GenerateAsync(orgId, eventId, request, ct);
        return StatusCode(StatusCodes.Status201Created, response);
    }

    [HttpGet("api/v1/events/{eventId:guid}/qr")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(List<QrCodeResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<List<QrCodeResponse>>> GetAll(
        [FromRoute] Guid eventId,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _qrService.GetAllAsync(orgId, eventId, ct);
        return Ok(response);
    }

    /// <summary>
    /// Public endpoint — serves the event's registration QR as a PNG image.
    /// Referenced by the email-ad builder: email clients need a plain https
    /// img URL, so the QR must be fetchable anonymously from this API rather
    /// than embedded as a data: URI (stripped by Gmail/Outlook) or generated
    /// by a third-party service.
    /// </summary>
    [HttpGet("api/v1/pub/events/{eventCode}/registration-qr.png")]
    [AllowAnonymous]
    [ResponseCache(Duration = 3600, Location = ResponseCacheLocation.Any)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> RegistrationQrPng(
        [FromRoute] string eventCode,
        CancellationToken ct)
    {
        var png = await _qrService.GetRegistrationQrPngAsync(eventCode, ct);
        return File(png, "image/png");
    }

    /// <summary>
    /// Public endpoint — no auth required.
    /// Called when a QR code is scanned by the mobile app or browser.
    /// </summary>
    [HttpGet("api/v1/pub/qr/scan")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(QrScanResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<QrScanResponse>> Scan(
        [FromQuery] string token,
        CancellationToken ct)
    {
        var response = await _qrService.ScanAsync(token, ct);
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
