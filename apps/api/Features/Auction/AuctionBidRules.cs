using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.Auction;

/// <summary>
/// Pure, stateless bid-validation helpers — no DB, no DI, fully unit-testable.
/// </summary>
public static class AuctionBidRules
{
    public static bool IsItemClosed(AuctionItemStatus status, DateTime? closesAt, DateTime now)
        => (status != AuctionItemStatus.Open && status != AuctionItemStatus.Extended)
           || (closesAt.HasValue && closesAt.Value <= now);

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

    // ── PROXY (MAX) BIDDING ────────────────────────────────────────────────────

    /// <summary>
    /// True for item types where a submitted amount is a private ceiling the
    /// server bids up to on the golfer's behalf, rather than the bid itself.
    /// </summary>
    /// <remarks>
    /// Silent items only. A Live lot is called out loud by an auctioneer, so a
    /// hidden max would put the app and the room on different numbers, and
    /// Fund-a-Need pledges stack rather than compete — there is nothing to
    /// outbid. Both keep the literal "you bid what you typed" behavior.
    /// </remarks>
    public static bool UsesProxyBidding(AuctionType auctionType)
        => auctionType == AuctionType.Silent;

    /// <summary>One golfer's standing ceiling on an item, and when they set it.</summary>
    public readonly record struct ProxyBid(Guid PlayerId, int MaxCents, DateTime PlacedAt);

    /// <summary>Who holds the item, and the price everyone is allowed to see.</summary>
    public readonly record struct ProxyState(Guid? LeaderPlayerId, int PriceCents);

    /// <summary>
    /// Resolves a set of max bids into the public price and the golfer holding
    /// the item.
    /// </summary>
    /// <remarks>
    /// The price is one increment above the best <em>losing</em> max, capped at
    /// the leader's own max — so a golfer only ever pays enough to beat the
    /// room, never their whole ceiling. With a single bidder the price is the
    /// opening bid: their max is a ceiling, not an offer.
    ///
    /// When the top two maxes tie, the cap and the step meet at the tied amount
    /// and the earlier bid holds the item at it — the sort below is
    /// (max desc, placed asc), so "first one in wins the tie" falls out of the
    /// ordering rather than needing a special case.
    ///
    /// Maxes are collapsed per golfer first: raising your own max competes with
    /// the room, not with your earlier self, so it must not push the price up.
    /// The timestamp kept is the EARLIEST bid that reached a golfer's top
    /// amount, so re-entering the same number later can't buy back a tie-break
    /// already lost.
    /// </remarks>
    public static ProxyState ResolveProxy(
        IEnumerable<ProxyBid> bids,
        int startingBidCents,
        int bidIncrementCents)
    {
        var standing = bids
            .GroupBy(b => b.PlayerId)
            .Select(g =>
            {
                var top = g.Max(b => b.MaxCents);
                return new ProxyBid(g.Key, top, g.Where(b => b.MaxCents == top).Min(b => b.PlacedAt));
            })
            .OrderByDescending(b => b.MaxCents)
            .ThenBy(b => b.PlacedAt)
            .ToList();

        // No bids: leave the price at 0 so MinimumRequired still demands the
        // full starting bid from the first golfer through the door.
        if (standing.Count == 0) return new ProxyState(null, 0);

        var leader = standing[0];
        var stepTo = standing.Count == 1
            ? startingBidCents
            : standing[1].MaxCents + bidIncrementCents;

        var price = Math.Min(leader.MaxCents, Math.Max(startingBidCents, stepTo));
        return new ProxyState(leader.PlayerId, price);
    }

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
