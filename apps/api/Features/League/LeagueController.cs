using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using GolfFundraiserPro.Api.Features.Auth;

namespace GolfFundraiserPro.Api.Features.League;

[ApiController]
[Authorize(Policy = "OrgAdmin")]
[Route("api/v1/leagues")]
public class LeagueController : ControllerBase
{
    private readonly LeagueService _svc;

    public LeagueController(LeagueService svc) => _svc = svc;

    private Guid OrgId => Guid.Parse(User.FindFirst("org_id")?.Value
        ?? throw new UnauthorizedAccessException("org_id claim missing."));

    // ── LEAGUES ───────────────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> GetLeagues(CancellationToken ct) =>
        Ok(await _svc.GetLeaguesAsync(OrgId, ct));

    [HttpPost]
    public async Task<IActionResult> CreateLeague([FromBody] CreateLeagueRequest req, CancellationToken ct)
    {
        var result = await _svc.CreateLeagueAsync(OrgId, req, ct);
        return CreatedAtAction(nameof(GetLeagues), new { }, result);
    }

    [HttpPatch("{leagueId:guid}")]
    public async Task<IActionResult> UpdateLeague(
        Guid leagueId, [FromBody] UpdateLeagueRequest req, CancellationToken ct) =>
        Ok(await _svc.UpdateLeagueAsync(OrgId, leagueId, req, ct));

    // ── SEASONS ───────────────────────────────────────────────────────────────

    [HttpGet("{leagueId:guid}/seasons")]
    public async Task<IActionResult> GetSeasons(Guid leagueId, CancellationToken ct) =>
        Ok(await _svc.GetSeasonsAsync(OrgId, leagueId, ct));

    [HttpGet("{leagueId:guid}/seasons/{seasonId:guid}")]
    public async Task<IActionResult> GetSeasonDashboard(
        Guid leagueId, Guid seasonId, CancellationToken ct) =>
        Ok(await _svc.GetSeasonDashboardAsync(OrgId, leagueId, seasonId, ct));

    [HttpPost("{leagueId:guid}/seasons")]
    public async Task<IActionResult> CreateSeason(
        Guid leagueId, [FromBody] CreateSeasonRequest req, CancellationToken ct)
    {
        var result = await _svc.CreateSeasonAsync(OrgId, leagueId, req, ct);
        return CreatedAtAction(nameof(GetSeasons), new { leagueId }, result);
    }

    // ── FLIGHTS ───────────────────────────────────────────────────────────────

    [HttpGet("{leagueId:guid}/seasons/{seasonId:guid}/flights")]
    public async Task<IActionResult> GetFlights(
        Guid leagueId, Guid seasonId, CancellationToken ct) =>
        Ok(await _svc.GetFlightsAsync(OrgId, leagueId, seasonId, ct));

    [HttpPost("{leagueId:guid}/seasons/{seasonId:guid}/flights")]
    public async Task<IActionResult> CreateFlight(
        Guid leagueId, Guid seasonId, [FromBody] CreateFlightRequest req, CancellationToken ct)
    {
        var result = await _svc.CreateFlightAsync(OrgId, leagueId, seasonId, req, ct);
        return CreatedAtAction(nameof(GetFlights), new { leagueId, seasonId }, result);
    }

    // ── MEMBERS ───────────────────────────────────────────────────────────────

    [HttpGet("{leagueId:guid}/seasons/{seasonId:guid}/members")]
    public async Task<IActionResult> GetMembers(
        Guid leagueId, Guid seasonId, CancellationToken ct) =>
        Ok(await _svc.GetMembersAsync(OrgId, leagueId, seasonId, ct));

    [HttpPost("{leagueId:guid}/seasons/{seasonId:guid}/members")]
    public async Task<IActionResult> AddMember(
        Guid leagueId, Guid seasonId, [FromBody] AddMemberRequest req, CancellationToken ct)
    {
        var result = await _svc.AddMemberAsync(OrgId, leagueId, seasonId, req, ct);
        return CreatedAtAction(nameof(GetMembers), new { leagueId, seasonId }, result);
    }

    [HttpPatch("{leagueId:guid}/seasons/{seasonId:guid}/members/{memberId:guid}")]
    public async Task<IActionResult> UpdateMember(
        Guid leagueId, Guid seasonId, Guid memberId,
        [FromBody] UpdateMemberRequest req, CancellationToken ct) =>
        Ok(await _svc.UpdateMemberAsync(OrgId, leagueId, seasonId, memberId, req, ct));

    [HttpPatch("{leagueId:guid}/seasons/{seasonId:guid}/members/{memberId:guid}/handicap")]
    public async Task<IActionResult> OverrideHandicap(
        Guid leagueId, Guid seasonId, Guid memberId,
        [FromBody] OverrideHandicapRequest req, CancellationToken ct)
    {
        await _svc.OverrideHandicapAsync(OrgId, leagueId, seasonId, memberId, req, ct);
        return NoContent();
    }

    [HttpGet("{leagueId:guid}/seasons/{seasonId:guid}/members/{memberId:guid}/handicap-history")]
    public async Task<IActionResult> GetHandicapHistory(
        Guid leagueId, Guid seasonId, Guid memberId, CancellationToken ct) =>
        Ok(await _svc.GetHandicapHistoryAsync(OrgId, leagueId, seasonId, memberId, ct));

