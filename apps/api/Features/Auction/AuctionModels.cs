using GolfFundraiserPro.Api.Domain.Enums;
using System.ComponentModel.DataAnnotations;

namespace GolfFundraiserPro.Api.Features.Auction;

// ── AUCTION ITEM ───────────────────────────────────────────────────────────────

public record AuctionItemResponse
{
    public Guid      Id                    { get; init; }
    public Guid      EventId               { get; init; }
    public string    Title                 { get; init; } = string.Empty;
    public string    Description           { get; init; } = string.Empty;
    public List<string> PhotoUrls          { get; init; } = new();
    public string    AuctionType           { get; init; } = string.Empty;
    public string    Status                { get; init; } = string.Empty;
    public int       StartingBidCents      { get; init; }
    public int       BidIncrementCents     { get; init; }
    public int?      BuyNowPriceCents      { get; init; }
    public int       CurrentHighBidCents   { get; init; }
    public DateTime? ClosesAt              { get; init; }
    public int       MaxExtensionMin       { get; init; }
    public int       DisplayOrder          { get; init; }
    public List<int>? DonationDenominations { get; init; }
    public int?      MinimumBidCents       { get; init; }
    public int       FairMarketValueCents  { get; init; }
    public int?      GoalCents             { get; init; }
    public int       TotalRaisedCents      { get; init; }
}

public record CreateAuctionItemRequest
{
    [Required, MaxLength(200)]
    public string    Title                 { get; init; } = string.Empty;
    [MaxLength(2000)]
    public string    Description           { get; init; } = string.Empty;
    public List<string> PhotoUrls          { get; init; } = new();
    [Required]
    public string    AuctionType           { get; init; } = string.Empty;
    public int       StartingBidCents      { get; init; }
    public int       BidIncrementCents     { get; init; } = 500;
    public int?      BuyNowPriceCents      { get; init; }
    public DateTime? ClosesAt              { get; init; }
    public int       MaxExtensionMin       { get; init; } = 10;
    public int       DisplayOrder          { get; init; }
    public List<int>? DonationDenominations { get; init; }
    public int?      MinimumBidCents       { get; init; }
    public int       FairMarketValueCents  { get; init; }
    public int?      GoalCents             { get; init; }
}

public record UpdateAuctionItemRequest
{
    public string?    Title                { get; init; }
    public string?    Description          { get; init; }
    public List<string>? PhotoUrls         { get; init; }
    public string?    AuctionType          { get; init; }
    public int?       StartingBidCents     { get; init; }
    public int?       BidIncrementCents    { get; init; }
    public int?       BuyNowPriceCents     { get; init; }
    public DateTime?  ClosesAt             { get; init; }
    public int?       MaxExtensionMin      { get; init; }
    public int?       DisplayOrder         { get; init; }
    public List<int>? DonationDenominations { get; init; }
    public int?       MinimumBidCents      { get; init; }
    public int?       FairMarketValueCents { get; init; }
    public int?       GoalCents            { get; init; }
}

// ── BID ────────────────────────────────────────────────────────────────────────

public record PlaceBidRequest
{
    [Required]
    public Guid PlayerId    { get; init; }
    [Required]
    public int  AmountCents { get; init; }
    /// <summary>Session token of the bidding player (minted at /join). Verified
    /// server-side so nobody can bid — and incur an off-session charge — in
    /// another player's name.</summary>
    [Required]
    public string SessionToken { get; init; } = string.Empty;
}

public record BidResponse
{
    public Guid     Id             { get; init; }
    public Guid     AuctionItemId  { get; init; }
    public Guid     PlayerId       { get; init; }
    /// <summary>The amount submitted. On a Silent item this is the bidder's own
    /// private maximum, not what the item now stands at — see CurrentHighBidCents.</summary>
    public int      AmountCents    { get; init; }
    public DateTime PlacedAt       { get; init; }
    public bool     IsWinning      { get; init; }
    /// <summary>The item's public price after this bid. Under proxy bidding a bid
    /// can be accepted and still lose, so the client needs both numbers to say
    /// what actually happened.</summary>
    public int      CurrentHighBidCents { get; init; }
    public DateTime? NewClosesAt   { get; init; }
}

