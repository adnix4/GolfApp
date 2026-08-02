using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Payments;

namespace GolfFundraiserPro.Api.Features.Auction;

/// <summary>
/// The auction checkout desk.
///
/// Closing a lot records a Pending winner and charges nobody (see
/// AuctionService.CloseItemInternalAsync). This is where the money actually
/// moves: the winner turns up, collects the item, and settles by card on file,
/// a card entered at the desk, cash, or check. Staff can complete it on a
/// golfer's behalf, and a golfer with the app can confirm their own card before
/// they arrive.
///
/// Payment and handover are tracked separately throughout, because they come
/// apart in practice — someone pays in the app and collects an hour later, or
/// takes the item and settles on the way out.
/// </summary>
public class AuctionCheckoutService
{
    private readonly ApplicationDbContext _db;
    private readonly PaymentsService _payments;
    private readonly ILogger<AuctionCheckoutService> _logger;

    public AuctionCheckoutService(
        ApplicationDbContext db,
        PaymentsService payments,
        ILogger<AuctionCheckoutService> logger)
    {
        _db       = db;
        _payments = payments;
        _logger   = logger;
    }

    // ── STAFF: THE DESK ───────────────────────────────────────────────────────

    /// <summary>
    /// The checkout queue for an event: one row per winning golfer. Doubles as
    /// the organizer's settlement report — who owes what, and what has gone out
    /// the door.
    /// </summary>
    public async Task<List<CheckoutDeskRow>> GetDeskAsync(
        Guid orgId, Guid eventId, CancellationToken ct = default)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var winners = await LoadCollectableWinnersAsync(eventId, null, ct);