    // ── ROUNDS ────────────────────────────────────────────────────────────────

    [HttpGet("{leagueId:guid}/seasons/{seasonId:guid}/rounds")]
    public async Task<IActionResult> GetRounds(
        Guid leagueId, Guid seasonId, CancellationToken ct) =>
        Ok(await _svc.GetRoundsAsync(OrgId, leagueId, seasonId, ct));

    [HttpPost("{leagueId:guid}/seasons/{seasonId:guid}/rounds")]
    public async Task<IActionResult> CreateRound(
        Guid leagueId, Guid seasonId, [FromBody] CreateRoundRequest req, CancellationToken ct)
    {
        var result = await _svc.CreateRoundAsync(OrgId, leagueId, seasonId, req, ct);
        return CreatedAtAction(nameof(GetRounds), new { leagueId, seasonId }, result);
    }

    // ── PAIRINGS ──────────────────────────────────────────────────────────────

    [HttpPost("{leagueId:guid}/seasons/{seasonId:guid}/rounds/{roundId:guid}/generate-pairings")]
    public async Task<IActionResult> GeneratePairings(
        Guid leagueId, Guid seasonId, Guid roundId,
        [FromQuery] int maxPerGroup = 4, CancellationToken ct = default) =>
        Ok(await _svc.GeneratePairingsAsync(OrgId, leagueId, seasonId, roundId, maxPerGroup, ct));

    [HttpPatch("{leagueId:guid}/seasons/{seasonId:guid}/rounds/{roundId:guid}/pairings")]
    public async Task<IActionResult> SavePairings(
        Guid leagueId, Guid seasonId, Guid roundId,
        [FromBody] SavePairingsRequest req, CancellationToken ct)
    {
        await _svc.SavePairingsAsync(OrgId, leagueId, seasonId, roundId, req, ct);
        return NoContent();
    }

    // ── ROUND STATUS TRANSITIONS ──────────────────────────────────────────────

    [HttpPost("{leagueId:guid}/seasons/{seasonId:guid}/rounds/{roundId:guid}/open-scoring")]
    public async Task<IActionResult> OpenScoring(
        Guid leagueId, Guid seasonId, Guid roundId, CancellationToken ct)
    {
        await _svc.OpenScoringAsync(OrgId, leagueId, seasonId, roundId, ct);
        return NoContent();
    }

    [HttpPost("{leagueId:guid}/seasons/{seasonId:guid}/rounds/{roundId:guid}/close")]
    public async Task<IActionResult> CloseRound(
        Guid leagueId, Guid seasonId, Guid roundId,
        [FromQuery] int skinsPotCentsPerHolePerPlayer = 0, CancellationToken ct = default)
    {
        await _svc.CloseRoundAsync(OrgId, leagueId, seasonId, roundId, skinsPotCentsPerHolePerPlayer, ct);
        return NoContent();
    }

    // ── SCORING ───────────────────────────────────────────────────────────────

    [HttpPost("{leagueId:guid}/seasons/{seasonId:guid}/rounds/{roundId:guid}/scores")]
    public async Task<IActionResult> SubmitScore(
        Guid leagueId, Guid seasonId, Guid roundId,
        [FromBody] SubmitLeagueScoreRequest req, CancellationToken ct)
    {
        await _svc.SubmitScoreAsync(OrgId, leagueId, seasonId, roundId, req, ct);
        return NoContent();
    }

    [HttpGet("{leagueId:guid}/seasons/{seasonId:guid}/rounds/{roundId:guid}/scorecards")]
    public async Task<IActionResult> GetScorecards(
        Guid leagueId, Guid seasonId, Guid roundId, CancellationToken ct) =>
        Ok(await _svc.GetRoundScorecardsAsync(OrgId, leagueId, seasonId, roundId, ct));

    // ── STANDINGS ─────────────────────────────────────────────────────────────

    [HttpGet("{leagueId:guid}/seasons/{seasonId:guid}/standings")]
    public async Task<IActionResult> GetStandings(
        Guid leagueId, Guid seasonId, CancellationToken ct) =>
        Ok(await _svc.GetStandingsAsync(OrgId, leagueId, seasonId, ct));

    // ── SKINS ─────────────────────────────────────────────────────────────────

    [HttpGet("{leagueId:guid}/seasons/{seasonId:guid}/rounds/{roundId:guid}/skins")]
    public async Task<IActionResult> GetSkins(
        Guid leagueId, Guid seasonId, Guid roundId, CancellationToken ct) =>
        Ok(await _svc.GetSkinsAsync(OrgId, leagueId, seasonId, roundId, ct));

    // ── MOBILE: MEMBER SUMMARY ────────────────────────────────────────────────

    [HttpGet("{leagueId:guid}/seasons/{seasonId:guid}/members/{memberId:guid}/summary")]
    [AllowAnonymous]
    public async Task<IActionResult> GetMemberSummary(
        Guid leagueId, Guid seasonId, Guid memberId, CancellationToken ct)
    {
        var result = await _svc.GetMemberSummaryAsync(seasonId, memberId, ct);
        return result is null ? NotFound() : Ok(result);
    }
}
