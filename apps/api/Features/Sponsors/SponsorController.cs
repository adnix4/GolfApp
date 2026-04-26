using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using GolfFundraiserPro.Api.Common.Middleware;

namespace GolfFundraiserPro.Api.Features.Sponsors;

[ApiController]
[Tags("Sponsors & Fundraising")]
public class SponsorController : ControllerBase
{
    private readonly SponsorService _sponsorService;

    public SponsorController(SponsorService sponsorService)
    {
        _sponsorService = sponsorService;
    }

    // ── SPONSORS ──────────────────────────────────────────────────────────────

    [HttpPost("api/v1/events/{eventId:guid}/sponsors")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(SponsorResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<SponsorResponse>> CreateSponsor(
        [FromRoute] Guid eventId,
        [FromBody] CreateSponsorRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _sponsorService.CreateSponsorAsync(orgId, eventId, request, ct);
        return StatusCode(StatusCodes.Status201Created, response);
    }

    [HttpGet("api/v1/events/{eventId:guid}/sponsors")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(List<SponsorResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<SponsorResponse>>> GetAllSponsors(
        [FromRoute] Guid eventId,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _sponsorService.GetAllSponsorsAsync(orgId, eventId, ct);
        return Ok(response);
    }

    [HttpPatch("api/v1/events/{eventId:guid}/sponsors/{sponsorId:guid}")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(SponsorResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<SponsorResponse>> UpdateSponsor(
        [FromRoute] Guid eventId,
        [FromRoute] Guid sponsorId,
        [FromBody] UpdateSponsorRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _sponsorService.UpdateSponsorAsync(orgId, eventId, sponsorId, request, ct);
        return Ok(response);
    }

    [HttpDelete("api/v1/events/{eventId:guid}/sponsors/{sponsorId:guid}")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteSponsor(
        [FromRoute] Guid eventId,
        [FromRoute] Guid sponsorId,
        CancellationToken ct)
    {
        var orgId = GetOrgId();
        await _sponsorService.DeleteSponsorAsync(orgId, eventId, sponsorId, ct);
        return NoContent();
    }

    // ── HOLE CHALLENGES ───────────────────────────────────────────────────────

    [HttpPost("api/v1/events/{eventId:guid}/challenges")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(ChallengeResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ChallengeResponse>> CreateChallenge(
        [FromRoute] Guid eventId,
        [FromBody] CreateChallengeRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _sponsorService.CreateChallengeAsync(orgId, eventId, request, ct);
        return StatusCode(StatusCodes.Status201Created, response);
    }

    [HttpGet("api/v1/events/{eventId:guid}/challenges")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(List<ChallengeResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<ChallengeResponse>>> GetAllChallenges(
        [FromRoute] Guid eventId,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _sponsorService.GetAllChallengesAsync(orgId, eventId, ct);
        return Ok(response);
    }

    [HttpPatch("api/v1/events/{eventId:guid}/challenges/{challengeId:guid}")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(ChallengeResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ChallengeResponse>> UpdateChallenge(
        [FromRoute] Guid eventId,
        [FromRoute] Guid challengeId,
        [FromBody] UpdateChallengeRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _sponsorService.UpdateChallengeAsync(orgId, eventId, challengeId, request, ct);
        return Ok(response);
    }

    [HttpDelete("api/v1/events/{eventId:guid}/challenges/{challengeId:guid}")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteChallenge(
        [FromRoute] Guid eventId,
        [FromRoute] Guid challengeId,
        CancellationToken ct)
    {
        var orgId = GetOrgId();
        await _sponsorService.DeleteChallengeAsync(orgId, eventId, challengeId, ct);
        return NoContent();
    }

    // ── CHALLENGE RESULTS ─────────────────────────────────────────────────────

    [HttpPost("api/v1/events/{eventId:guid}/challenges/{challengeId:guid}/results")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(ChallengeResultResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ChallengeResultResponse>> RecordResult(
        [FromRoute] Guid eventId,
        [FromRoute] Guid challengeId,
        [FromBody] RecordChallengeResultRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _sponsorService.RecordResultAsync(orgId, eventId, challengeId, request, ct);
        return StatusCode(StatusCodes.Status201Created, response);
    }

    [HttpGet("api/v1/events/{eventId:guid}/challenges/{challengeId:guid}/results")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(List<ChallengeResultResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<ChallengeResultResponse>>> GetResults(
        [FromRoute] Guid eventId,
        [FromRoute] Guid challengeId,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _sponsorService.GetResultsAsync(orgId, eventId, challengeId, ct);
        return Ok(response);
    }

    // ── DONATIONS ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Records a donation manually (Phase 1 — no Stripe yet).
    /// Queues a donation receipt email if the event org has Is501c3 = true.
    /// </summary>
    [HttpPost("api/v1/events/{eventId:guid}/donations")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(DonationResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<DonationResponse>> RecordDonation(
        [FromRoute] Guid eventId,
        [FromBody] RecordDonationRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _sponsorService.RecordDonationAsync(orgId, eventId, request, ct);
        return StatusCode(StatusCodes.Status201Created, response);
    }

    [HttpGet("api/v1/events/{eventId:guid}/donations")]
    [Authorize(Policy = "EventStaff")]
    [ProducesResponseType(typeof(List<DonationResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<DonationResponse>>> GetAllDonations(
        [FromRoute] Guid eventId,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _sponsorService.GetAllDonationsAsync(orgId, eventId, ct);
        return Ok(response);
    }

    [HttpPatch("api/v1/events/{eventId:guid}/donations/{donationId:guid}")]
    [Authorize(Policy = "OrgAdmin")]
    [ProducesResponseType(typeof(DonationResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DonationResponse>> UpdateDonation(
        [FromRoute] Guid eventId,
        [FromRoute] Guid donationId,
        [FromBody] UpdateDonationRequest request,
        CancellationToken ct)
    {
        var orgId    = GetOrgId();
        var response = await _sponsorService.UpdateDonationAsync(orgId, eventId, donationId, request, ct);
        return Ok(response);
    }

    // ── PRIVATE ───────────────────────────────────────────────────────────────

    private Guid GetOrgId()
    {
        var claim = User.FindFirst("orgId")?.Value;
        if (string.IsNullOrWhiteSpace(claim) || !Guid.TryParse(claim, out var orgId))
            throw new ForbiddenException("Your account is not associated with an organization.");
        return orgId;
    }
}