        return winners
            .GroupBy(w => w.PlayerId)
            .Select(g =>
            {
                var player = g.First().Player;
                var settledCents = g.Where(IsSettled).Sum(w => w.AmountCents);
                return new CheckoutDeskRow
                {
                    PlayerId         = g.Key,
                    PlayerName       = PlayerName(player),
                    PlayerEmail      = player?.Email ?? string.Empty,
                    ItemsWon         = g.Count(),
                    ItemsPickedUp    = g.Count(w => w.PickedUpAt is not null),
                    TotalCents       = g.Sum(w => w.AmountCents),
                    SettledCents     = settledCents,
                    OutstandingCents = g.Where(w => !IsSettled(w)).Sum(w => w.AmountCents),
                    HasPaymentMethod = player?.HasPaymentMethod ?? false,
                    IsComplete       = g.All(w => IsSettled(w) && w.PickedUpAt is not null),
                };
            })
            // Unfinished business first, then biggest balance — the order the
            // desk actually works the queue in.
            .OrderBy(r => r.IsComplete)
            .ThenByDescending(r => r.OutstandingCents)
            .ThenBy(r => r.PlayerName)
            .ToList();
    }

    /// <summary>One winner's itemised cart, for the desk.</summary>
    public async Task<CheckoutCartResponse> GetCartAsync(
        Guid orgId, Guid eventId, Guid playerId, CancellationToken ct = default)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);
        return await BuildCartAsync(eventId, playerId, ct);
    }

    /// <summary>
    /// Settles everything a winner owes, in one call.
    /// </summary>
    /// <remarks>
    /// Idempotent by construction: only Pending and Failed lines are touched, so
    /// re-running after a partial failure retries exactly what is still owed and
    /// never double-charges a card. Cash and check never reach Stripe at all,
    /// which is also what lets the desk work with no Stripe key configured.
    /// </remarks>
    public async Task<SettleCheckoutResult> SettleAsync(
        Guid orgId, Guid eventId, Guid playerId,
        SettleCheckoutRequest req, Guid? settledByUserId,
        CancellationToken ct = default)
    {
        await VerifyEventOwnershipAsync(orgId, eventId, ct);

        var winners  = await LoadCollectableWinnersAsync(eventId, playerId, ct);
        if (winners.Count == 0)
            throw new NotFoundException("AuctionWinner", playerId);

        var outstanding = winners.Where(w => !IsSettled(w)).ToList();
        var now         = DateTime.UtcNow;
        var settled     = 0;
        var failed      = 0;
        var settledCents = 0;

        foreach (var winner in outstanding)
        {
            if (req.Method == SettlementMethod.Card)
            {
                try
                {
                    await _payments.ChargeWinnerAsync(winner.Id, ct);
                    // ChargeWinnerAsync writes the charge status from Stripe's
                    // answer; anything short of success stays outstanding.
                    await _db.Entry(winner).ReloadAsync(ct);
                    if (winner.ChargeStatus != ChargeStatus.Succeeded) { failed++; continue; }
                }
                catch (Exception ex)
                {
                    winner.ChargeStatus = ChargeStatus.Failed;
                    await _db.SaveChangesAsync(ct);
                    _logger.LogWarning(
                        ex, "Checkout card charge failed for winner {WinnerId}", winner.Id);
                    failed++;
                    continue;
                }
            }
            else
            {
                // Cash or check handed over at the desk. Recorded, not charged —
                // the same shape as the desk-staff entry fee override.
                winner.ChargeStatus = ChargeStatus.Succeeded;
            }

            winner.SettlementMethod = req.Method;
            winner.CheckedOutAt     = now;
            winner.SettledByUserId  = settledByUserId;
            settled++;
            settledCents += winner.AmountCents;
        }

        if (req.MarkPickedUp)
        {
            // Handing over an item the winner has not paid for is a judgement
            // call the desk is allowed to make, so this is not gated on payment.
            foreach (var winner in winners.Where(w => w.PickedUpAt is null))
                winner.PickedUpAt = now;
        }

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Checkout: player {PlayerId} on event {EventId} settled {Settled} line(s) "
            + "({Cents}c) by {Method}, {Failed} failed",
            playerId, eventId, settled, settledCents, req.Method, failed);

        return new SettleCheckoutResult
        {
            Settled      = settled,
            Failed       = failed,
            SettledCents = settledCents,
            Cart         = await BuildCartAsync(eventId, playerId, ct),
        };
    }

    /// <summary>
    /// Marks one item handed over, independently of payment — for the guest who
    /// paid in the app and collects later, or collects now and pays later.
    /// </summary>
    public async Task MarkPickedUpAsync(
        Guid orgId, Guid winnerId, CancellationToken ct = default)
    {
        var winner = await _db.AuctionWinners
            .Include(w => w.AuctionItem).ThenInclude(i => i.Event)
            .FirstOrDefaultAsync(w => w.Id == winnerId, ct)
            ?? throw new NotFoundException("AuctionWinner", winnerId);

        if (winner.AuctionItem?.Event?.OrgId != orgId)
            throw new NotFoundException("AuctionWinner", winnerId);

        // Idempotent: keep the first handover time rather than resetting it.
        winner.PickedUpAt ??= DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
    }

    // ── GOLFER: SELF-SERVICE ──────────────────────────────────────────────────

    /// <summary>
    /// What the golfer won and owes. Authorized by the session token minted at
    /// /join — golfers have no password, so this is what proves it is them.
    /// </summary>
    public async Task<CheckoutCartResponse> GetPlayerCartAsync(
        Guid playerId, string? sessionToken, CancellationToken ct = default)
    {
        var player = await VerifyPlayerAsync(playerId, sessionToken, ct);
        return await BuildCartAsync(player.EventId, playerId, ct);
    }

    /// <summary>
    /// The golfer confirms their saved card and pays for everything they won.
    /// </summary>
    /// <remarks>
    /// Card only. Cash and check are things staff physically receive, so they
    /// are never self-serviceable. A golfer with no card on file is told to add
    /// one rather than being silently failed.
    /// </remarks>
    public async Task<SettleCheckoutResult> ConfirmPlayerCheckoutAsync(
        Guid playerId, string? sessionToken, CancellationToken ct = default)
    {
        var player = await VerifyPlayerAsync(playerId, sessionToken, ct);

        if (!player.HasPaymentMethod)
            throw new ValidationException("NO_PAYMENT_METHOD");

        var evt = await _db.Events.FirstOrDefaultAsync(e => e.Id == player.EventId, ct)
            ?? throw new NotFoundException("Event", player.EventId);

        // Self-service, so no staff member settled it.
        return await SettleAsync(
            evt.OrgId, player.EventId, playerId,
            new SettleCheckoutRequest { Method = SettlementMethod.Card, MarkPickedUp = false },
            settledByUserId: null,
            ct);
    }

    // ── HELPERS ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Winners with something to collect: everything for the event except
    /// Fund-a-Need pledges, which are charged on close and have no item.
    /// Cancelled lots drop out too — nothing was sold.
    /// </summary>
    private async Task<List<AuctionWinner>> LoadCollectableWinnersAsync(
        Guid eventId, Guid? playerId, CancellationToken ct)
    {
        var query = _db.AuctionWinners
            .Include(w => w.Player)
            .Include(w => w.AuctionItem)
            .Where(w => w.AuctionItem.EventId == eventId
                     && w.AuctionItem.AuctionType != AuctionType.DonationSilent
                     && w.AuctionItem.AuctionType != AuctionType.DonationLive
                     && w.AuctionItem.Status != AuctionItemStatus.Cancelled);

        if (playerId is Guid p) query = query.Where(w => w.PlayerId == p);

        return await query.ToListAsync(ct);
    }

    private async Task<CheckoutCartResponse> BuildCartAsync(
        Guid eventId, Guid playerId, CancellationToken ct)
    {
        var winners = await LoadCollectableWinnersAsync(eventId, playerId, ct);

        var player = winners.FirstOrDefault()?.Player
            ?? await _db.Players.FirstOrDefaultAsync(p => p.Id == playerId, ct);

        return new CheckoutCartResponse
        {
            PlayerId         = playerId,
            PlayerName       = PlayerName(player),
            PlayerEmail      = player?.Email ?? string.Empty,
            HasPaymentMethod = player?.HasPaymentMethod ?? false,
            TotalCents       = winners.Sum(w => w.AmountCents),
            SettledCents     = winners.Where(IsSettled).Sum(w => w.AmountCents),
            OutstandingCents = winners.Where(w => !IsSettled(w)).Sum(w => w.AmountCents),
            Lines = winners
                .OrderBy(w => w.AuctionItem?.Title)
                .Select(w => new CheckoutLine
                {
                    WinnerId         = w.Id,
                    AuctionItemId    = w.AuctionItemId,
                    ItemTitle        = w.AuctionItem?.Title ?? string.Empty,
                    AmountCents      = w.AmountCents,
                    ChargeStatus     = w.ChargeStatus.ToString(),
                    SettlementMethod = w.SettlementMethod?.ToString(),
                    CheckedOutAt     = w.CheckedOutAt,
                    PickedUpAt       = w.PickedUpAt,
                })
                .ToList(),
        };
    }

    private async Task<Player> VerifyPlayerAsync(
        Guid playerId, string? sessionToken, CancellationToken ct)
    {
        var player = await _db.Players.FirstOrDefaultAsync(p => p.Id == playerId, ct)
            ?? throw new NotFoundException("Player", playerId);

        // Fail closed, and give a wrong token the same answer as a wrong id so
        // the endpoint cannot be used to probe for real players.
        if (!Common.PlayerSessionAuth.Matches(player.SessionToken, sessionToken))
            throw new NotFoundException("Player", playerId);

        return player;
    }

    /// <summary>
    /// Settled = the money question is answered. A waived charge counts: the
    /// organizer decided nothing is owed, so the desk should stop chasing it.
    /// </summary>
    private static bool IsSettled(AuctionWinner w) =>
        w.ChargeStatus is ChargeStatus.Succeeded or ChargeStatus.Waived;

    private static string PlayerName(Player? p) =>
        p is null ? string.Empty : $"{p.FirstName} {p.LastName}".Trim();

    private async Task VerifyEventOwnershipAsync(Guid orgId, Guid eventId, CancellationToken ct)
    {
        var exists = await _db.Events.AnyAsync(e => e.Id == eventId && e.OrgId == orgId, ct);
        if (!exists) throw new NotFoundException("Event", eventId);
    }
}
