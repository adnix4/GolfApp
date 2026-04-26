using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using QRCoder;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Players;

namespace GolfFundraiserPro.Api.Features.QR;

public class QrService
{
    private readonly ApplicationDbContext _db;
    private readonly IConfiguration _config;
    private readonly PlayerService _playerService;
    private readonly ILogger<QrService> _logger;

    public QrService(
        ApplicationDbContext db,
        IConfiguration config,
        PlayerService playerService,
        ILogger<QrService> logger)
    {
        _db            = db;
        _config        = config;
        _playerService = playerService;
        _logger        = logger;
    }

    // ── GENERATE ───────────────────────────────────────────────────────────────

    public async Task<GenerateQrResultResponse> GenerateAsync(
        Guid orgId, Guid eventId,
        GenerateQrRequest request, CancellationToken ct = default)
    {
        var evt = await _db.Events
            .Include(e => e.Organization)
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct);

        if (evt is null)
            throw new NotFoundException("Event", eventId);

        var baseUrl  = _config["APP_BASE_URL"] ?? "https://golffundraiser.pro";
        var orgSlug  = evt.Organization.Slug;
        var eventCode = evt.EventCode;

        var typesToGenerate = request.Types
            ?? new List<QrType> { QrType.EventJoin, QrType.Leaderboard, QrType.Donation };

        var created = new List<QrCodeResponse>();

        foreach (var type in typesToGenerate.Distinct())
        {
            if (type == QrType.PlayerCheckin) continue; // handled separately below

            var (token, url) = BuildEventQrPayload(type, orgSlug, eventCode, baseUrl);
            var svg = GenerateSvg(url);

            // Remove any existing QR of the same type for this event (regenerate)
            var existing = await _db.QrCodes
                .Where(q => q.EventId == eventId && q.QrType == type)
                .ToListAsync(ct);
            _db.QrCodes.RemoveRange(existing);

            var qr = new QrCode
            {
                Id        = Guid.NewGuid(),
                EventId   = eventId,
                QrType    = type,
                Token     = token,
                SvgData   = svg,
                CreatedAt = DateTime.UtcNow,
            };

            _db.QrCodes.Add(qr);
            created.Add(MapToQrCodeResponse(qr, null, null));
        }

        // Per-player checkin QRs
        if (request.GenerateForAllPlayers ||
            (request.Types?.Contains(QrType.PlayerCheckin) == true))
        {
            var players = await _db.Players
                .Where(p => p.EventId == eventId)
                .ToListAsync(ct);

            foreach (var player in players)
            {
                var qr = await GeneratePlayerCheckinQrAsync(evt, player, ct);
                created.Add(MapToQrCodeResponse(
                    qr,
                    player.Id,
                    $"{player.FirstName} {player.LastName}"));
            }
        }

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Generated {Count} QR codes for event {EventId}", created.Count, eventId);

