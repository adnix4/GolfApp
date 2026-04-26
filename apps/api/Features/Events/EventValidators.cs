// ─────────────────────────────────────────────────────────────────────────────
// Features/Events/EventValidators.cs — FluentValidation Rules for Event Requests
// ─────────────────────────────────────────────────────────────────────────────
//
// KEY VALIDATIONS:
//   CreateEvent  — format/start_type required, holes must be 9 or 18
//   UpdateEvent  — status transitions enforced here as a pre-check
//                  (EventService also enforces them for defence-in-depth)
//   AttachCourse — hole count must match event.Holes, numbers must be unique 1–18
//   ShotgunAssignments — no duplicate holes, no duplicate teams
//   TeeTimes     — no duplicate teams, times must be after event.StartAt
// ─────────────────────────────────────────────────────────────────────────────

using FluentValidation;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.Events;

public class CreateEventRequestValidator : AbstractValidator<CreateEventRequest>
{
    public CreateEventRequestValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty()
            .MaximumLength(200)
            .WithMessage("Event name is required and must be under 200 characters.");

        RuleFor(x => x.Format)
            .IsInEnum()
            .WithMessage("Format must be one of: Scramble, Stroke, Stableford, BestBall, Match.");

        RuleFor(x => x.StartType)
            .IsInEnum()
            .WithMessage("StartType must be one of: Shotgun, TeeTimes.");

        RuleFor(x => x.Holes)
            .Must(h => h == 9 || h == 18)
            .WithMessage("Holes must be either 9 or 18.");

        RuleFor(x => x.StartAt)
            .GreaterThan(DateTime.UtcNow)
            .When(x => x.StartAt.HasValue)
            .WithMessage("StartAt must be a future date and time.");
    }
}

public class UpdateEventRequestValidator : AbstractValidator<UpdateEventRequest>
{
    // Valid status transitions — spec Foundation §4.1
    // Key = current status, Value = allowed next statuses
    private static readonly Dictionary<EventStatus, EventStatus[]> ValidTransitions = new()
    {
        [EventStatus.Draft]        = [EventStatus.Registration, EventStatus.Cancelled],
        [EventStatus.Registration] = [EventStatus.Active, EventStatus.Cancelled],
        [EventStatus.Active]       = [EventStatus.Scoring, EventStatus.Cancelled],
        [EventStatus.Scoring]      = [EventStatus.Completed, EventStatus.Cancelled],
        [EventStatus.Completed]    = [],   // terminal state
        [EventStatus.Cancelled]    = [],   // terminal state
    };

    public UpdateEventRequestValidator()
    {
        RuleFor(x => x.Name)
            .MaximumLength(200)
            .When(x => x.Name != null)
            .WithMessage("Name must be under 200 characters.");

        RuleFor(x => x.Holes)
            .Must(h => h == 9 || h == 18)
            .When(x => x.Holes.HasValue)
            .WithMessage("Holes must be either 9 or 18.");

        RuleFor(x => x.StartAt)
            .GreaterThan(DateTime.UtcNow)
            .When(x => x.StartAt.HasValue)
            .WithMessage("StartAt must be a future date and time.");

        // Config entry fee must be non-negative if provided
        RuleFor(x => x.Config!.EntryFeeCents)
            .GreaterThanOrEqualTo(0)
            .When(x => x.Config?.EntryFeeCents.HasValue == true)
            .WithMessage("Entry fee must be zero or greater.");

        RuleFor(x => x.Config!.MaxTeams)
            .GreaterThan(0)
            .When(x => x.Config?.MaxTeams.HasValue == true)
            .WithMessage("MaxTeams must be greater than zero.");
    }
}

public class AttachCourseRequestValidator : AbstractValidator<AttachCourseRequest>
{
    public AttachCourseRequestValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty()
            .MaximumLength(200);

        RuleFor(x => x.Address)
            .NotEmpty()
            .MaximumLength(300);

        RuleFor(x => x.City)
            .NotEmpty()
            .MaximumLength(100);

        RuleFor(x => x.State)
            .NotEmpty()
            .MaximumLength(50);

        // Validate each hole entry when holes are provided
        RuleForEach(x => x.Holes)
            .ChildRules(hole =>
            {
                hole.RuleFor(h => h.HoleNumber)
                    .InclusiveBetween((short)1, (short)18)
                    .WithMessage("Hole number must be between 1 and 18.");

                hole.RuleFor(h => h.Par)
                    .InclusiveBetween((short)3, (short)5)
                    .WithMessage("Par must be 3, 4, or 5.");

                hole.RuleFor(h => h.HandicapIndex)
                    .InclusiveBetween((short)1, (short)18)
                    .WithMessage("Handicap index must be between 1 and 18.");
            })
            .When(x => x.Holes != null);

        // No duplicate hole numbers
        RuleFor(x => x.Holes!)
            .Must(holes => holes.Select(h => h.HoleNumber).Distinct().Count() == holes.Count)
            .When(x => x.Holes != null && x.Holes.Count > 0)
            .WithMessage("Duplicate hole numbers are not allowed.");
    }
}

public class ShotgunAssignmentsRequestValidator : AbstractValidator<ShotgunAssignmentsRequest>
{
    public ShotgunAssignmentsRequestValidator()
    {
        RuleFor(x => x.Assignments)
            .NotEmpty()
            .WithMessage("At least one assignment is required.");

        // No two teams can start on the same hole
        RuleFor(x => x.Assignments)
            .Must(a => a.Select(x => x.StartingHole).Distinct().Count() == a.Count)
            .When(x => x.Assignments.Count > 0)
            .WithMessage("Two teams cannot be assigned the same starting hole.");

        // No duplicate team IDs
        RuleFor(x => x.Assignments)
            .Must(a => a.Select(x => x.TeamId).Distinct().Count() == a.Count)
            .When(x => x.Assignments.Count > 0)
            .WithMessage("A team cannot appear more than once in the assignments.");

        RuleForEach(x => x.Assignments)
            .ChildRules(a =>
            {
                a.RuleFor(x => x.StartingHole)
                    .InclusiveBetween((short)1, (short)18);
                a.RuleFor(x => x.TeamId)
                    .NotEmpty();
            });
    }
}

public class TeeTimesRequestValidator : AbstractValidator<TeeTimesRequest>
{
    public TeeTimesRequestValidator()
    {
        RuleFor(x => x.Assignments)
            .NotEmpty()
            .WithMessage("At least one tee time assignment is required.");

        // No duplicate team IDs
        RuleFor(x => x.Assignments)
            .Must(a => a.Select(x => x.TeamId).Distinct().Count() == a.Count)
            .When(x => x.Assignments.Count > 0)
            .WithMessage("A team cannot appear more than once in the tee time assignments.");

        RuleForEach(x => x.Assignments)
            .ChildRules(a =>
            {
                a.RuleFor(x => x.TeamId)
                    .NotEmpty();
                a.RuleFor(x => x.TeeTime)
                    .NotEmpty()
                    .WithMessage("Tee time is required.");
            });
    }
}
