using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.Events;

/// <summary>
/// Pure helper encoding the event status state machine — no DB, fully unit-testable.
/// </summary>
public static class EventStatusRules
{
    private static readonly Dictionary<EventStatus, EventStatus[]> Transitions = new()
    {
        [EventStatus.Draft]        = [EventStatus.Registration, EventStatus.Cancelled],
        [EventStatus.Registration] = [EventStatus.Active,       EventStatus.Cancelled],
        [EventStatus.Active]       = [EventStatus.Scoring,      EventStatus.Cancelled],
        [EventStatus.Scoring]      = [EventStatus.Completed,    EventStatus.Cancelled],
        [EventStatus.Completed]    = [],
        [EventStatus.Cancelled]    = [],
    };

    public static bool CanTransition(EventStatus from, EventStatus to)
        => Transitions.TryGetValue(from, out var allowed) && allowed.Contains(to);

    public static IReadOnlyList<EventStatus> AllowedNext(EventStatus current)
        => Transitions.TryGetValue(current, out var allowed)
            ? allowed
            : Array.Empty<EventStatus>();

    /// <summary>
    /// True when the desk may still check golfers in.
    /// </summary>
    /// <remarks>
    /// Scoring counts, not just Active: golfers arriving after a shotgun start
    /// are routine, and the organizer may deliberately open scoring before the
    /// whole field is in. Refusing them would be permanent — check-in is also
    /// what waives the auction's saved-card requirement
    /// (AuctionBidRules.NeedsPaymentMethod), so a late arrival would be locked
    /// out of bidding for the rest of the event.
    /// Completed and Cancelled stay closed: the day is over.
    /// </remarks>
    public static bool CheckInAllowed(EventStatus status)
        => status is EventStatus.Active or EventStatus.Scoring;
}
