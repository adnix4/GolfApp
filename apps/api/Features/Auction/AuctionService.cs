using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Payments;
using GolfFundraiserPro.Api.Features.RealTime;

namespace GolfFundraiserPro.Api.Features.Auction;

public class AuctionService
{
    private readonly ApplicationDbContext _db;
    private readonly RealTimeService _realTime;
    private readonly PaymentsService _payments;
    private readonly ILogger<AuctionService> _logger;

    public AuctionService(
        ApplicationDbContext db,
        RealTimeService realTime,
        PaymentsService payments,
        ILogger<AuctionService> logger)
    {
        _db       = db;
        _realTime = realTime;
        _payments = payments;
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
            .Where(i => i.EventId == eventId && i.Status == AuctionItemStatus.Open)
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
        if (item.Status == AuctionItemStatus.Closed)
            throw new ValidationException("Cannot delete a closed auction item.");
        item.Status = AuctionItemStatus.Cancelled;
        await _db.SaveChangesAsync(ct);
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

        if (item.Status != AuctionItemStatus.Open)
            throw new ValidationException("AUCTION_CLOSED");

        if (item.ClosesAt.HasValue && item.ClosesAt.Value <= DateTime.UtcNow)
            throw new ValidationException("AUCTION_CLOSED");

        var player = await _db.Players.FirstOrDefaultAsync(p => p.Id == req.PlayerId, ct)
            ?? throw new NotFoundException("Player", req.PlayerId);

        if (!player.HasPaymentMethod && player.CheckInStatus != CheckInStatus.CheckedIn)
            throw new ValidationException("NO_PAYMENT_METHOD");

        var isDonation = item.AuctionType is AuctionType.DonationSilent or AuctionType.DonationLive;

        if (!isDonation)
        {
            var minRequired = Math.Max(
                item.StartingBidCents,
                item.CurrentHighBidCents + item.BidIncrementCents);

            if (req.AmountCents < minRequired)
                throw new ValidationException($"BID_TOO_LOW:{minRequired}");
        }
        else
        {
            var floor = item.MinimumBidCents ?? item.StartingBidCents;
            if (req.AmountCents < floor)
                throw new ValidationException($"BID_TOO_LOW:{floor}");
        }

        // Buy-now check
        bool closedByBuyNow = false;
        if (item.BuyNowPriceCents.HasValue && req.AmountCents >= item.BuyNowPriceCents.Value)
        {
            item.Status = AuctionItemStatus.Closed;
            closedByBuyNow = true;
        }

        var bid = new Bid
        {
            Id            = Guid.NewGuid(),
            AuctionItemId = itemId,
            PlayerId      = req.PlayerId,
            AmountCents   = req.AmountCents,
            PlacedAt      = DateTime.UtcNow,
        };
        _db.Bids.Add(bid);

        if (!isDonation)
            item.CurrentHighBidCents = Math.Max(item.CurrentHighBidCents, req.AmountCents);

        DateTime? newClosesAt = null;
        if (!closedByBuyNow && item.ClosesAt.HasValue && item.OriginalClosesAt.HasValue)
        {
            var now           = DateTime.UtcNow;
            var ceiling       = item.OriginalClosesAt.Value.AddMinutes(item.MaxExtensionMin);
            var thirtySecMark = item.ClosesAt.Value.AddSeconds(-30);

            if (now > thirtySecMark && item.ClosesAt.Value < ceiling)
            {
                var extended = DateTime.UtcNow.AddSeconds(30);
                item.ClosesAt = extended < ceiling ? extended : ceiling;
                newClosesAt   = item.ClosesAt;
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

        if (item.Status == AuctionItemStatus.Closed)
            throw new ValidationException("Item is already closed.");

        item.Status = AuctionItemStatus.Closed;

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
            .Where(i => i.Status == AuctionItemStatus.Open
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
                     && i.Status == AuctionItemStatus.Open
                     && i.DisplayOrder > currentOrder)
            .OrderBy(i => i.DisplayOrder)
            .FirstOrDefaultAsync(ct);

        session.CurrentItemId            = nextItem?.Id;
        session.CurrentCalledAmountCents = nextItem?.StartingBidCents ?? 0;
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
                status = b.AuctionItem.Status == AuctionItemStatus.Open ? "Pledged" : "Charged";
            }
            else if (b.AuctionItem.Status == AuctionItemStatus.Open)
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
        StartedAt                = s.StartedAt,
        EndedAt                  = s.EndedAt,
    };
}
