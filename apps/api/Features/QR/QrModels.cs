using System.ComponentModel.DataAnnotations;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.QR;

// ── REQUEST MODELS ─────────────────────────────────────────────────────────────

/// <summary>
/// POST /api/v1/events/{eventId}/qr/generate
/// Generates QR codes for an event. Specify which types to generate.
/// Omit types to generate the full standard set (EventJoin, Leaderboard, Donation).
/// Set generateForAllPlayers = true to also generate individual PlayerCheckin QRs.
/// </summary>
public record GenerateQrRequest
{
    /// <summary>
    /// QR types to generate. Null = generate EventJoin, Leaderboard, Donation.
    /// </summary>
    public List<QrType>? Types { get; init; }

    /// <summary>
    /// If true, generates one PlayerCheckin QR per registered player.
    /// These are included in registration confirmation emails automatically,
    /// but can be regenerated here for bulk print kit generation.
    /// </summary>
    public bool GenerateForAllPlayers { get; init; } = false;
}

// ── RESPONSE MODELS ────────────────────────────────────────────────────────────

public record QrCodeResponse
{
    public Guid     Id        { get; init; }
    public Guid     EventId   { get; init; }
    public string   QrType    { get; init; } = string.Empty;
    /// <summary>The encoded token — event_code for event QRs, HMAC token for player QRs.</summary>
    public string   Token     { get; init; } = string.Empty;
    public string   SvgData   { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
    /// <summary>For PlayerCheckin QRs, the player this QR belongs to.</summary>
    public Guid?    PlayerId  { get; init; }
    public string?  PlayerName { get; init; }
}

public record GenerateQrResultResponse
{
    public List<QrCodeResponse> Created { get; init; } = new();
    public int Count { get; init; }
}

/// <summary>
/// Returned by GET /api/v1/pub/qr/scan?token={token}
/// Used by the mobile app or browser when a QR code is physically scanned.
/// </summary>
public record QrScanResponse
{
    /// <summary>
    /// What action was performed or what the client should do:
    ///   "checked_in"   — player was successfully checked in
    ///   "already_in"   — player was already checked in (idempotent)
    ///   "redirect"     — client should navigate to RedirectUrl
    /// </summary>
    public string  Action      { get; init; } = string.Empty;
    public bool    Success     { get; init; }
    public string  Message     { get; init; } = string.Empty;

    /// <summary>For redirect actions: the URL the client should navigate to.</summary>
    public string? RedirectUrl { get; init; }

    /// <summary>For PlayerCheckin: details of the checked-in player.</summary>
    public Guid?   PlayerId    { get; init; }
    public string? PlayerName  { get; init; }
    public string? TeamName    { get; init; }
    public string? EventName   { get; init; }
}
