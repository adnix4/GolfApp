using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.Auction;

/// <summary>
/// Pure, stateless bid-validation helpers — no DB, no DI, fully unit-testable.
/// </summary>
public static class AuctionBidRules
{
    public static bool IsItemClosed(AuctionItemStatus status, DateTime? closesAt, DateTime now)
        => status != AuctionItemStatus.Open || (closesAt.HasValue && closesAt.Value <= now);

    public static bool NeedsPaymentMethod(bool hasPaymentMethod, CheckInStatus checkInStatus)
        => !hasPaymentMethod && checkInStatus != CheckInStatus.CheckedIn;

    /// <summary>
    /// Returns the minimum valid bid amount in cents for this item.
    /// For donation items this is minimumBidCents ?? startingBidCents.
    /// For competitive items this is Max(startingBidCents, currentHighBidCents + bidIncrementCents).
    /// </summary>
    public static int MinimumRequired(
        AuctionType auctionType,
        int startingBidCents,
        int bidIncrementCents,
        int currentHighBidCents,
        int? minimumBidCents)
    {
        bool isDonation = auctionType is AuctionType.DonationSilent or AuctionType.DonationLive;
        return isDonation
            ? (minimumBidCents ?? startingBidCents)
            : Math.Max(startingBidCents, currentHighBidCents + bidIncrementCents);
    }

    public static bool IsBuyNow(int? buyNowPriceCents, int amountCents)
        => buyNowPriceCents.HasValue && amountCents >= buyNowPriceCents.Value;

    /// <summary>
    /// Returns the new ClosesAt if the bid-extension rule fires (bid placed within 30s of close),
    /// capped at originalClosesAt + maxExtensionMin. Returns null if no extension applies.
    /// </summary>
    public static DateTime? ComputeExtension(
        DateTime? closesAt,
        DateTime? originalClosesAt,
        int maxExtensionMin,
        DateTime now)
    {
        if (!closesAt.HasValue || !originalClosesAt.HasValue) return null;

        var ceiling       = originalClosesAt.Value.AddMinutes(maxExtensionMin);
        var thirtySecMark = closesAt.Value.AddSeconds(-30);

        if (now > thirtySecMark && closesAt.Value < ceiling)
        {
            var extended = now.AddSeconds(30);
            return extended < ceiling ? extended : ceiling;
        }

        return null;
    }
}
