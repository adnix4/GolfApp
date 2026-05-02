using Xunit;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Auction;

namespace WebAPI.Tests;

// ── IsItemClosed ──────────────────────────────────────────────────────────────

public class IsItemClosedTests
{
    [Fact]
    public void Open_item_with_future_closes_at_is_not_closed()
    {
        var now = DateTime.UtcNow;
        var result = AuctionBidRules.IsItemClosed(AuctionItemStatus.Open, now.AddMinutes(5), now);
        Assert.False(result);
    }

    [Fact]
    public void Open_item_with_no_closes_at_is_not_closed()
    {
        var result = AuctionBidRules.IsItemClosed(AuctionItemStatus.Open, null, DateTime.UtcNow);
        Assert.False(result);
    }

    [Fact]
    public void Open_item_whose_closes_at_is_in_the_past_is_closed()
    {
        var now = DateTime.UtcNow;
        var result = AuctionBidRules.IsItemClosed(AuctionItemStatus.Open, now.AddSeconds(-1), now);
        Assert.True(result);
    }

    [Fact]
    public void Open_item_whose_closes_at_equals_now_is_closed()
    {
        var now = DateTime.UtcNow;
        var result = AuctionBidRules.IsItemClosed(AuctionItemStatus.Open, now, now);
        Assert.True(result);
    }

    [Fact]
    public void Cancelled_item_is_always_closed()
    {
        var result = AuctionBidRules.IsItemClosed(AuctionItemStatus.Cancelled, null, DateTime.UtcNow);
        Assert.True(result);
    }

    [Fact]
    public void Closed_item_is_always_closed()
    {
        var result = AuctionBidRules.IsItemClosed(AuctionItemStatus.Closed, DateTime.UtcNow.AddHours(1), DateTime.UtcNow);
        Assert.True(result);
    }
}

// ── NeedsPaymentMethod ────────────────────────────────────────────────────────

public class NeedsPaymentMethodTests
{
    [Fact]
    public void Player_with_payment_method_does_not_need_one()
    {
        Assert.False(AuctionBidRules.NeedsPaymentMethod(true, CheckInStatus.Pending));
    }

    [Fact]
    public void Checked_in_player_without_payment_method_is_allowed()
    {
        Assert.False(AuctionBidRules.NeedsPaymentMethod(false, CheckInStatus.CheckedIn));
    }

    [Fact]
    public void Non_checked_in_player_without_payment_method_is_blocked()
    {
        Assert.True(AuctionBidRules.NeedsPaymentMethod(false, CheckInStatus.Pending));
    }
}

// ── MinimumRequired ───────────────────────────────────────────────────────────

public class MinimumRequiredTests
{
    // Silent / Live auction (competitive)

    [Fact]
    public void Silent_no_bids_yet_returns_starting_bid()
    {
        var min = AuctionBidRules.MinimumRequired(AuctionType.Silent, 5000, 500, 0, null);
        Assert.Equal(5000, min);
    }

    [Fact]
    public void Silent_existing_bids_returns_current_high_plus_increment()
    {
        // currentHigh=5000, increment=500 → min=5500; startingBid=1000 < 5500 so max wins
        var min = AuctionBidRules.MinimumRequired(AuctionType.Silent, 1000, 500, 5000, null);
        Assert.Equal(5500, min);
    }

    [Fact]
    public void Silent_starting_bid_beats_current_high_plus_increment()
    {
        // startingBid=10000, currentHigh=0+500=500 → min=10000
        var min = AuctionBidRules.MinimumRequired(AuctionType.Silent, 10000, 500, 0, null);
        Assert.Equal(10000, min);
    }

    [Fact]
    public void Live_uses_same_competitive_rule_as_silent()
    {
        var min = AuctionBidRules.MinimumRequired(AuctionType.Live, 2000, 1000, 8000, null);
        Assert.Equal(9000, min);
    }

    // Donation (Fund-a-Need)

    [Fact]
    public void Donation_silent_uses_minimum_bid_cents_when_set()
    {
        var min = AuctionBidRules.MinimumRequired(AuctionType.DonationSilent, 5000, 500, 0, 2500);
        Assert.Equal(2500, min);
    }

    [Fact]
    public void Donation_silent_falls_back_to_starting_bid_when_minimum_not_set()
    {
        var min = AuctionBidRules.MinimumRequired(AuctionType.DonationSilent, 5000, 500, 0, null);
        Assert.Equal(5000, min);
    }

    [Fact]
    public void Donation_live_ignores_current_high_bid()
    {
        // Donation items allow multiple pledges regardless of previous amounts
        var min = AuctionBidRules.MinimumRequired(AuctionType.DonationLive, 1000, 500, 50000, 500);
        Assert.Equal(500, min);
    }

