using Xunit;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Events;

namespace WebAPI.Tests;

public class EventStatusRulesTests
{
    // ── Valid transitions ───────────────────────────────────────────────────

    [Theory]
    [InlineData(EventStatus.Draft,        EventStatus.Registration)]
    [InlineData(EventStatus.Draft,        EventStatus.Cancelled)]
    [InlineData(EventStatus.Registration, EventStatus.Active)]
    [InlineData(EventStatus.Registration, EventStatus.Cancelled)]
    [InlineData(EventStatus.Active,       EventStatus.Scoring)]
    [InlineData(EventStatus.Active,       EventStatus.Cancelled)]
    [InlineData(EventStatus.Scoring,      EventStatus.Completed)]
    [InlineData(EventStatus.Scoring,      EventStatus.Cancelled)]
    public void CanTransition_returns_true_for_valid_moves(EventStatus from, EventStatus to)
    {
        Assert.True(EventStatusRules.CanTransition(from, to));
    }

    // ── Invalid transitions ─────────────────────────────────────────────────

    [Theory]
    [InlineData(EventStatus.Draft,        EventStatus.Active)]     // skip Registration
    [InlineData(EventStatus.Draft,        EventStatus.Scoring)]    // multi-skip
    [InlineData(EventStatus.Draft,        EventStatus.Completed)]  // multi-skip
    [InlineData(EventStatus.Registration, EventStatus.Scoring)]    // skip Active
    [InlineData(EventStatus.Registration, EventStatus.Completed)]  // skip two
    [InlineData(EventStatus.Active,       EventStatus.Completed)]  // skip Scoring
    [InlineData(EventStatus.Completed,    EventStatus.Draft)]      // no reversal
    [InlineData(EventStatus.Completed,    EventStatus.Cancelled)]  // terminal
    [InlineData(EventStatus.Cancelled,    EventStatus.Draft)]      // terminal
    [InlineData(EventStatus.Cancelled,    EventStatus.Active)]     // terminal
    public void CanTransition_returns_false_for_invalid_moves(EventStatus from, EventStatus to)
    {
        Assert.False(EventStatusRules.CanTransition(from, to));
    }

    // ── AllowedNext ─────────────────────────────────────────────────────────

    [Fact]
    public void AllowedNext_Draft_returns_Registration_and_Cancelled()
    {
        var allowed = EventStatusRules.AllowedNext(EventStatus.Draft);
        Assert.Contains(EventStatus.Registration, allowed);
        Assert.Contains(EventStatus.Cancelled,    allowed);
        Assert.Equal(2, allowed.Count);
    }

    [Fact]
    public void AllowedNext_Completed_is_empty()
    {
        Assert.Empty(EventStatusRules.AllowedNext(EventStatus.Completed));
    }

    [Fact]
    public void AllowedNext_Cancelled_is_empty()
    {
        Assert.Empty(EventStatusRules.AllowedNext(EventStatus.Cancelled));
    }

    [Fact]
    public void AllowedNext_Active_contains_only_Scoring_and_Cancelled()
    {
        var allowed = EventStatusRules.AllowedNext(EventStatus.Active);
        Assert.Contains(EventStatus.Scoring,   allowed);
        Assert.Contains(EventStatus.Cancelled, allowed);
        Assert.Equal(2, allowed.Count);
    }
}
