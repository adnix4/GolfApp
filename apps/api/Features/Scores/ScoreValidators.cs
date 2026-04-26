using FluentValidation;

namespace GolfFundraiserPro.Api.Features.Scores;

public class SubmitScoreRequestValidator : AbstractValidator<SubmitScoreRequest>
{
    public SubmitScoreRequestValidator()
    {
        RuleFor(x => x.TeamId)
            .NotEmpty().WithMessage("TeamId is required.");

        RuleFor(x => x.HoleNumber)
            .InclusiveBetween((short)1, (short)18)
            .WithMessage("Hole number must be between 1 and 18.");

        RuleFor(x => x.GrossScore)
            .InclusiveBetween((short)1, (short)20)
            .WithMessage("Gross score must be between 1 and 20.");

        RuleFor(x => x.Putts)
            .InclusiveBetween((short)0, (short)10)
            .When(x => x.Putts.HasValue)
            .WithMessage("Putts must be between 0 and 10.");

        RuleFor(x => x.DeviceId)
            .MaximumLength(100);
    }
}

public class ResolveConflictRequestValidator : AbstractValidator<ResolveConflictRequest>
{
    public ResolveConflictRequestValidator()
    {
        RuleFor(x => x.AcceptedScore)
            .InclusiveBetween((short)1, (short)20)
            .WithMessage("Accepted score must be between 1 and 20.");

        RuleFor(x => x.ResolutionNote)
            .MaximumLength(500)
            .When(x => x.ResolutionNote is not null);
    }
}
