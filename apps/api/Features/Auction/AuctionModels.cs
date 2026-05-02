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
}

public record BidResponse
{
    public Guid     Id             { get; init; }
    public Guid     AuctionItemId  { get; init; }
    public Guid     PlayerId       { get; init; }
    public int      AmountCents    { get; init; }
    public DateTime PlacedAt       { get; init; }
    public bool     IsWinning      { get; init; }
    public DateTime? NewClosesAt   { get; init; }
}

public record PledgeRequest
{
    [Required]
    public Guid PlayerId    { get; init; }
    [Required]
    public int  AmountCents { get; init; }
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
    public DateTime StartedAt              { get; init; }
    public DateTime? EndedAt              { get; init; }
}

public record UpdateCalledAmountRequest
{
    [Required]
    public int AmountCents { get; init; }
}