    [Fact]
    public void Donation_minimum_zero_when_both_minimum_bid_and_starting_bid_are_zero()
    {
        var min = AuctionBidRules.MinimumRequired(AuctionType.DonationSilent, 0, 0, 0, null);
        Assert.Equal(0, min);
    }
}

// ── IsBuyNow ──────────────────────────────────────────────────────────────────

public class IsBuyNowTests
{
    [Fact]
    public void Exactly_at_buy_now_price_triggers_buy_now()
    {
        Assert.True(AuctionBidRules.IsBuyNow(10000, 10000));
    }

    [Fact]
    public void Above_buy_now_price_triggers_buy_now()
    {
        Assert.True(AuctionBidRules.IsBuyNow(10000, 15000));
    }

    [Fact]
    public void Below_buy_now_price_does_not_trigger()
    {
        Assert.False(AuctionBidRules.IsBuyNow(10000, 9999));
    }

    [Fact]
    public void Null_buy_now_price_never_triggers()
    {
        Assert.False(AuctionBidRules.IsBuyNow(null, 999999));
    }
}

// ── ComputeExtension ──────────────────────────────────────────────────────────

public class ComputeExtensionTests
{
    [Fact]
    public void Extension_fires_when_bid_placed_within_30s_window()
    {
        var originalClose = new DateTime(2026, 6, 1, 20, 0, 0, DateTimeKind.Utc);
        var closesAt      = originalClose; // not yet extended
        var now           = originalClose.AddSeconds(-15); // 15s before close → within window

        var result = AuctionBidRules.ComputeExtension(closesAt, originalClose, 10, now);

        Assert.NotNull(result);
        Assert.Equal(now.AddSeconds(30), result!.Value);
    }

    [Fact]
    public void No_extension_when_bid_placed_outside_30s_window()
    {
        var originalClose = new DateTime(2026, 6, 1, 20, 0, 0, DateTimeKind.Utc);
        var closesAt      = originalClose;
        var now           = originalClose.AddSeconds(-45); // 45s before close → outside window

        var result = AuctionBidRules.ComputeExtension(closesAt, originalClose, 10, now);

        Assert.Null(result);
    }

    [Fact]
    public void Extension_capped_at_ceiling_when_30s_would_exceed_max()
    {
        var originalClose = new DateTime(2026, 6, 1, 20, 0, 0, DateTimeKind.Utc);
        // Already extended to 9min 50s past original → only 10s left before ceiling
        var closesAt      = originalClose.AddMinutes(9).AddSeconds(50);
        var now           = closesAt.AddSeconds(-15); // inside the 30s window

        var ceiling = originalClose.AddMinutes(10);
        var result  = AuctionBidRules.ComputeExtension(closesAt, originalClose, 10, now);

        Assert.NotNull(result);
        // now + 30s would be 10min 5s past original, which exceeds ceiling → capped
        Assert.Equal(ceiling, result!.Value);
    }

    [Fact]
    public void No_extension_when_already_at_ceiling()
    {
        var originalClose = new DateTime(2026, 6, 1, 20, 0, 0, DateTimeKind.Utc);
        var ceiling       = originalClose.AddMinutes(10);
        // closesAt is exactly at the ceiling → closesAt < ceiling is false → no extension
        var now           = ceiling.AddSeconds(-15);

        var result = AuctionBidRules.ComputeExtension(ceiling, originalClose, 10, now);

        Assert.Null(result);
    }

    [Fact]
    public void No_extension_when_closes_at_is_null()
    {
        var result = AuctionBidRules.ComputeExtension(null, new DateTime(2026, 6, 1, 20, 0, 0, DateTimeKind.Utc), 10, DateTime.UtcNow);
        Assert.Null(result);
    }

    [Fact]
    public void No_extension_when_original_closes_at_is_null()
    {
        var closesAt = new DateTime(2026, 6, 1, 20, 0, 0, DateTimeKind.Utc);
        var result   = AuctionBidRules.ComputeExtension(closesAt, null, 10, closesAt.AddSeconds(-15));
        Assert.Null(result);
    }

    [Fact]
    public void Extended_closes_at_is_always_in_the_future_relative_to_now()
    {
        var originalClose = new DateTime(2026, 6, 1, 20, 0, 0, DateTimeKind.Utc);
        var now           = originalClose.AddSeconds(-10);

        var result = AuctionBidRules.ComputeExtension(originalClose, originalClose, 10, now);

        Assert.NotNull(result);
        Assert.True(result!.Value > now);
    }
}
