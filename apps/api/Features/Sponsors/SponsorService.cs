using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.Sponsors;

public class SponsorService
{
    private readonly ApplicationDbContext _db;
    private readonly IWebHostEnvironment  _env;
    private readonly ILogger<SponsorService> _logger;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };
    private static readonly string[] AllowedImageTypes =
        ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    private const long MaxLogoBytes = 2 * 1024 * 1024;

    public SponsorService(ApplicationDbContext db, IWebHostEnvironment env, ILogger<SponsorService> logger)
    {
        _db     = db;
        _env    = env;
        _logger = logger;
    }

    // ── SPONSORS ───────────────────────────────────────────────────────────────

    public async Task<SponsorResponse> CreateSponsorAsync(
        Guid orgId, Guid eventId,
        CreateSponsorRequest request, CancellationToken ct = default)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var sponsor = new Sponsor
        {
            Id                  = Guid.NewGuid(),
            EventId             = eventId,
            Name                = request.Name,
            LogoUrl             = request.LogoUrl ?? string.Empty,
            WebsiteUrl          = request.WebsiteUrl,
            Tagline             = request.Tagline,
            Tier                = request.Tier,
            DonationAmountCents = request.DonationAmountCents,
            PlacementsJson      = JsonSerializer.Serialize(request.Placements),
        };

        _db.Sponsors.Add(sponsor);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Created sponsor '{Name}' ({Tier}) for event {EventId}",
            sponsor.Name, sponsor.Tier, eventId);

        return MapToSponsorResponse(sponsor);
    }

    public async Task<List<SponsorResponse>> GetAllSponsorsAsync(
        Guid orgId, Guid eventId, CancellationToken ct = default)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var sponsors = await _db.Sponsors
            .Where(s => s.EventId == eventId)
            .OrderBy(s => s.Tier)
            .ThenBy(s => s.Name)
            .ToListAsync(ct);

        return sponsors.Select(MapToSponsorResponse).ToList();
    }

    public async Task<SponsorResponse> UpdateSponsorAsync(
        Guid orgId, Guid eventId, Guid sponsorId,
        UpdateSponsorRequest request, CancellationToken ct = default)
    {
        var sponsor = await GetSponsorAsync(orgId, eventId, sponsorId, ct);

        if (request.Name       is not null) sponsor.Name       = request.Name;
        if (request.LogoUrl    is not null) sponsor.LogoUrl    = request.LogoUrl;
        if (request.WebsiteUrl is not null) sponsor.WebsiteUrl = request.WebsiteUrl;
        if (request.Tagline    is not null) sponsor.Tagline    = request.Tagline;
        if (request.Tier.HasValue)          sponsor.Tier       = request.Tier.Value;
        if (request.DonationAmountCents.HasValue) sponsor.DonationAmountCents = request.DonationAmountCents;
        if (request.Placements is not null) sponsor.PlacementsJson = JsonSerializer.Serialize(request.Placements);

        await _db.SaveChangesAsync(ct);
        return MapToSponsorResponse(sponsor);
    }

    public async Task DeleteSponsorAsync(
        Guid orgId, Guid eventId, Guid sponsorId, CancellationToken ct = default)
    {
        var sponsor = await GetSponsorAsync(orgId, eventId, sponsorId, ct);
        _db.Sponsors.Remove(sponsor);
        await _db.SaveChangesAsync(ct);
        _logger.LogInformation("Deleted sponsor {SponsorId} from event {EventId}", sponsorId, eventId);
    }

    public async Task<SponsorResponse> UploadSponsorLogoAsync(
        Guid orgId, Guid eventId, Guid sponsorId, IFormFile file, CancellationToken ct = default)
    {
        if (file.Length == 0)
            throw new ValidationException("Uploaded file is empty.");
        if (file.Length > MaxLogoBytes)
            throw new ValidationException("Logo must be 2 MB or smaller.");
        if (!AllowedImageTypes.Contains(file.ContentType.ToLowerInvariant()))
            throw new ValidationException("Logo must be PNG, JPEG, SVG, or WebP.");

        var sponsor = await GetSponsorAsync(orgId, eventId, sponsorId, ct);

        if (sponsor.LogoUrl?.StartsWith("/uploads/") == true)
        {
            var oldPath = Path.Combine(_env.WebRootPath,
                sponsor.LogoUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
            if (File.Exists(oldPath)) File.Delete(oldPath);
        }

        var ext      = Path.GetExtension(file.FileName).ToLowerInvariant();
        var filename = $"{sponsorId}{ext}";
        var dir      = Path.Combine(_env.WebRootPath, "uploads", "sponsor-logos");
        Directory.CreateDirectory(dir);
        await using var stream = new FileStream(Path.Combine(dir, filename), FileMode.Create, FileAccess.Write);
        await file.CopyToAsync(stream, ct);

        sponsor.LogoUrl = $"/uploads/sponsor-logos/{filename}";
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Logo uploaded for sponsor {SponsorId}: {Url}", sponsorId, sponsor.LogoUrl);
        return MapToSponsorResponse(sponsor);
    }

    // ── HOLE CHALLENGES ────────────────────────────────────────────────────────

    public async Task<ChallengeResponse> CreateChallengeAsync(
        Guid orgId, Guid eventId,
        CreateChallengeRequest request, CancellationToken ct = default)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        if (request.SponsorId.HasValue)
        {
            var sponsorExists = await _db.Sponsors
                .AnyAsync(s => s.Id == request.SponsorId.Value && s.EventId == eventId, ct);
            if (!sponsorExists)
                throw new NotFoundException("Sponsor", request.SponsorId.Value);
        }

        var challenge = new HoleChallenge
        {
            Id               = Guid.NewGuid(),
            EventId          = eventId,
            HoleNumber       = request.HoleNumber,
            ChallengeType    = request.ChallengeType,
            Description      = request.Description,
            PrizeDescription = request.PrizeDescription,
            SponsorId        = request.SponsorId,
        };

        _db.HoleChallenges.Add(challenge);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Created {Type} challenge on hole {Hole} for event {EventId}",
            challenge.ChallengeType, challenge.HoleNumber?.ToString() ?? "all-day", eventId);

        return await LoadChallengeResponseAsync(challenge.Id, ct);
    }

    public async Task<List<ChallengeResponse>> GetAllChallengesAsync(
        Guid orgId, Guid eventId, CancellationToken ct = default)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var challenges = await _db.HoleChallenges
            .Include(c => c.Sponsor)
            .Include(c => c.Results)
                .ThenInclude(r => r.Team)
            .Where(c => c.EventId == eventId)
            .OrderBy(c => c.HoleNumber)
            .ToListAsync(ct);

        return challenges.Select(MapToChallengeResponse).ToList();
    }

    public async Task<ChallengeResponse> UpdateChallengeAsync(
        Guid orgId, Guid eventId, Guid challengeId,
        UpdateChallengeRequest request, CancellationToken ct = default)
    {
        var challenge = await GetChallengeAsync(orgId, eventId, challengeId, ct);

        if (request.HoleNumber.HasValue)          challenge.HoleNumber          = request.HoleNumber;
        if (request.ChallengeType.HasValue)       challenge.ChallengeType        = request.ChallengeType.Value;
        if (request.Description      is not null) challenge.Description          = request.Description;
        if (request.PrizeDescription is not null) challenge.PrizeDescription     = request.PrizeDescription;
        if (request.SponsorId.HasValue)           challenge.SponsorId            = request.SponsorId;
        if (request.DonationAmountCents.HasValue) challenge.DonationAmountCents  = request.DonationAmountCents;

        await _db.SaveChangesAsync(ct);
        return await LoadChallengeResponseAsync(challenge.Id, ct);
    }

    public async Task DeleteChallengeAsync(
        Guid orgId, Guid eventId, Guid challengeId, CancellationToken ct = default)
    {
        var challenge = await GetChallengeAsync(orgId, eventId, challengeId, ct);
        _db.HoleChallenges.Remove(challenge);
        await _db.SaveChangesAsync(ct);
        _logger.LogInformation("Deleted challenge {ChallengeId} from event {EventId}", challengeId, eventId);
    }

    public async Task<ChallengeResponse> UpsertChallengeByHoleAsync(
        Guid orgId, Guid eventId, short holeNumber,
        UpsertChallengeByHoleRequest request, CancellationToken ct = default)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        Guid? sponsorId = null;
        if (!string.IsNullOrWhiteSpace(request.SponsorName))
        {
            var sponsor = await _db.Sponsors
                .Where(s => s.EventId == eventId)
                .FirstOrDefaultAsync(
                    s => s.Name.ToLower() == request.SponsorName.ToLower(), ct);
            sponsorId = sponsor?.Id;
        }

        var existing = await _db.HoleChallenges
            .FirstOrDefaultAsync(c => c.EventId == eventId && c.HoleNumber == holeNumber, ct);

        var sponsorName    = NullIfBlank(request.SponsorName);
        var sponsorLogoUrl = NullIfBlank(request.SponsorLogoUrl);

        if (existing is not null)
        {
            existing.Description         = request.Description;
            existing.SponsorId           = sponsorId;
            existing.SponsorName         = sponsorName;
            existing.SponsorLogoUrl      = sponsorLogoUrl;
            existing.DonationAmountCents = request.DonationAmountCents;
            await _db.SaveChangesAsync(ct);
            return await LoadChallengeResponseAsync(existing.Id, ct);
        }

        var challenge = new HoleChallenge
        {
            Id                  = Guid.NewGuid(),
            EventId             = eventId,
            HoleNumber          = holeNumber,
            ChallengeType       = ChallengeType.ClosestToPin,
            Description         = request.Description,
            SponsorId           = sponsorId,
            SponsorName         = sponsorName,
            SponsorLogoUrl      = sponsorLogoUrl,
            DonationAmountCents = request.DonationAmountCents,
        };

        _db.HoleChallenges.Add(challenge);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Upserted challenge on hole {Hole} for event {EventId}", holeNumber, eventId);

        return await LoadChallengeResponseAsync(challenge.Id, ct);
    }

    public async Task DeleteChallengeByHoleAsync(
        Guid orgId, Guid eventId, short holeNumber, CancellationToken ct = default)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var challenge = await _db.HoleChallenges
            .FirstOrDefaultAsync(c => c.EventId == eventId && c.HoleNumber == holeNumber, ct);

        if (challenge is null)
            throw new NotFoundException($"No challenge found on hole {holeNumber} for this event.");

        _db.HoleChallenges.Remove(challenge);
        await _db.SaveChangesAsync(ct);
        _logger.LogInformation(
            "Deleted challenge on hole {Hole} from event {EventId}", holeNumber, eventId);
    }

    // ── CHALLENGE RESULTS ──────────────────────────────────────────────────────

    public async Task<ChallengeResultResponse> RecordResultAsync(
        Guid orgId, Guid eventId, Guid challengeId,
        RecordChallengeResultRequest request, CancellationToken ct = default)
    {
        var challenge = await GetChallengeAsync(orgId, eventId, challengeId, ct);

        var team = await _db.Teams
            .FirstOrDefaultAsync(t => t.Id == request.TeamId && t.EventId == eventId, ct);

        if (team is null)
            throw new NotFoundException("Team", request.TeamId);

        var result = new ChallengeResult
        {
            Id          = Guid.NewGuid(),
            ChallengeId = challenge.Id,
            TeamId      = request.TeamId,
            PlayerId    = request.PlayerId,
            ResultValue = request.ResultValue,
            ResultNotes = request.ResultNotes,
            RecordedAt  = DateTime.UtcNow,
        };

        _db.ChallengeResults.Add(result);
        await _db.SaveChangesAsync(ct);

        string? playerName = null;
        if (request.PlayerId.HasValue)
        {
            var player = await _db.Players.FindAsync([request.PlayerId.Value], ct);
            playerName = player is null ? null : $"{player.FirstName} {player.LastName}";
        }

        return MapToChallengeResultResponse(result, team.Name, playerName);
    }

    public async Task<List<ChallengeResultResponse>> GetResultsAsync(
        Guid orgId, Guid eventId, Guid challengeId, CancellationToken ct = default)
    {
        await GetChallengeAsync(orgId, eventId, challengeId, ct);

        var results = await _db.ChallengeResults
            .Include(r => r.Team)
            .Where(r => r.ChallengeId == challengeId)
            .OrderBy(r => r.ResultValue)
            .ToListAsync(ct);

        var playerIds = results
            .Where(r => r.PlayerId.HasValue)
            .Select(r => r.PlayerId!.Value)
            .Distinct()
            .ToList();

        var playerNames = await _db.Players
            .Where(p => playerIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => $"{p.FirstName} {p.LastName}", ct);

        return results.Select(r =>
        {
            playerNames.TryGetValue(r.PlayerId ?? Guid.Empty, out var name);
            return MapToChallengeResultResponse(r, r.Team.Name, name);
        }).ToList();
    }

    // ── DONATIONS ──────────────────────────────────────────────────────────────

    public async Task<DonationResponse> RecordDonationAsync(
        Guid orgId, Guid eventId,
        RecordDonationRequest request, CancellationToken ct = default)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var donation = new Donation
        {
            Id          = Guid.NewGuid(),
            EventId     = eventId,
            DonorName   = request.DonorName,
            DonorEmail  = request.DonorEmail.ToLowerInvariant(),
            AmountCents = request.AmountCents,
            ReceiptSent = false,
            CreatedAt   = DateTime.UtcNow,
        };

        _db.Donations.Add(donation);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Recorded donation of {Amount} cents from '{Donor}' for event {EventId}",
            request.AmountCents, request.DonorName, eventId);

        return MapToDonationResponse(donation);
    }

    public async Task<List<DonationResponse>> GetAllDonationsAsync(
        Guid orgId, Guid eventId, CancellationToken ct = default)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var donations = await _db.Donations
            .Where(d => d.EventId == eventId)
            .OrderByDescending(d => d.CreatedAt)
            .ToListAsync(ct);

        return donations.Select(MapToDonationResponse).ToList();
    }

    public async Task<DonationResponse> UpdateDonationAsync(
        Guid orgId, Guid eventId, Guid donationId,
        UpdateDonationRequest request, CancellationToken ct = default)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var donation = await _db.Donations
            .FirstOrDefaultAsync(d => d.Id == donationId && d.EventId == eventId, ct);

        if (donation is null)
            throw new NotFoundException("Donation", donationId);

        if (request.DonorName   is not null)  donation.DonorName   = request.DonorName;
        if (request.DonorEmail  is not null)  donation.DonorEmail  = request.DonorEmail.ToLowerInvariant();
        if (request.AmountCents.HasValue)      donation.AmountCents = request.AmountCents.Value;
        if (request.ReceiptSent.HasValue)      donation.ReceiptSent = request.ReceiptSent.Value;

        await _db.SaveChangesAsync(ct);
        return MapToDonationResponse(donation);
    }

    // ── PRIVATE HELPERS ────────────────────────────────────────────────────────

    private async Task VerifyEventOwnershipAsync(Guid orgId, Guid eventId, CancellationToken ct)
    {
        var exists = await _db.Events.AnyAsync(e => e.Id == eventId && e.OrgId == orgId, ct);
        if (!exists)
            throw new NotFoundException("Event", eventId);
    }

    private async Task<Sponsor> GetSponsorAsync(
        Guid orgId, Guid eventId, Guid sponsorId, CancellationToken ct)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var sponsor = await _db.Sponsors
            .FirstOrDefaultAsync(s => s.Id == sponsorId && s.EventId == eventId, ct);

        if (sponsor is null)
            throw new NotFoundException("Sponsor", sponsorId);

        return sponsor;
    }

    private async Task<HoleChallenge> GetChallengeAsync(
        Guid orgId, Guid eventId, Guid challengeId, CancellationToken ct)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var challenge = await _db.HoleChallenges
            .FirstOrDefaultAsync(c => c.Id == challengeId && c.EventId == eventId, ct);

        if (challenge is null)
            throw new NotFoundException("HoleChallenge", challengeId);

        return challenge;
    }

    private async Task<ChallengeResponse> LoadChallengeResponseAsync(
        Guid challengeId, CancellationToken ct)
    {
        var challenge = await _db.HoleChallenges
            .Include(c => c.Sponsor)
            .Include(c => c.Results).ThenInclude(r => r.Team)
            .FirstAsync(c => c.Id == challengeId, ct);

        return MapToChallengeResponse(challenge);
    }

    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static SponsorResponse MapToSponsorResponse(Sponsor s)
    {
        var placements = new SponsorPlacementsDto();
        try
        {
            if (!string.IsNullOrWhiteSpace(s.PlacementsJson))
                placements = JsonSerializer.Deserialize<SponsorPlacementsDto>(s.PlacementsJson, JsonOpts)
                             ?? new SponsorPlacementsDto();
        }
        catch { /* return empty placements on bad JSON */ }

        return new SponsorResponse
        {
            Id                  = s.Id,
            EventId             = s.EventId,
            Name                = s.Name,
            LogoUrl             = s.LogoUrl,
            WebsiteUrl          = s.WebsiteUrl,
            Tagline             = s.Tagline,
            Tier                = s.Tier.ToString(),
            DonationAmountCents = s.DonationAmountCents,
            Placements          = placements,
        };
    }

    private static ChallengeResponse MapToChallengeResponse(HoleChallenge c) => new()
    {
        Id                  = c.Id,
        EventId             = c.EventId,
        HoleNumber          = c.HoleNumber,
        ChallengeType       = c.ChallengeType.ToString(),
        Description         = c.Description,
        PrizeDescription    = c.PrizeDescription,
        SponsorId           = c.SponsorId,
        SponsorName         = c.SponsorName ?? c.Sponsor?.Name,
        SponsorLogoUrl      = c.SponsorLogoUrl ?? c.Sponsor?.LogoUrl,
        DonationAmountCents = c.DonationAmountCents,
        Results             = c.Results.Select(r =>
            MapToChallengeResultResponse(r, r.Team.Name, null)).ToList(),
    };

    private static ChallengeResultResponse MapToChallengeResultResponse(
        ChallengeResult r, string teamName, string? playerName) => new()
    {
        Id          = r.Id,
        ChallengeId = r.ChallengeId,
        TeamId      = r.TeamId,
        TeamName    = teamName,
        PlayerId    = r.PlayerId,
        PlayerName  = playerName,
        ResultValue = r.ResultValue,
        ResultNotes = r.ResultNotes,
        RecordedAt  = r.RecordedAt,
    };

    private static DonationResponse MapToDonationResponse(Donation d) => new()
    {
        Id          = d.Id,
        EventId     = d.EventId,
        DonorName   = d.DonorName,
        DonorEmail  = d.DonorEmail,
        AmountCents = d.AmountCents,
        ReceiptSent = d.ReceiptSent,
        CreatedAt   = d.CreatedAt,
    };
}
