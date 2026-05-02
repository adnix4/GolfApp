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
}
