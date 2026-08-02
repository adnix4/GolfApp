using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.Auction;

// ── AUCTION CHECKOUT ───────────────────────────────────────────────────────────
//
// Winners are no longer charged the moment a lot closes; they settle at a
// checkout desk when they collect the item. These are the shapes that desk (and
// the golfer's own "you won" screen) runs on.
//
// Fund-a-Need lots never appear here. A pledge has nothing to collect and is
// charged on close, so routing pledgers to a desk to claim nothing would be
// friction; a pledge whose charge fails surfaces on the existing failed-charges
// screen instead.

/// <summary>One line of the desk queue — everything one winner owes, collapsed.</summary>
public record CheckoutDeskRow
{
    public Guid   PlayerId         { get; init; }
    public string PlayerName       { get; init; } = string.Empty;
    public string PlayerEmail      { get; init; } = string.Empty;

    public int    ItemsWon         { get; init; }
    public int    ItemsPickedUp    { get; init; }

    public int    TotalCents       { get; init; }
    public int    SettledCents     { get; init; }
    public int    OutstandingCents { get; init; }

    /// <summary>False for a winner who bid on a checked-in waiver and never saved a card.</summary>
    public bool   HasPaymentMethod { get; init; }

    /// <summary>Paid in full AND everything handed over — the row can leave the queue.</summary>
    public bool   IsComplete       { get; init; }
}

/// <summary>Everything one winner owes, itemised. Shared by the desk and the golfer's own view.</summary>
public record CheckoutCartResponse
{
    public Guid   PlayerId         { get; init; }
    public string PlayerName       { get; init; } = string.Empty;
    public string PlayerEmail      { get; init; } = string.Empty;
    public bool   HasPaymentMethod { get; init; }

    public int    TotalCents       { get; init; }
    public int    SettledCents     { get; init; }
    public int    OutstandingCents { get; init; }

    public List<CheckoutLine> Lines { get; init; } = [];
}

public record CheckoutLine
{
    public Guid   WinnerId         { get; init; }
    public Guid   AuctionItemId    { get; init; }
    public string ItemTitle        { get; init; } = string.Empty;
    public int    AmountCents      { get; init; }

    /// <summary>Pending / Succeeded / Failed / Waived.</summary>
    public string ChargeStatus     { get; init; } = string.Empty;

    /// <summary>Card / Cash / Check, or null until settled.</summary>
    public string? SettlementMethod { get; init; }

    public DateTime? CheckedOutAt  { get; init; }
    public DateTime? PickedUpAt    { get; init; }
}

/// <summary>Settles a winner's whole cart in one go at the desk.</summary>
public record SettleCheckoutRequest
{
    public SettlementMethod Method       { get; init; }

    /// <summary>Hand the items over at the same time — the common case at a desk.</summary>
    public bool             MarkPickedUp { get; init; }
}

public record SettleCheckoutResult
{
    /// <summary>Lines that moved from Pending to Succeeded in this call.</summary>
    public int Settled     { get; init; }

    /// <summary>Lines whose card charge failed; they stay outstanding and appear on the failed-charges screen.</summary>
    public int Failed      { get; init; }

    /// <summary>Amount actually collected in this call.</summary>
    public int SettledCents { get; init; }

    /// <summary>Cart state after settling, so the desk needs no follow-up fetch.</summary>
    public CheckoutCartResponse Cart { get; init; } = new();
}

/// <summary>The golfer confirming their own payment method from the app.</summary>
public record ConfirmCheckoutRequest
{
    public string SessionToken { get; init; } = string.Empty;
}