        return new GenerateQrResultResponse { Created = created, Count = created.Count };
    }

    /// <summary>
    /// Generates or replaces the PlayerCheckin QR for a single player.
    /// Called automatically during registration.
    /// </summary>
    public async Task<QrCode> GeneratePlayerCheckinQrAsync(
        Event evt, Domain.Entities.Player player, CancellationToken ct = default)
    {
        var token = BuildPlayerCheckinToken(player.Id, evt.Id);
        var url   = $"{_config["APP_BASE_URL"] ?? "https://golffundraiser.pro"}" +
                    $"/api/v1/pub/qr/scan?token={Uri.EscapeDataString(token)}";
        var svg   = GenerateSvg(url);

        // Remove any existing checkin QR for this player
        var existing = await _db.QrCodes
            .Where(q =>
                q.EventId == evt.Id &&
                q.QrType  == QrType.PlayerCheckin &&
                q.Token   == token)
            .ToListAsync(ct);
        _db.QrCodes.RemoveRange(existing);

        var qr = new QrCode
        {
            Id        = Guid.NewGuid(),
            EventId   = evt.Id,
            QrType    = QrType.PlayerCheckin,
            Token     = token,
            SvgData   = svg,
            CreatedAt = DateTime.UtcNow,
        };

        _db.QrCodes.Add(qr);
        return qr;
    }

    // ── LIST ───────────────────────────────────────────────────────────────────

    public async Task<List<QrCodeResponse>> GetAllAsync(
        Guid orgId, Guid eventId, CancellationToken ct = default)
    {
        var eventExists = await _db.Events
            .AnyAsync(e => e.Id == eventId && e.OrgId == orgId, ct);

        if (!eventExists)
            throw new NotFoundException("Event", eventId);

        var qrCodes = await _db.QrCodes
            .Where(q => q.EventId == eventId)
            .OrderBy(q => q.QrType)
            .ToListAsync(ct);

        // Resolve player names for PlayerCheckin QRs
        var playerTokens = qrCodes
            .Where(q => q.QrType == QrType.PlayerCheckin)
            .Select(q => q.Token)
            .ToList();

        var playerNamesByToken = new Dictionary<string, (Guid id, string name)>();
        foreach (var token in playerTokens)
        {
            var playerId = TryExtractPlayerIdFromToken(token);
            if (playerId is null) continue;

            var player = await _db.Players.FindAsync([playerId.Value], ct);
            if (player is not null)
                playerNamesByToken[token] = (player.Id, $"{player.FirstName} {player.LastName}");
        }

        return qrCodes.Select(q =>
        {
            Guid? pid   = null;
            string? pname = null;
            if (q.QrType == QrType.PlayerCheckin &&
                playerNamesByToken.TryGetValue(q.Token, out var info))
            {
                pid   = info.id;
                pname = info.name;
            }
            return MapToQrCodeResponse(q, pid, pname);
        }).ToList();
    }

    // ── SCAN (public endpoint) ─────────────────────────────────────────────────

    /// <summary>
    /// Validates a QR token and performs the appropriate action.
    /// Called when a QR code is physically scanned by the mobile app or browser.
    /// </summary>
    public async Task<QrScanResponse> ScanAsync(
        string token, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(token))
            throw new ValidationException("QR token is required.");

        // Try to classify the token by looking it up in the database first
        var qrCode = await _db.QrCodes
            .Include(q => q.Event)
                .ThenInclude(e => e.Organization)
            .FirstOrDefaultAsync(q => q.Token == token, ct);

        if (qrCode is null)
        {
            // Token not found — may be a PlayerCheckin token that wasn't stored
            // (e.g. emailed directly). Try HMAC validation.
            var checkinResult = await TryHandlePlayerCheckinAsync(token, ct);
            if (checkinResult is not null) return checkinResult;

            throw new ValidationException("This QR code is not recognised or has expired.");
        }

        var baseUrl = _config["APP_BASE_URL"] ?? "https://golffundraiser.pro";
        var slug    = qrCode.Event.Organization.Slug;
        var code    = qrCode.Event.EventCode;

        return qrCode.QrType switch
        {
            QrType.PlayerCheckin =>
                await HandlePlayerCheckinAsync(token, qrCode.Event, ct),

            QrType.EventJoin =>
                new QrScanResponse
                {
                    Action      = "redirect",
                    Success     = true,
                    Message     = "Redirecting to event registration.",
                    RedirectUrl = $"{baseUrl}/e/{slug}/{code}",
                    EventName   = qrCode.Event.Name,
                },

            QrType.Leaderboard =>
                new QrScanResponse
                {
                    Action      = "redirect",
                    Success     = true,
                    Message     = "Redirecting to leaderboard.",
                    RedirectUrl = $"{baseUrl}/e/{slug}/{code}/leaderboard",
                    EventName   = qrCode.Event.Name,
                },

            QrType.Donation =>
                new QrScanResponse
                {
                    Action      = "redirect",
                    Success     = true,
                    Message     = "Redirecting to donation page.",
                    RedirectUrl = $"{baseUrl}/e/{slug}/{code}/donate",
                    EventName   = qrCode.Event.Name,
                },

            QrType.HoleChallenge =>
                new QrScanResponse
                {
                    Action      = "redirect",
                    Success     = true,
                    Message     = "Redirecting to hole challenge.",
                    RedirectUrl = $"{baseUrl}/e/{slug}/{code}/challenge/{qrCode.Token}",
                    EventName   = qrCode.Event.Name,
                },

            QrType.AppDownload =>
                new QrScanResponse
                {
                    Action      = "redirect",
                    Success     = true,
                    Message     = "Redirecting to app download.",
                    RedirectUrl = "https://golffundraiser.pro/app",
                },

            _ => throw new ValidationException($"Unknown QR type: {qrCode.QrType}"),
        };
    }

    // ── PRIVATE HELPERS ────────────────────────────────────────────────────────

    private async Task<QrScanResponse> HandlePlayerCheckinAsync(
        string token, Event evt, CancellationToken ct)
    {
        var (playerId, eventId) = ParsePlayerCheckinToken(token);

        if (eventId != evt.Id)
            throw new ValidationException("This check-in QR is for a different event.");

        var player = await _db.Players
            .Include(p => p.Team)
            .FirstOrDefaultAsync(p => p.Id == playerId && p.EventId == eventId, ct);

        if (player is null)
            throw new NotFoundException("Player not found for this QR code.");

        var alreadyIn = player.CheckInStatus == Domain.Enums.CheckInStatus.CheckedIn;
        await _playerService.CheckInByPlayerIdAsync(playerId, eventId, ct);

        return new QrScanResponse
        {
            Action     = alreadyIn ? "already_in" : "checked_in",
            Success    = true,
            Message    = alreadyIn
                ? $"{player.FirstName} {player.LastName} is already checked in."
                : $"{player.FirstName} {player.LastName} checked in successfully!",
            PlayerId   = player.Id,
            PlayerName = $"{player.FirstName} {player.LastName}",
            TeamName   = player.Team?.Name,
            EventName  = evt.Name,
        };
    }

    private async Task<QrScanResponse?> TryHandlePlayerCheckinAsync(
        string token, CancellationToken ct)
    {
        try
        {
            var (playerId, eventId) = ParsePlayerCheckinToken(token);

            var player = await _db.Players
                .Include(p => p.Team)
                .Include(p => p.Event)
                .FirstOrDefaultAsync(p => p.Id == playerId && p.EventId == eventId, ct);

            if (player is null) return null;

            var alreadyIn = player.CheckInStatus == Domain.Enums.CheckInStatus.CheckedIn;
            await _playerService.CheckInByPlayerIdAsync(playerId, eventId, ct);

            return new QrScanResponse
            {
                Action     = alreadyIn ? "already_in" : "checked_in",
                Success    = true,
                Message    = alreadyIn
                    ? $"{player.FirstName} {player.LastName} is already checked in."
                    : $"{player.FirstName} {player.LastName} checked in successfully!",
                PlayerId   = player.Id,
                PlayerName = $"{player.FirstName} {player.LastName}",
                TeamName   = player.Team?.Name,
                EventName  = player.Event.Name,
            };
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Builds a signed HMAC PlayerCheckin token.
    /// Format: base64url(playerId:eventId).base64url(HMAC-SHA256)
    /// </summary>
    private string BuildPlayerCheckinToken(Guid playerId, Guid eventId)
    {
        var payload  = $"{playerId}:{eventId}";
        var secret   = _config["JWT_SECRET"]
            ?? throw new InvalidOperationException("JWT_SECRET not configured");

        var keyBytes  = Encoding.UTF8.GetBytes(secret);
        var payBytes  = Encoding.UTF8.GetBytes(payload);
        var hmac      = HMACSHA256.HashData(keyBytes, payBytes);

        var payB64  = Convert.ToBase64String(payBytes)
            .Replace('+', '-').Replace('/', '_').TrimEnd('=');
        var sigB64  = Convert.ToBase64String(hmac)
            .Replace('+', '-').Replace('/', '_').TrimEnd('=');

        return $"{payB64}.{sigB64}";
    }

    private (Guid playerId, Guid eventId) ParsePlayerCheckinToken(string token)
    {
        try
        {
            var parts = token.Split('.');
            if (parts.Length != 2)
                throw new ValidationException("Invalid check-in token.");

            var payBytes = Convert.FromBase64String(
                parts[0].Replace('-', '+').Replace('_', '/') + "==");
            var payload  = Encoding.UTF8.GetString(payBytes).Split(':');

            if (payload.Length != 2)
                throw new ValidationException("Invalid check-in token format.");

            var playerId = Guid.Parse(payload[0]);
            var eventId  = Guid.Parse(payload[1]);

            // Verify HMAC
            var secret   = _config["JWT_SECRET"]
                ?? throw new InvalidOperationException("JWT_SECRET not configured");
            var keyBytes = Encoding.UTF8.GetBytes(secret);
            var expected = HMACSHA256.HashData(keyBytes, payBytes);
            var expB64   = Convert.ToBase64String(expected)
                .Replace('+', '-').Replace('/', '_').TrimEnd('=');

            if (expB64 != parts[1])
                throw new ValidationException("Check-in token signature is invalid.");

            return (playerId, eventId);
        }
        catch (Exception ex) when (ex is not ValidationException)
        {
            throw new ValidationException("This check-in QR code is not valid.");
        }
    }

    private Guid? TryExtractPlayerIdFromToken(string token)
    {
        try
        {
            var (playerId, _) = ParsePlayerCheckinToken(token);
            return playerId;
        }
        catch
        {
            return null;
        }
    }

    private static (string token, string url) BuildEventQrPayload(
        QrType type, string orgSlug, string eventCode, string baseUrl)
    {
        var url = type switch
        {
            QrType.EventJoin   => $"{baseUrl}/e/{orgSlug}/{eventCode}",
            QrType.Leaderboard => $"{baseUrl}/e/{orgSlug}/{eventCode}/leaderboard",
            QrType.Donation    => $"{baseUrl}/e/{orgSlug}/{eventCode}/donate",
            QrType.AppDownload => $"{baseUrl}/app",
            _                  => $"{baseUrl}/e/{orgSlug}/{eventCode}",
        };

        return (eventCode, url);
    }

    private static string GenerateSvg(string content)
    {
        using var generator = new QRCodeGenerator();
        var data = generator.CreateQrCode(content, QRCodeGenerator.ECCLevel.M);
        var svg  = new SvgQRCode(data);
        return svg.GetGraphic(5);
    }

    private static QrCodeResponse MapToQrCodeResponse(
        QrCode q, Guid? playerId, string? playerName) => new()
    {
        Id         = q.Id,
        EventId    = q.EventId,
        QrType     = q.QrType.ToString(),
        Token      = q.Token,
        SvgData    = q.SvgData,
        CreatedAt  = q.CreatedAt,
        PlayerId   = playerId,
        PlayerName = playerName,
    };
}
