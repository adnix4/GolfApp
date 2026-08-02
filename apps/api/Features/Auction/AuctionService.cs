using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Common.Storage;
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
    private readonly IFileStorage _storage;
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
        IFileStorage storage,
        ILogger<AuctionService> logger)
    {
        _db       = db;
        _realTime = realTime;
        _payments = payments;
        _email    = email;
        _push     = push;
        _storage  = storage;
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
        var donationTotals = await GetDonationTotalsAsync(items, ct);
        return items.Select(i => MapItem(i, donationTotals)).ToList();
    }

    public async Task<List<AuctionItemResponse>> GetPublicItemsAsync(
        Guid eventId, CancellationToken ct)
    {
        var items = await _db.AuctionItems
            .Where(i => i.EventId == eventId
                     && (i.Status == AuctionItemStatus.Open || i.Status == AuctionItemStatus.Extended))
            .OrderBy(i => i.DisplayOrder).ThenBy(i => i.CreatedAt)
            .ToListAsync(ct);
        var donationTotals = await GetDonationTotalsAsync(items, ct);
        return items.Select(i => MapItem(i, donationTotals)).ToList();
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

        // Auction type may only change while the item is still Open with no bids.
        // Switching a bid-on or closed item would strand existing bids and confuse
        // the silent-close / live-award flows, so we reject it with a clear message.
        if (req.AuctionType is not null)
        {
            if (!Enum.TryParse<AuctionType>(req.AuctionType, ignoreCase: true, out var newType))
                throw new ValidationException($"Unknown auction_type '{req.AuctionType}'.");

            if (newType != item.AuctionType)
            {
                if (item.Status is AuctionItemStatus.Closed or AuctionItemStatus.Awarded
                                or AuctionItemStatus.Cancelled)
                    throw new ValidationException(
                        "This item is closed or awarded, so its auction type can no longer be changed.");

                if (await _db.Bids.AnyAsync(b => b.AuctionItemId == itemId, ct))
                    throw new ValidationException(
                        "This item already has bids, so its auction type can't be changed. " +
                        "Cancel it and add a new item with the type you need.");

                item.AuctionType = newType;
            }
        }

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
        return MapItem(item, await GetDonationTotalsAsync(new[] { item }, ct));
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
        await using var stream = file.OpenReadStream();
        var url      = await _storage.SaveAsync("auction-photos", filename, stream, file.ContentType, ct: ct);

        var existing = JsonSerializer.Deserialize<List<string>>(
                           string.IsNullOrEmpty(item.PhotoUrlsJson) ? "[]" : item.PhotoUrlsJson)
                       ?? new List<string>();
        existing.Add(url);
        item.PhotoUrlsJson = JsonSerializer.Serialize(existing);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Photo uploaded for auction item {ItemId}: {Url}", itemId, url);
        return MapItem(item, await GetDonationTotalsAsync(new[] { item }, ct));
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

        // Authorization: bids (and thus the off-session charge if won) must be made
        // by the player themselves — verify the session token minted at /join.
        if (!Common.PlayerSessionAuth.Matches(player.SessionToken, req.SessionToken))
            throw new NotFoundException("Player", req.PlayerId);

        if (AuctionBidRules.NeedsPaymentMethod(player.HasPaymentMethod, player.CheckInStatus))
            throw new ValidationException("NO_PAYMENT_METHOD");

        var isDonation = item.AuctionType is AuctionType.DonationSilent or AuctionType.DonationLive;
        var usesProxy  = AuctionBidRules.UsesProxyBidding(item.AuctionType);

        var minRequired = AuctionBidRules.MinimumRequired(
            item.AuctionType, item.StartingBidCents, item.BidIncrementCents,
            item.CurrentHighBidCents, item.MinimumBidCents);

        if (req.AmountCents < minRequired)
            throw new ValidationException($"BID_TOO_LOW:{minRequired}");

        // Capture the outgoing leader before we overwrite (for outbid notification).
        Guid? previousHighBidderId = null;
        List<AuctionBidRules.ProxyBid>? proxyBids = null;

        if (usesProxy)
        {
            // The whole ladder, not just the top row: under proxy bidding the
            // price is a function of every standing max, so a single bid can
            // move it without becoming the new high max.
            var rows = await _db.Bids
                .Where(b => b.AuctionItemId == itemId)
                .Select(b => new { b.PlayerId, b.AmountCents, b.PlacedAt })
                .ToListAsync(ct);
            proxyBids = rows
                .Select(r => new AuctionBidRules.ProxyBid(r.PlayerId, r.AmountCents, r.PlacedAt))
                .ToList();

            previousHighBidderId = AuctionBidRules
                .ResolveProxy(proxyBids, item.StartingBidCents, item.BidIncrementCents)
                .LeaderPlayerId;
        }
        else if (!isDonation && item.CurrentHighBidCents > 0 && req.AmountCents > item.CurrentHighBidCents)
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

        Guid? leaderId = null;
        if (usesProxy)
        {
            proxyBids!.Add(new AuctionBidRules.ProxyBid(req.PlayerId, req.AmountCents, now0));
            var state = AuctionBidRules.ResolveProxy(
                proxyBids, item.StartingBidCents, item.BidIncrementCents);
            leaderId = state.LeaderPlayerId;

            // Buy-now is a purchase at the posted price, not a proxy duel: the
            // amount typed is still a private ceiling, and posting (or charging)
            // it would bill the buyer above the advertised price.
            item.CurrentHighBidCents = closedByBuyNow
                ? item.BuyNowPriceCents!.Value
                : state.PriceCents;

            // Only a genuine change of hands is an outbid. A golfer raising
            // their own max, or one whose max lands under the standing leader's,
            // leaves the holder where they were.
            if (previousHighBidderId == leaderId || previousHighBidderId == req.PlayerId)
                previousHighBidderId = null;
        }
        else if (!isDonation)
        {
            item.CurrentHighBidCents = Math.Max(item.CurrentHighBidCents, req.AmountCents);
        }

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

            // Broadcast the PUBLIC price, never the submitted amount: under proxy
            // bidding that amount is the bidder's private ceiling, and the hub
            // fans this payload out to every client joined to the event.
            await _realTime.SendBidPlacedAsync(evt.EventCode, itemId, req.PlayerId,
                usesProxy ? item.CurrentHighBidCents : req.AmountCents, isDonation, ct);

            if (isDonation)
            {
                var total = await _db.Bids
                    .Where(b => b.AuctionItemId == itemId)
                    .SumAsync(b => b.AmountCents, ct);
                await _realTime.SendAuctionTotalUpdatedAsync(evt.EventCode, itemId, total, ct);
            }

            if (closedByBuyNow)
                await _realTime.SendItemClosedAsync(
                    evt.EventCode, itemId, req.PlayerId, item.CurrentHighBidCents, ct);
        }

        // Send outbid notification to the previous high bidder (fire-and-forget).
        // Quotes the public price for the same reason the hub payload does.
        if (previousHighBidderId.HasValue)
            _ = Task.Run(() => SendOutbidNotificationAsync(
                previousHighBidderId.Value, item.Title, item.CurrentHighBidCents, CancellationToken.None));

        if (closedByBuyNow)
            await CloseItemInternalAsync(item, ct);

        return new BidResponse
        {
            Id                  = bid.Id,
            AuctionItemId       = itemId,
            PlayerId            = req.PlayerId,
            AmountCents         = req.AmountCents,
            PlacedAt            = bid.PlacedAt,
            IsWinning           = usesProxy
                ? leaderId == req.PlayerId
                : !isDonation && item.CurrentHighBidCents == req.AmountCents,
            CurrentHighBidCents = item.CurrentHighBidCents,
            NewClosesAt         = newClosesAt,
        };
    }

    public async Task<BidResponse> PledgeAsync(Guid itemId, PledgeRequest req, CancellationToken ct)
        => await PlaceBidAsync(itemId, new PlaceBidRequest
        {
            PlayerId     = req.PlayerId,
            AmountCents  = req.AmountCents,
            SessionToken = req.SessionToken,
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

        // Awarded on stage, paid at the checkout desk — same as every other
        // competitive lot. See CloseItemInternalAsync for why closing no longer
        // charges.
        await NotifyWinnersAsync(item, ct);
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

    // ── END AUCTION (organizer settlement) ────────────────────────────────────

    /// <summary>
    /// Shows what ending the auction right now would do, without doing it.
    /// </summary>
    public Task<AuctionEndSummary> PreviewEndAuctionAsync(
        Guid orgId, Guid eventId, CancellationToken ct = default) =>
        EndAuctionCoreAsync(orgId, eventId, commit: false, ct);

    /// <summary>
    /// Ends the auction: closes every silent and Fund-a-Need lot still taking
    /// bids, regardless of its timer, and ends the live session if one is
    /// running.
    /// </summary>
    /// <remarks>
    /// Live lots are deliberately left Open — see ParkedLiveLot. The rest close
    /// through the ordinary close path, so proxy ladders, ties, buy-now pricing
    /// and Fund-a-Need multi-winners all behave exactly as they do on the timer.
    ///
    /// Idempotent: with nothing left open this is a no-op returning zeroes, so a
    /// double tap at the end of a long night cannot do damage.
    /// </remarks>
    public Task<AuctionEndSummary> EndAuctionAsync(
        Guid orgId, Guid eventId, CancellationToken ct = default) =>
        EndAuctionCoreAsync(orgId, eventId, commit: true, ct);

    private async Task<AuctionEndSummary> EndAuctionCoreAsync(
        Guid orgId, Guid eventId, bool commit, CancellationToken ct)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var open = await _db.AuctionItems
            .Include(i => i.Event)
            .Where(i => i.EventId == eventId
                     && (i.Status == AuctionItemStatus.Open || i.Status == AuctionItemStatus.Extended))
            .ToListAsync(ct);

        // A Live lot with a timer set is treated as timed, not as an on-stage
        // lot: the timer is what the bidders were watching.
        var parked = open
            .Where(i => i.AuctionType == AuctionType.Live && i.ClosesAt is null)
            .ToList();

        var closing = open.Except(parked).ToList();

        var lotsSold           = 0;
        var winnersCreated     = 0;
        var outstandingCents   = 0;
        var playersWinning     = new HashSet<Guid>();

        foreach (var item in closing)
        {
            var resolved = await ResolveWinnersAsync(item, ct);
            if (resolved.Count > 0) lotsSold++;
            winnersCreated += resolved.Count;

            // Fund-a-Need pledges charge on close, so they are never owed at the
            // desk and must not inflate the figure the organizer settles against.
            var isDonation = item.AuctionType is AuctionType.DonationSilent or AuctionType.DonationLive;
            if (!isDonation)
            {
                outstandingCents += resolved.Sum(r => r.AmountCents);
                foreach (var (playerId, _) in resolved) playersWinning.Add(playerId);
            }

            if (commit) await CloseItemInternalAsync(item, ct);
        }

        var withoutCard = playersWinning.Count == 0
            ? 0
            : await _db.Players
                .Where(p => playersWinning.Contains(p.Id) && !p.HasPaymentMethod)
                .CountAsync(ct);

        var liveSessionRunning = await _db.AuctionSessions
            .AnyAsync(s => s.EventId == eventId && s.IsActive, ct);

        if (commit && liveSessionRunning)
            await EndSessionAsync(orgId, eventId, ct);

        if (commit)
        {
            _logger.LogInformation(
                "Auction ended for event {EventId}: {Closed} lots closed ({Sold} sold), "
                + "{Winners} winners owing {Cents}c, {Parked} live lots awaiting award",
                eventId, closing.Count, lotsSold, winnersCreated, outstandingCents, parked.Count);
        }

        return new AuctionEndSummary
        {
            LotsClosed          = closing.Count,
            LotsSold            = lotsSold,
            LotsUnsold          = closing.Count - lotsSold,
            WinnersCreated      = winnersCreated,
            OutstandingCents    = outstandingCents,
            WinnersWithoutCard  = withoutCard,
            LiveSessionEnded    = liveSessionRunning,
            LiveLotsAwaitingAward = parked
                .OrderBy(i => i.Title)
                .Select(i => new ParkedLiveLot
                {
                    ItemId              = i.Id,
                    Title               = i.Title,
                    CurrentHighBidCents = i.CurrentHighBidCents,
                })
                .ToList(),
        };
    }

    /// <summary>
    /// Works out who wins a lot and at what price, WITHOUT writing anything.
    /// Returns one entry per winner — several for a Fund-a-Need, one or none for
    /// a competitive lot.
    ///
    /// Extracted so the End Auction preview can tell the organizer exactly what
    /// closing would produce, using the same code that then produces it. A
    /// preview computed by a parallel implementation would drift, and this is
    /// the number people settle money against.
    /// </summary>
    private async Task<List<(Guid PlayerId, int AmountCents)>> ResolveWinnersAsync(
        AuctionItem item, CancellationToken ct)
    {
        var winners = new List<(Guid, int)>();

        if (item.AuctionType is AuctionType.DonationSilent or AuctionType.DonationLive)
        {
            // Fund-a-Need: everyone who pledged wins, at their own amount.
            var bids = await _db.Bids
                .Where(b => b.AuctionItemId == item.Id)
                .Select(b => new { b.PlayerId, b.AmountCents })
                .ToListAsync(ct);

            winners.AddRange(bids.Select(b => (b.PlayerId, b.AmountCents)));
        }
        else if (AuctionBidRules.UsesProxyBidding(item.AuctionType))
        {
            // Proxy item: the highest max holds it, but it sells at the PUBLIC
            // price the ladder settled on — charging the winner's ceiling would
            // bill them well above the figure the board showed all evening.
            var rows = await _db.Bids
                .Where(b => b.AuctionItemId == item.Id)
                .Select(b => new { b.PlayerId, b.AmountCents, b.PlacedAt })
                .ToListAsync(ct);

            var state = AuctionBidRules.ResolveProxy(
                rows.Select(r => new AuctionBidRules.ProxyBid(r.PlayerId, r.AmountCents, r.PlacedAt)),
                item.StartingBidCents, item.BidIncrementCents);

            if (state.LeaderPlayerId is Guid winnerId)
            {
                // CurrentHighBidCents is kept in step with the ladder on every
                // bid; a buy-now sale overwrites it with the posted price, which
                // ResolveProxy has no way to know about, so prefer the column.
                winners.Add((
                    winnerId,
                    item.CurrentHighBidCents > 0 ? item.CurrentHighBidCents : state.PriceCents));
            }
        }
        else
        {
            // Highest single bid wins; an exact tie goes to whoever got there first.
            var topBid = await _db.Bids
                .Where(b => b.AuctionItemId == item.Id)
                .OrderByDescending(b => b.AmountCents)
                .ThenBy(b => b.PlacedAt)
                .Select(b => new { b.PlayerId, b.AmountCents })
                .FirstOrDefaultAsync(ct);

            if (topBid is not null)
                winners.Add((topBid.PlayerId, topBid.AmountCents));
        }

        return winners;
    }

    /// <summary>
    /// Closes one lot: works out who won, records them, and tells them.
    ///
    /// Deliberately does NOT charge competitive lots. The winner settles at the
    /// checkout desk when they collect the item, so nobody is billed for a lot
    /// they never picked up, a winner with no saved card can still pay, and a 3DS
    /// challenge happens with the cardholder standing there to answer it.
    /// Fund-a-Need pledges are the exception — there is nothing to collect, so
    /// they charge on close exactly as before.
    /// </summary>
    private async Task CloseItemInternalAsync(AuctionItem item, CancellationToken ct)
    {
        var isDonation = item.AuctionType is AuctionType.DonationSilent or AuctionType.DonationLive;
        var resolved   = await ResolveWinnersAsync(item, ct);

        foreach (var (playerId, amountCents) in resolved)
        {
            _db.AuctionWinners.Add(new AuctionWinner
            {
                Id            = Guid.NewGuid(),
                AuctionItemId = item.Id,
                PlayerId      = playerId,
                AmountCents   = amountCents,
                ChargeStatus  = ChargeStatus.Pending,
                CreatedAt     = DateTime.UtcNow,
            });
        }

        // A lot nobody bid on has no winner to charge and nothing to hand over.
        // Calling that "Closed" made it indistinguishable from a sold lot, so the
        // organizer had no way to see what failed to sell and could be re-offered.
        item.Status = resolved.Count > 0
            ? AuctionItemStatus.Closed
            : AuctionItemStatus.Unsold;

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

        if (isDonation)
        {
            // Fund-a-Need: the pledger named their own amount and has nothing to
            // collect, so there is no desk visit to wait for.
            await ChargeWinnersForItemAsync(item.Id, ct);
        }
        else
        {
            // Competitive lot: the winner pays at checkout. Tell them they won —
            // until now the only signal was a Stripe receipt that may never arrive.
            await NotifyWinnersAsync(item, ct);
        }
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

    /// <summary>
    /// Ends the running live auction session.
    /// </summary>
    /// <remarks>
    /// The organizer's "the auction is over" signal. Until this existed,
    /// IsActive only ever flipped as a side effect of STARTING the next session,
    /// so a finished auction stayed "in progress" on every attendee screen for
    /// the rest of the event. This is deliberately independent of event status:
    /// the round ending and the auction ending are two different moments.
    /// Idempotent — ending an already-ended auction is not an error.
    /// </remarks>
    public async Task<AuctionSessionResponse?> EndSessionAsync(
        Guid orgId, Guid eventId, CancellationToken ct)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var active = await _db.AuctionSessions
            .Where(s => s.EventId == eventId && s.IsActive)
            .ToListAsync(ct);

        if (active.Count == 0) return null;

        var now = DateTime.UtcNow;
        foreach (var s in active)
        {
            s.IsActive       = false;
            s.EndedAt        = now;
            s.CurrentItemId  = null;
        }
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Live auction session ended for event {EventId}", eventId);

        // Reuse the advance signal with no item so every attendee screen drops
        // out of "current item" mode rather than freezing on the last lot.
        var evt = await _db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is not null)
            await _realTime.SendLiveItemAdvancedAsync(evt.EventCode, null, ct);

        return MapSession(active[^1]);
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

        // Winning/Outbid on a proxy item can't be read off the golfer's own row.
        // Their amount is a private ceiling that normally sits ABOVE the public
        // price, so the naive "my amount >= current high" test calls every
        // trailing bidder a winner; and on a tied max both golfers sit exactly at
        // the price while only the earlier one holds the item. Resolve the ladder
        // once per open Silent item instead.
        var openProxyItems = bids
            .Select(b => b.AuctionItem)
            .Where(i => AuctionBidRules.UsesProxyBidding(i.AuctionType)
                     && i.Status is AuctionItemStatus.Open or AuctionItemStatus.Extended)
            .DistinctBy(i => i.Id)
            .ToList();

        var proxyLeaders = await ResolveProxyLeadersAsync(openProxyItems, ct);

        // Only a golfer's standing (highest) max can be the winning one — an
        // earlier, lower bid of their own is superseded, not still in the running.
        var myMaxByItem = bids
            .GroupBy(b => b.AuctionItemId)
            .ToDictionary(g => g.Key, g => g.Max(b => b.AmountCents));

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
                status = AuctionBidRules.UsesProxyBidding(b.AuctionItem.AuctionType)
                    ? (proxyLeaders.GetValueOrDefault(b.AuctionItemId) == playerId
                       && b.AmountCents == myMaxByItem[b.AuctionItemId]
                        ? "Winning" : "Outbid")
                    : b.AmountCents >= b.AuctionItem.CurrentHighBidCents ? "Winning" : "Outbid";
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
                AuctionType   = b.AuctionItem.AuctionType.ToString(),
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

    /// <summary>
    /// Pledges on a Fund-a-Need STACK rather than outbid, so PlaceBidAsync only
    /// writes CurrentHighBidCents for competitive items and the column
    /// stays 0 on a donation item forever. The running total is the sum of the
    /// item's bids — the same reasoning already written out in
    /// EventService.GetAuctionRevenueAsync, and the same query shape.
    /// One query for the whole page: MapItem runs per item, so a lookup inside
    /// the map would be an N+1.
    /// </summary>
    private async Task<Dictionary<Guid, int>> GetDonationTotalsAsync(
        IReadOnlyCollection<Domain.Entities.AuctionItem> items, CancellationToken ct)
    {
        var donationIds = items
            .Where(i => i.AuctionType is AuctionType.DonationSilent or AuctionType.DonationLive)
            .Select(i => i.Id)
            .ToHashSet();

        if (donationIds.Count == 0) return new Dictionary<Guid, int>();

        var pledges = await _db.Bids
            .AsNoTracking()
            .Where(b => donationIds.Contains(b.AuctionItemId))
            .Select(b => new { b.AuctionItemId, b.AmountCents })
            .ToListAsync(ct);

        return pledges
            .GroupBy(b => b.AuctionItemId)
            .ToDictionary(g => g.Key, g => g.Sum(b => b.AmountCents));
    }

    /// <summary>
    /// Maps each proxy item to the golfer currently holding it. One query for the
    /// whole set — the caller has a list of items, so a lookup per item would be
    /// an N+1 (same reasoning as GetDonationTotalsAsync).
    /// </summary>
    private async Task<Dictionary<Guid, Guid?>> ResolveProxyLeadersAsync(
        IReadOnlyCollection<Domain.Entities.AuctionItem> items, CancellationToken ct)
    {
        var leaders = new Dictionary<Guid, Guid?>();
        if (items.Count == 0) return leaders;

        var itemIds = items.Select(i => i.Id).ToHashSet();
        var rows = await _db.Bids
            .AsNoTracking()
            .Where(b => itemIds.Contains(b.AuctionItemId))
            .Select(b => new { b.AuctionItemId, b.PlayerId, b.AmountCents, b.PlacedAt })
            .ToListAsync(ct);

        var byItem = rows.ToLookup(r => r.AuctionItemId);
        foreach (var item in items)
        {
            leaders[item.Id] = AuctionBidRules.ResolveProxy(
                byItem[item.Id].Select(r =>
                    new AuctionBidRules.ProxyBid(r.PlayerId, r.AmountCents, r.PlacedAt)),
                item.StartingBidCents, item.BidIncrementCents).LeaderPlayerId;
        }
        return leaders;
    }

    private static AuctionItemResponse MapItem(
        Domain.Entities.AuctionItem i,
        IReadOnlyDictionary<Guid, int>? donationTotals = null)
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
            TotalRaisedCents      = i.AuctionType is AuctionType.DonationSilent
                                                  or AuctionType.DonationLive
                ? (donationTotals is not null
                   && donationTotals.TryGetValue(i.Id, out var pledged) ? pledged : 0)
                : i.CurrentHighBidCents,
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

    /// <summary>
    /// Tells everyone who won a lot that they won it, and to settle up at
    /// checkout. Fire-and-forget alongside the close, like the outbid notice —
    /// a dead push token must never hold up closing an auction.
    ///
    /// Before this existed the winner's only notice was the Stripe receipt after
    /// the automatic charge, so a winner whose charge failed (or who had no card)
    /// heard nothing at all.
    /// </summary>
    private async Task NotifyWinnersAsync(AuctionItem item, CancellationToken ct)
    {
        List<AuctionWinner> winners;
        try
        {
            winners = await _db.AuctionWinners
                .Include(w => w.Player)
                .Where(w => w.AuctionItemId == item.Id && w.CheckedOutAt == null)
                .ToListAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not load winners to notify for item {ItemId}", item.Id);
            return;
        }

        foreach (var winner in winners)
        {
            var player = winner.Player;
            if (player is null) continue;

            var amount = $"${winner.AmountCents / 100.0:F2}";

            try
            {
                if (!string.IsNullOrEmpty(player.ExpoPushToken))
                {
                    await _push.SendAsync(
                        new[] { player.ExpoPushToken },
                        "You won!",
                        $"You won \"{item.Title}\" for {amount}. Visit checkout to collect and pay.",
                        new Dictionary<string, string>
                        {
                            ["type"]      = "auctionWon",
                            ["itemTitle"] = item.Title,
                        },
                        ct);
                }

                var html = $"""
                    <p>Hi {player.FirstName},</p>
                    <p>Congratulations — you won <strong>{item.Title}</strong> for <strong>{amount}</strong>.</p>
                    <p>Stop by the auction checkout desk to collect your item and settle up. You can also
                    confirm your payment method in the app before you get there.</p>
                    """;
                await _email.SendTransactionalAsync(
                    player.Email,
                    $"{player.FirstName} {player.LastName}",
                    $"You won \"{item.Title}\"!",
                    html,
                    ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    ex, "Win notification failed for winner {WinnerId}", winner.Id);
            }
        }
    }
}
