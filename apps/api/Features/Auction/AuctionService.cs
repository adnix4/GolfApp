using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Emails;
using GolfFundraiserPro.Api.Features.Notifications;
using GolfFundraiserPro.Api.Features.Payments;
using GolfFundraiserPro.Api.Features.RealTime;

namespace GolfFundraiserPro.Api.Features.Auction;

public class AuctionService
{
    private readonly ApplicationDbContext _db;
    private readonly IRealTimeService _realTime;
    private readonly PaymentsService _payments;
    private readonly EmailService _email;
    private readonly PushNotificationService _push;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<AuctionService> _logger;

    private static readonly string[] AllowedImageTypes =
        ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    private const long MaxPhotoBytes = 5 * 1024 * 1024;

    public AuctionService(
        ApplicationDbContext db,
        IRealTimeService realTime,
        PaymentsService payments,
        EmailService email,
        PushNotificationService push,
        IWebHostEnvironment env,
        ILogger<AuctionService> logger)
    {
        _db       = db;
        _realTime = realTime;
        _payments = payments;
        _email    = email;
        _push     = push;
        _env      = env;
        _logger   = logger;
    }

    // ── ITEM CRUD ──────────────────────────────────────────────────────────────

    public async Task<List<AuctionItemResponse>> GetItemsAsync(
        Guid orgId, Guid eventId, CancellationToken ct)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);
        var items = await _db.AuctionItems
            .Where(i => i.EventId == eventId)
            .OrderBy(i => i.DisplayOrder).ThenBy(i => i.CreatedAt)
            .ToListAsync(ct);
        return items.Select(MapItem).ToList();
    }

    public async Task<List<AuctionItemResponse>> GetPublicItemsAsync(
        Guid eventId, CancellationToken ct)
    {
        var items = await _db.AuctionItems
            .Where(i => i.EventId == eventId
                     && (i.Status == AuctionItemStatus.Open || i.Status == AuctionItemStatus.Extended))
            .OrderBy(i => i.DisplayOrder).ThenBy(i => i.CreatedAt)
            .ToListAsync(ct);
        return items.Select(MapItem).ToList();
    }

    public async Task<AuctionItemResponse> CreateItemAsync(
        Guid orgId, Guid eventId, CreateAuctionItemRequest req, CancellationToken ct)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        if (!Enum.TryParse<AuctionType>(req.AuctionType, ignoreCase: true, out var auctionType))
            throw new ValidationException($"Unknown auction_type '{req.AuctionType}'.");

        var item = new AuctionItem
        {
            Id                     = Guid.NewGuid(),
            EventId                = eventId,
            Title                  = req.Title,
            Description            = req.Description,
            PhotoUrlsJson          = JsonSerializer.Serialize(req.PhotoUrls),
            AuctionType            = auctionType,
            Status                 = AuctionItemStatus.Open,
            StartingBidCents       = req.StartingBidCents,
            BidIncrementCents      = req.BidIncrementCents,
            BuyNowPriceCents       = req.BuyNowPriceCents,
            CurrentHighBidCents    = 0,
            ClosesAt               = req.ClosesAt,
            OriginalClosesAt       = req.ClosesAt,
            MaxExtensionMin        = req.MaxExtensionMin,
            DisplayOrder           = req.DisplayOrder,
            DonationDenominationsJson = req.DonationDenominations is null
                ? null
                : JsonSerializer.Serialize(req.DonationDenominations),
            MinimumBidCents        = req.MinimumBidCents,
            FairMarketValueCents   = req.FairMarketValueCents,
            GoalCents              = req.GoalCents,
            CreatedAt              = DateTime.UtcNow,
        };

        _db.AuctionItems.Add(item);
        await _db.SaveChangesAsync(ct);
        return MapItem(item);
    }

    public async Task<AuctionItemResponse> UpdateItemAsync(
        Guid orgId, Guid eventId, Guid itemId, UpdateAuctionItemRequest req, CancellationToken ct)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);
        var item = await GetItemOrThrowAsync(itemId, eventId, ct);

        if (req.Title               is not null) item.Title               = req.Title;
        if (req.Description         is not null) item.Description         = req.Description;
        if (req.PhotoUrls           is not null) item.PhotoUrlsJson        = JsonSerializer.Serialize(req.PhotoUrls);
        if (req.StartingBidCents    is not null) item.StartingBidCents     = req.StartingBidCents.Value;
        if (req.BidIncrementCents   is not null) item.BidIncrementCents    = req.BidIncrementCents.Value;
        if (req.BuyNowPriceCents    is not null) item.BuyNowPriceCents     = req.BuyNowPriceCents;
        if (req.ClosesAt            is not null) { item.ClosesAt = req.ClosesAt; item.OriginalClosesAt = req.ClosesAt; }
        if (req.MaxExtensionMin     is not null) item.MaxExtensionMin      = req.MaxExtensionMin.Value;
        if (req.DisplayOrder        is not null) item.DisplayOrder         = req.DisplayOrder.Value;
        if (req.MinimumBidCents     is not null) item.MinimumBidCents      = req.MinimumBidCents;
        if (req.FairMarketValueCents is not null) item.FairMarketValueCents = req.FairMarketValueCents.Value;
        if (req.GoalCents           is not null) item.GoalCents            = req.GoalCents;
        if (req.DonationDenominations is not null)
            item.DonationDenominationsJson = JsonSerializer.Serialize(req.DonationDenominations);

        await _db.SaveChangesAsync(ct);
        return MapItem(item);
    }

    public async Task DeleteItemAsync(Guid orgId, Guid eventId, Guid itemId, CancellationToken ct)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);
        var item = await GetItemOrThrowAsync(itemId, eventId, ct);
        if (item.Status is AuctionItemStatus.Closed or AuctionItemStatus.Awarded)
            throw new ValidationException("Cannot delete a closed or awarded auction item.");
        item.Status = AuctionItemStatus.Cancelled;
        await _db.SaveChangesAsync(ct);
    }

    public async Task<AuctionItemResponse> UploadItemPhotoAsync(
        Guid orgId, Guid eventId, Guid itemId, IFormFile file, CancellationToken ct)
    {
        if (file.Length == 0)
            throw new ValidationException("Uploaded file is empty.");
        if (file.Length > MaxPhotoBytes)
            throw new ValidationException("Photo must be 5 MB or smaller.");
        if (!AllowedImageTypes.Contains(file.ContentType.ToLowerInvariant()))
            throw new ValidationException("Photo must be PNG, JPEG, SVG, or WebP.");

        await VerifyEventOwnershipAsync(orgId, eventId, ct);
        var item = await GetItemOrThrowAsync(itemId, eventId, ct);

        var ext      = Path.GetExtension(file.FileName).ToLowerInvariant();
        var filename = $"{itemId}-{Guid.NewGuid()}{ext}";
        var dir      = Path.Combine(_env.WebRootPath, "uploads", "auction-photos");
        Directory.CreateDirectory(dir);
        await using var stream = new FileStream(Path.Combine(dir, filename), FileMode.Create, FileAccess.Write);
        await file.CopyToAsync(stream, ct);

        var url      = $"/uploads/auction-photos/{filename}";
        var existing = JsonSerializer.Deserialize<List<string>>(
                           string.IsNullOrEmpty(item.PhotoUrlsJson) ? "[]" : item.PhotoUrlsJson)
                       ?? new List<string>();
        existing.Add(url);
        item.PhotoUrlsJson = JsonSerializer.Serialize(existing);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Photo uploaded for auction item {ItemId}: {Url}", itemId, url);
        return MapItem(item);
    }

    // ── BIDDING ────────────────────────────────────────────────────────────────

    public async Task<BidResponse> PlaceBidAsync(Guid itemId, PlaceBidRequest req, CancellationToken ct)
    {
        // All validation and write inside a serializable transaction with row-level lock.
        await using var tx = await _db.Database.BeginTransactionAsync(
            System.Data.IsolationLevel.RepeatableRead, ct);

        // SELECT ... FOR UPDATE (row-level lock prevents simultaneous bids)
        var item = await _db.AuctionItems
            .FromSqlRaw(
                "SELECT * FROM auction_items WHERE id = {0} FOR UPDATE",
                itemId)
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("AuctionItem", itemId);

        var now0 = DateTime.UtcNow;

        if (AuctionBidRules.IsItemClosed(item.Status, item.ClosesAt, now0))
            throw new ValidationException("AUCTION_CLOSED");

        var player = await _db.Players.FirstOrDefaultAsync(p => p.Id == req.PlayerId, ct)
            ?? throw new NotFoundException("Player", req.PlayerId);

        if (AuctionBidRules.NeedsPaymentMethod(player.HasPaymentMethod, player.CheckInStatus))
            throw new ValidationException("NO_PAYMENT_METHOD");

        var isDonation = item.AuctionType is AuctionType.DonationSilent or AuctionType.DonationLive;

        var minRequired = AuctionBidRules.MinimumRequired(
            item.AuctionType, item.StartingBidCents, item.BidIncrementCents,
            item.CurrentHighBidCents, item.MinimumBidCents);

        if (req.AmountCents < minRequired)
            throw new ValidationException($"BID_TOO_LOW:{minRequired}");

        // Capture outgoing high bidder before we overwrite (for outbid notification)
        Guid? previousHighBidderId = null;
        if (!isDonation && item.CurrentHighBidCents > 0 && req.AmountCents > item.CurrentHighBidCents)
        {
            previousHighBidderId = await _db.Bids
                .Where(b => b.AuctionItemId == itemId && b.AmountCents == item.CurrentHighBidCents)
                .OrderByDescending(b => b.PlacedAt)
                .Select(b => (Guid?)b.PlayerId)
                .FirstOrDefaultAsync(ct);
            // Don't notify the same player who is placing the new bid
            if (previousHighBidderId == req.PlayerId)
                previousHighBidderId = null;
        }

        // Buy-now check
        bool closedByBuyNow = AuctionBidRules.IsBuyNow(item.BuyNowPriceCents, req.AmountCents);
        if (closedByBuyNow)
            item.Status = AuctionItemStatus.Closed;

        var bid = new Bid
        {
            Id            = Guid.NewGuid(),
            AuctionItemId = itemId,
            PlayerId      = req.PlayerId,
            AmountCents   = req.AmountCents,
            PlacedAt      = now0,
        };
        _db.Bids.Add(bid);

        if (!isDonation)
            item.CurrentHighBidCents = Math.Max(item.CurrentHighBidCents, req.AmountCents);

        DateTime? newClosesAt = null;
        if (!closedByBuyNow)
        {
            var ext = AuctionBidRules.ComputeExtension(
                item.ClosesAt, item.OriginalClosesAt, item.MaxExtensionMin, now0);
            if (ext.HasValue)
            {
                item.ClosesAt   = ext.Value;
                newClosesAt     = ext.Value;
                item.Status     = AuctionItemStatus.Extended;
            }
        }

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        // Fire SignalR events after commit
        var evt = await _db.Events.FirstOrDefaultAsync(e => e.Id == item.EventId, ct);
        if (evt is not null)
        {
            if (newClosesAt.HasValue)
                await _realTime.SendAuctionExtendedAsync(evt.EventCode, itemId, newClosesAt.Value, ct);

            await _realTime.SendBidPlacedAsync(evt.EventCode, itemId, req.PlayerId,
                req.AmountCents, isDonation, ct);

            if (isDonation)
            {
                var total = await _db.Bids
                    .Where(b => b.AuctionItemId == itemId)
                    .SumAsync(b => b.AmountCents, ct);
                await _realTime.SendAuctionTotalUpdatedAsync(evt.EventCode, itemId, total, ct);
            }

            if (closedByBuyNow)
                await _realTime.SendItemClosedAsync(evt.EventCode, itemId, req.PlayerId, req.AmountCents, ct);
        }

        // Send outbid notification to the previous high bidder (fire-and-forget)
        if (previousHighBidderId.HasValue)
            _ = Task.Run(() => SendOutbidNotificationAsync(
                previousHighBidderId.Value, item.Title, req.AmountCents, CancellationToken.None));

        if (closedByBuyNow)
            await CloseItemInternalAsync(item, ct);

        return new BidResponse
        {
            Id            = bid.Id,
            AuctionItemId = itemId,
            PlayerId      = req.PlayerId,
            AmountCents   = req.AmountCents,
            PlacedAt      = bid.PlacedAt,
            IsWinning     = !isDonation && item.CurrentHighBidCents == req.AmountCents,
            NewClosesAt   = newClosesAt,
        };
    }

    public async Task<BidResponse> PledgeAsync(Guid itemId, PledgeRequest req, CancellationToken ct)
        => await PlaceBidAsync(itemId, new PlaceBidRequest
        {
            PlayerId    = req.PlayerId,
            AmountCents = req.AmountCents,
        }, ct);

    public async Task AwardItemAsync(Guid itemId, AwardRequest req, CancellationToken ct)
    {
        var item = await _db.AuctionItems
            .Include(i => i.Event)
            .FirstOrDefaultAsync(i => i.Id == itemId, ct)
            ?? throw new NotFoundException("AuctionItem", itemId);

        if (item.Status is AuctionItemStatus.Closed or AuctionItemStatus.Awarded)
            throw new ValidationException("Item is already closed.");

        item.Status = AuctionItemStatus.Awarded;

        var winner = new AuctionWinner
        {
            Id            = Guid.NewGuid(),
            AuctionItemId = itemId,
            PlayerId      = req.PlayerId,
            AmountCents   = req.AmountCents,
            ChargeStatus  = ChargeStatus.Pending,
            CreatedAt     = DateTime.UtcNow,
        };
        _db.AuctionWinners.Add(winner);
        await _db.SaveChangesAsync(ct);

        await _realTime.SendItemClosedAsync(item.Event.EventCode, itemId, req.PlayerId, req.AmountCents, ct);

        await ChargeWinnersForItemAsync(itemId, ct);
    }

    // ── CLOSE JOB (called by Hangfire every 10s) ───────────────────────────────

    public async Task ProcessExpiredItemsAsync(CancellationToken ct = default)
    {
        var expired = await _db.AuctionItems
            .Include(i => i.Event)
            .Where(i => (i.Status == AuctionItemStatus.Open || i.Status == AuctionItemStatus.Extended)
                     && i.ClosesAt != null
                     && i.ClosesAt <= DateTime.UtcNow)
            .ToListAsync(ct);

        foreach (var item in expired)
        {
            await CloseItemInternalAsync(item, ct);
        }
    }

    private async Task CloseItemInternalAsync(AuctionItem item, CancellationToken ct)
    {
        item.Status = AuctionItemStatus.Closed;

        var isDonation = item.AuctionType is AuctionType.DonationSilent or AuctionType.DonationLive;

        if (isDonation)
        {
            // One winner row per pledger
            var bids = await _db.Bids
                .Where(b => b.AuctionItemId == item.Id)
                .ToListAsync(ct);

            foreach (var bid in bids)
            {
                _db.AuctionWinners.Add(new AuctionWinner
                {
                    Id            = Guid.NewGuid(),
                    AuctionItemId = item.Id,
                    PlayerId      = bid.PlayerId,
                    AmountCents   = bid.AmountCents,
                    ChargeStatus  = ChargeStatus.Pending,
                    CreatedAt     = DateTime.UtcNow,
                });
            }
        }
        else
        {
            // Highest single bid wins
            var topBid = await _db.Bids
                .Where(b => b.AuctionItemId == item.Id)
                .OrderByDescending(b => b.AmountCents)
                .FirstOrDefaultAsync(ct);

            if (topBid is not null)
            {
                _db.AuctionWinners.Add(new AuctionWinner
                {
                    Id            = Guid.NewGuid(),
                    AuctionItemId = item.Id,
                    PlayerId      = topBid.PlayerId,
                    AmountCents   = topBid.AmountCents,
                    ChargeStatus  = ChargeStatus.Pending,
                    CreatedAt     = DateTime.UtcNow,
                });
            }
        }

        await _db.SaveChangesAsync(ct);

        if (!string.IsNullOrEmpty(item.Event?.EventCode))
        {
            var winner = await _db.AuctionWinners
                .Where(w => w.AuctionItemId == item.Id)
                .OrderByDescending(w => w.AmountCents)
                .FirstOrDefaultAsync(ct);

            await _realTime.SendItemClosedAsync(
                item.Event.EventCode, item.Id,
                winner?.PlayerId, winner?.AmountCents ?? 0, ct);
        }

        await ChargeWinnersForItemAsync(item.Id, ct);
    }

    private async Task ChargeWinnersForItemAsync(Guid itemId, CancellationToken ct)
    {
        var winners = await _db.AuctionWinners
            .Where(w => w.AuctionItemId == itemId && w.ChargeStatus == ChargeStatus.Pending)
            .ToListAsync(ct);

        foreach (var winner in winners)
        {
            try
            {
                await _payments.ChargeWinnerAsync(winner.Id, ct);
            }
            catch (Exception ex)
            {
                winner.ChargeStatus = ChargeStatus.Failed;
                await _db.SaveChangesAsync(ct);
                _logger.LogError(ex, "Charge failed for winner {WinnerId}", winner.Id);
            }
        }
    }

    // ── SESSIONS ───────────────────────────────────────────────────────────────

    public async Task<AuctionSessionResponse> StartSessionAsync(
        Guid orgId, Guid eventId, CancellationToken ct)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        // End any previous active session
        var active = await _db.AuctionSessions
            .Where(s => s.EventId == eventId && s.IsActive)
            .ToListAsync(ct);
        foreach (var s in active) { s.IsActive = false; s.EndedAt = DateTime.UtcNow; }

        var session = new AuctionSession
        {
            Id        = Guid.NewGuid(),
            EventId   = eventId,
            IsActive  = true,
            StartedAt = DateTime.UtcNow,
        };
        _db.AuctionSessions.Add(session);
        await _db.SaveChangesAsync(ct);

        var evt = await _db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is not null)
            await _realTime.SendLiveAuctionStartedAsync(evt.EventCode, session.Id, ct);

        return MapSession(session);
    }

    public async Task<AuctionSessionResponse> AdvanceItemAsync(
        Guid orgId, Guid eventId, CancellationToken ct)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var session = await _db.AuctionSessions
            .FirstOrDefaultAsync(s => s.EventId == eventId && s.IsActive, ct)
            ?? throw new NotFoundException("Active AuctionSession for event", eventId);

        // Find next open live-auction item (by display order, after current)
        var currentOrder = session.CurrentItemId.HasValue
            ? (await _db.AuctionItems.FindAsync(new object[] { session.CurrentItemId.Value }, ct))?.DisplayOrder ?? -1
            : -1;

        var nextItem = await _db.AuctionItems
            .Where(i => i.EventId == eventId
                     && (i.AuctionType == AuctionType.Live || i.AuctionType == AuctionType.DonationLive)
                     && (i.Status == AuctionItemStatus.Open || i.Status == AuctionItemStatus.Extended)
                     && i.DisplayOrder > currentOrder)
            .OrderBy(i => i.DisplayOrder)
            .FirstOrDefaultAsync(ct);

        session.CurrentItemId            = nextItem?.Id;
        session.CurrentCalledAmountCents = nextItem?.StartingBidCents ?? 0;
        session.CurrentBidderCount       = 0;
        await _db.SaveChangesAsync(ct);

        var evt = await _db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is not null)
            await _realTime.SendLiveItemAdvancedAsync(evt.EventCode, session.CurrentItemId, ct);

        return MapSession(session);
    }

    public async Task<AuctionSessionResponse> UpdateCalledAmountAsync(
        Guid orgId, Guid eventId, int amountCents, CancellationToken ct)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var session = await _db.AuctionSessions
            .FirstOrDefaultAsync(s => s.EventId == eventId && s.IsActive, ct)
            ?? throw new NotFoundException("Active AuctionSession for event", eventId);

        session.CurrentCalledAmountCents = amountCents;
        await _db.SaveChangesAsync(ct);

        var evt = await _db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is not null)
            await _realTime.SendAuctionAmountUpdatedAsync(evt.EventCode, session.CurrentItemId, amountCents, ct);

        return MapSession(session);
    }

    public async Task<AuctionSessionResponse?> GetActiveSessionAsync(Guid eventId, CancellationToken ct)
    {
        var session = await _db.AuctionSessions
            .FirstOrDefaultAsync(s => s.EventId == eventId && s.IsActive, ct);
        return session is null ? null : MapSession(session);
    }

    // ── BID HISTORY ────────────────────────────────────────────────────────────

    public async Task<List<PlayerBidHistoryItem>> GetPlayerBidsAsync(
        Guid playerId, CancellationToken ct)
    {
        var bids = await _db.Bids
            .Include(b => b.AuctionItem)
            .Where(b => b.PlayerId == playerId)
            .OrderByDescending(b => b.PlacedAt)
            .ToListAsync(ct);

        return bids.Select(b =>
        {
            var isDonation = b.AuctionItem.AuctionType is AuctionType.DonationSilent or AuctionType.DonationLive;
            string status;
            if (isDonation)
            {
                status = (b.AuctionItem.Status == AuctionItemStatus.Open || b.AuctionItem.Status == AuctionItemStatus.Extended)
                    ? "Pledged" : "Charged";
            }
            else if (b.AuctionItem.Status == AuctionItemStatus.Open || b.AuctionItem.Status == AuctionItemStatus.Extended)
            {
                status = b.AmountCents >= b.AuctionItem.CurrentHighBidCents ? "Winning" : "Outbid";
            }
            else
            {
                var didWin = _db.AuctionWinners
                    .Any(w => w.AuctionItemId == b.AuctionItemId && w.PlayerId == playerId);
                status = didWin ? "Won" : "Lost";
            }

            return new PlayerBidHistoryItem
            {
                AuctionItemId = b.AuctionItemId,
                ItemTitle     = b.AuctionItem.Title,
                AmountCents   = b.AmountCents,
                Status        = status,
                PlacedAt      = b.PlacedAt,
            };
        }).ToList();
    }

    // ── RAISE HAND (soft paddle) ───────────────────────────────────────────────

    public async Task<int> RaiseHandAsync(Guid eventId, CancellationToken ct)
    {
        var session = await _db.AuctionSessions
            .FirstOrDefaultAsync(s => s.EventId == eventId && s.IsActive, ct)
            ?? throw new NotFoundException("Active AuctionSession for event", eventId);

        session.CurrentBidderCount++;
        await _db.SaveChangesAsync(ct);

        var evt = await _db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is not null)
            await _realTime.SendBidderCountUpdatedAsync(evt.EventCode, session.CurrentBidderCount, ct);

        return session.CurrentBidderCount;
    }

    // ── FAILED CHARGE RESOLUTION ───────────────────────────────────────────────

    public async Task<List<FailedChargeResponse>> GetFailedChargesAsync(
        Guid orgId, Guid eventId, CancellationToken ct)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var rows = await _db.AuctionWinners
            .Include(w => w.AuctionItem)
            .Include(w => w.Player)
            .Where(w => w.AuctionItem.EventId == eventId && w.ChargeStatus == ChargeStatus.Failed)
            .ToListAsync(ct);

        return rows.Select(w => new FailedChargeResponse
        {
            WinnerId              = w.Id,
            AuctionItemId         = w.AuctionItemId,
            ItemTitle             = w.AuctionItem.Title,
            PlayerName            = $"{w.Player.FirstName} {w.Player.LastName}",
            PlayerEmail           = w.Player.Email,
            AmountCents           = w.AmountCents,
            StripePaymentIntentId = w.StripePaymentIntentId ?? string.Empty,
            FailedAt              = w.CreatedAt,
        }).ToList();
    }

    public async Task RechargeWinnerAsync(Guid orgId, Guid winnerId, CancellationToken ct)
    {
        var winner = await _db.AuctionWinners
            .Include(w => w.AuctionItem).ThenInclude(i => i.Event)
            .FirstOrDefaultAsync(w => w.Id == winnerId, ct)
            ?? throw new NotFoundException("AuctionWinner", winnerId);

        await VerifyEventOwnershipAsync(orgId, winner.AuctionItem.EventId, ct);

        if (winner.ChargeStatus != ChargeStatus.Failed)
            throw new ValidationException("Only failed charges can be re-attempted.");

        winner.ChargeStatus = ChargeStatus.Pending;
        await _db.SaveChangesAsync(ct);

        await _payments.ChargeWinnerAsync(winnerId, ct);
    }

    public async Task WaiveChargeAsync(Guid orgId, Guid winnerId, CancellationToken ct)
    {
        var winner = await _db.AuctionWinners
            .Include(w => w.AuctionItem)
            .FirstOrDefaultAsync(w => w.Id == winnerId, ct)
            ?? throw new NotFoundException("AuctionWinner", winnerId);

        await VerifyEventOwnershipAsync(orgId, winner.AuctionItem.EventId, ct);

        if (winner.ChargeStatus is ChargeStatus.Succeeded or ChargeStatus.Waived)
            throw new ValidationException("Charge is already resolved.");

        winner.ChargeStatus = ChargeStatus.Waived;
        await _db.SaveChangesAsync(ct);
    }

    // ── PRIVATE HELPERS ────────────────────────────────────────────────────────

    private async Task VerifyEventOwnershipAsync(Guid orgId, Guid eventId, CancellationToken ct)
    {
        var exists = await _db.Events.AnyAsync(e => e.Id == eventId && e.OrgId == orgId, ct);
        if (!exists) throw new NotFoundException("Event", eventId);
    }

    private async Task<Domain.Entities.AuctionItem> GetItemOrThrowAsync(
        Guid itemId, Guid eventId, CancellationToken ct)
    {
        var item = await _db.AuctionItems
            .FirstOrDefaultAsync(i => i.Id == itemId && i.EventId == eventId, ct);
        if (item is null) throw new NotFoundException("AuctionItem", itemId);
        return item;
    }

    private static AuctionItemResponse MapItem(Domain.Entities.AuctionItem i)
    {
        var photos = string.IsNullOrEmpty(i.PhotoUrlsJson)
            ? new List<string>()
            : JsonSerializer.Deserialize<List<string>>(i.PhotoUrlsJson) ?? new();

        List<int>? denominations = null;
        if (!string.IsNullOrEmpty(i.DonationDenominationsJson))
            denominations = JsonSerializer.Deserialize<List<int>>(i.DonationDenominationsJson);

        return new AuctionItemResponse
        {
            Id                    = i.Id,
            EventId               = i.EventId,
            Title                 = i.Title,
            Description           = i.Description,
            PhotoUrls             = photos,
            AuctionType           = i.AuctionType.ToString(),
            Status                = i.Status.ToString(),
            StartingBidCents      = i.StartingBidCents,
            BidIncrementCents     = i.BidIncrementCents,
            BuyNowPriceCents      = i.BuyNowPriceCents,
            CurrentHighBidCents   = i.CurrentHighBidCents,
            ClosesAt              = i.ClosesAt,
            MaxExtensionMin       = i.MaxExtensionMin,
            DisplayOrder          = i.DisplayOrder,
            DonationDenominations = denominations,
            MinimumBidCents       = i.MinimumBidCents,
            FairMarketValueCents  = i.FairMarketValueCents,
            GoalCents             = i.GoalCents,
            TotalRaisedCents      = i.CurrentHighBidCents,
        };
    }

    private static AuctionSessionResponse MapSession(AuctionSession s) => new()
    {
        Id                       = s.Id,
        EventId                  = s.EventId,
        IsActive                 = s.IsActive,
        CurrentItemId            = s.CurrentItemId,
        CurrentCalledAmountCents = s.CurrentCalledAmountCents,
        CurrentBidderCount       = s.CurrentBidderCount,
        StartedAt                = s.StartedAt,
        EndedAt                  = s.EndedAt,
    };

    private async Task SendOutbidNotificationAsync(
        Guid playerId, string itemTitle, int newBidCents, CancellationToken ct)
    {
        try
        {
            var player = await _db.Players.FirstOrDefaultAsync(p => p.Id == playerId, ct);
            if (player is null) return;

            if (!string.IsNullOrEmpty(player.ExpoPushToken))
            {
                await _push.SendAsync(
                    new[] { player.ExpoPushToken },
                    "You've been outbid!",
                    $"Someone bid ${newBidCents / 100.0:F2} on \"{itemTitle}\". Bid again to stay in the lead.",
                    new Dictionary<string, string> { ["type"] = "outbid", ["itemTitle"] = itemTitle },
                    ct);
            }

            var amountFormatted = $"${newBidCents / 100.0:F2}";
            var html = $"""
                <p>Hi {player.FirstName},</p>
                <p>You've been outbid on <strong>{itemTitle}</strong>. The new high bid is <strong>{amountFormatted}</strong>.</p>
                <p>Log back into the app to place a new bid and stay in the lead!</p>
                """;
            await _email.SendTransactionalAsync(
                player.Email,
                $"{player.FirstName} {player.LastName}",
                $"You've been outbid on \"{itemTitle}\"",
                html,
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Outbid notification failed for player {PlayerId}", playerId);
        }
    }
}