public record PledgeRequest
{
    [Required]
    public Guid PlayerId    { get; init; }
    [Required]
    public int  AmountCents { get; init; }
    /// <summary>Session token of the pledging player (minted at /join), verified
    /// server-side.</summary>
    [Required]
    public string SessionToken { get; init; } = string.Empty;
}

public record AwardRequest
{
    [Required]
    public Guid PlayerId    { get; init; }
    [Required]
    public int  AmountCents { get; init; }
}

// ── BID HISTORY ───────────────────────────────────────────────────────────────

public record PlayerBidHistoryItem
{
    public Guid    AuctionItemId   { get; init; }
    public string  ItemTitle       { get; init; } = string.Empty;
    /// <summary>Lets the client label a Silent row "max $X" — on a proxy item the
    /// amount below is the golfer's ceiling, not what the item stands at.</summary>
    public string  AuctionType     { get; init; } = string.Empty;
    public int     AmountCents     { get; init; }
    public string  Status          { get; init; } = string.Empty; // Winning / Outbid / Won / Lost
    public DateTime PlacedAt       { get; init; }
}

// ── AUCTION SESSION ────────────────────────────────────────────────────────────

public record AuctionSessionResponse
{
    public Guid   Id                       { get; init; }
    public Guid   EventId                  { get; init; }
    public bool   IsActive                 { get; init; }
    public Guid?  CurrentItemId            { get; init; }
    public int    CurrentCalledAmountCents { get; init; }
    public int    CurrentBidderCount       { get; init; }
    public DateTime StartedAt              { get; init; }
    public DateTime? EndedAt              { get; init; }
}

public record UpdateCalledAmountRequest
{
    [Required]
    public int AmountCents { get; init; }
}

// ── FAILED CHARGES ─────────────────────────────────────────────────────────────

public record FailedChargeResponse
{
    public Guid   WinnerId             { get; init; }
    public Guid   AuctionItemId        { get; init; }
    public string ItemTitle            { get; init; } = string.Empty;
    public string PlayerName           { get; init; } = string.Empty;
    public string PlayerEmail          { get; init; } = string.Empty;
    public int    AmountCents          { get; init; }
    public string StripePaymentIntentId { get; init; } = string.Empty;
    public DateTime FailedAt           { get; init; }
}

// ── END AUCTION ────────────────────────────────────────────────────────────────
//
// The organizer's end-of-night settlement. Preview and result share one shape on
// purpose: the preview promises what the POST will do, and returning the same
// record makes a mismatch obvious instead of subtle.

public record AuctionEndSummary
{
    /// <summary>Lots that closed (or would close) in this pass.</summary>
    public int LotsClosed        { get; init; }

    /// <summary>Of those, how many had at least one bid and produced a winner.</summary>
    public int LotsSold          { get; init; }

    /// <summary>Of those, how many received no bids at all and end Unsold.</summary>
    public int LotsUnsold        { get; init; }

    /// <summary>Winner rows created (or that would be) — a Fund-a-Need produces one per pledger.</summary>
    public int WinnersCreated    { get; init; }

    /// <summary>Total owed at checkout across those winners, excluding Fund-a-Need pledges which charge on close.</summary>
    public int OutstandingCents  { get; init; }

    /// <summary>
    /// Winners with no card on file. They can still pay at the desk by card,
    /// cash or check — but the organizer wants to know before settling, because
    /// check-in waives the saved-card requirement for bidding.
    /// </summary>
    public int WinnersWithoutCard { get; init; }

    /// <summary>True if a live session was running (and has now been ended).</summary>
    public bool LiveSessionEnded { get; init; }

    /// <summary>
    /// Live lots the host never awarded. Deliberately left Open rather than
    /// force-closed: on-stage bidding is tracked by called amount, not by real
    /// bid rows, so the highest recorded bid may belong to someone who stopped
    /// bidding long before the hammer fell.
    /// </summary>
    public List<ParkedLiveLot> LiveLotsAwaitingAward { get; init; } = [];
}

public record ParkedLiveLot
{
    public Guid   ItemId              { get; init; }
    public string Title               { get; init; } = string.Empty;
    public int    CurrentHighBidCents { get; init; }
}
