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

// ── ResolveProxy ──────────────────────────────────────────────────────────────

public class ResolveProxyTests
{
    private static readonly DateTime T0 = new(2026, 8, 1, 18, 0, 0, DateTimeKind.Utc);

    private static readonly Guid Ann = Guid.Parse("00000000-0000-0000-0000-0000000000a1");
    private static readonly Guid Bo  = Guid.Parse("00000000-0000-0000-0000-0000000000b2");
    private static readonly Guid Cal = Guid.Parse("00000000-0000-0000-0000-0000000000c3");

    private static AuctionBidRules.ProxyBid Bid(Guid player, int cents, int secondsIn)
        => new(player, cents, T0.AddSeconds(secondsIn));

    // Item shape used throughout: opens at $50, increments in $5.
    private static AuctionBidRules.ProxyState Resolve(params AuctionBidRules.ProxyBid[] bids)
        => AuctionBidRules.ResolveProxy(bids, 5000, 500);

    [Fact]
    public void No_bids_leaves_no_leader_and_a_zero_price()
    {
        // Zero, not the starting bid — MinimumRequired adds the increment to this
        // figure, and seeding it with the opening price would demand $55 from the
        // very first golfer on a $50 item.
        var state = Resolve();
        Assert.Null(state.LeaderPlayerId);
        Assert.Equal(0, state.PriceCents);
    }

    [Fact]
    public void Sole_bidder_pays_the_opening_price_not_their_max()
    {
        var state = Resolve(Bid(Ann, 20000, 0));
        Assert.Equal(Ann, state.LeaderPlayerId);
        Assert.Equal(5000, state.PriceCents);
    }

    [Fact]
    public void Challenger_pushes_the_price_one_increment_above_their_own_max()
    {
        // Ann's ceiling is $200, Bo's is $70 → Ann holds it at $75, and $200
        // never becomes visible to anyone.
        var state = Resolve(Bid(Ann, 20000, 0), Bid(Bo, 7000, 10));
        Assert.Equal(Ann, state.LeaderPlayerId);
        Assert.Equal(7500, state.PriceCents);
    }

    [Fact]
    public void Price_is_capped_at_the_leaders_max_when_the_step_would_overshoot()
    {
        // Bo's max + increment is $103, above Ann's $102 ceiling → she pays $102.
        var state = Resolve(Bid(Ann, 10200, 0), Bid(Bo, 9800, 10));
        Assert.Equal(Ann, state.LeaderPlayerId);
        Assert.Equal(10200, state.PriceCents);
    }

    [Fact]
    public void Higher_max_takes_the_lead_from_the_standing_holder()
    {
        var state = Resolve(Bid(Ann, 7000, 0), Bid(Bo, 20000, 10));
        Assert.Equal(Bo, state.LeaderPlayerId);
        Assert.Equal(7500, state.PriceCents);
    }

    [Fact]
    public void Tied_maxes_are_held_by_whoever_bid_first_at_the_full_amount()
    {
        // The user's rule verbatim. The step and the cap meet at the tied figure,
        // so the price is the tie itself, not one increment past it.
        var state = Resolve(Bid(Ann, 10000, 0), Bid(Bo, 10000, 10));
        Assert.Equal(Ann, state.LeaderPlayerId);
        Assert.Equal(10000, state.PriceCents);
    }

    [Fact]
    public void Tie_break_ignores_the_order_the_bids_are_supplied_in()
    {
        var state = Resolve(Bid(Bo, 10000, 10), Bid(Ann, 10000, 0));
        Assert.Equal(Ann, state.LeaderPlayerId);
    }

    [Fact]
    public void Raising_your_own_max_does_not_raise_the_price()
    {
        // Ann leads at $75 over Bo's $70. She doubles her ceiling; nothing about
        // the room changed, so the price must not move.
        var before = Resolve(Bid(Ann, 20000, 0), Bid(Bo, 7000, 10));
        var after  = Resolve(Bid(Ann, 20000, 0), Bid(Bo, 7000, 10), Bid(Ann, 40000, 20));

        Assert.Equal(7500, before.PriceCents);
        Assert.Equal(Ann, after.LeaderPlayerId);
        Assert.Equal(7500, after.PriceCents);
    }

    [Fact]
    public void Re_entering_a_tied_amount_later_cannot_win_back_a_lost_tie_break()
    {
        // Ann tied Bo at $100 first and holds it. Bo re-submitting $100 keeps his
        // ORIGINAL timestamp for that amount, so he stays second.
        var state = Resolve(Bid(Ann, 10000, 0), Bid(Bo, 10000, 10), Bid(Bo, 10000, 20));
        Assert.Equal(Ann, state.LeaderPlayerId);
        Assert.Equal(10000, state.PriceCents);
    }

    [Fact]
    public void Only_the_best_losing_max_sets_the_price_with_three_bidders()
    {
        // Cal's $150 is the runner-up; Bo's $70 is irrelevant once beaten.
        var state = Resolve(Bid(Ann, 30000, 0), Bid(Bo, 7000, 10), Bid(Cal, 15000, 20));
        Assert.Equal(Ann, state.LeaderPlayerId);
        Assert.Equal(15500, state.PriceCents);
    }

    [Fact]
    public void The_leaders_max_caps_the_price_even_below_the_opening_bid()
    {
        // Both maxes sit under the $50 opening. PlaceBidAsync rejects such bids,
        // so this only guards the rule itself: no arrangement of inputs may
        // produce a price above the leader's ceiling — that would charge them
        // more than they agreed to. The floor yields to the cap, never the
        // other way round.
        var state = AuctionBidRules.ResolveProxy(
            new[] { Bid(Ann, 3000, 0), Bid(Bo, 1000, 10) }, 5000, 500);
        Assert.Equal(3000, state.PriceCents);
    }

    [Fact]
    public void Leading_max_wins_even_when_placed_last()
    {
        var state = Resolve(Bid(Ann, 6000, 0), Bid(Bo, 7000, 10), Bid(Cal, 25000, 20));
        Assert.Equal(Cal, state.LeaderPlayerId);
        Assert.Equal(7500, state.PriceCents);
    }
}

// ── UsesProxyBidding ──────────────────────────────────────────────────────────

public class UsesProxyBiddingTests
{
    [Fact]
    public void Silent_items_use_proxy_bidding()
        => Assert.True(AuctionBidRules.UsesProxyBidding(AuctionType.Silent));

    [Theory]
    [InlineData(AuctionType.Live)]
    [InlineData(AuctionType.DonationSilent)]
    [InlineData(AuctionType.DonationLive)]
    public void Every_other_type_bids_literally(AuctionType type)
        => Assert.False(AuctionBidRules.UsesProxyBidding(type));
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
