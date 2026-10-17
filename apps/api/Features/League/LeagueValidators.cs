// ─────────────────────────────────────────────────────────────────────────────
// Features/League/LeagueValidators.cs — FluentValidation Rules for League Requests
// ─────────────────────────────────────────────────────────────────────────────
//
// League members are identified the same way as tournament golfers (first,
// last, email), but a handicap index is REQUIRED here: net scoring, flights and
// the pairing engine all read it, and a blank used to bind to 0.0 (scratch).

using FluentValidation;

namespace GolfFundraiserPro.Api.Features.League;

public class AddMemberRequestValidator : AbstractValidator<AddMemberRequest>
{
    public AddMemberRequestValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100).WithMessage("First name is required.");
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100).WithMessage("Last name is required.");
        RuleFor(x => x.Email)
            .NotEmpty().EmailAddress().MaximumLength(254)
            .WithMessage("A valid email address is required.");
        RuleFor(x => x.HandicapIndex)
            .NotNull().WithMessage("A handicap index is required for league play.")
            .InclusiveBetween(0.0, 54.0).WithMessage("Handicap index must be between 0 and 54.");
    }
}

public class AddSubstituteRequestValidator : AbstractValidator<AddSubstituteRequest>
{
    public AddSubstituteRequestValidator()
    {
        RuleFor(x => x.AbsentMemberId).NotEmpty().WithMessage("The absent member is required.");
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100).WithMessage("First name is required.");
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100).WithMessage("Last name is required.");
        RuleFor(x => x.Email)
            .NotEmpty().EmailAddress().MaximumLength(254)
            .WithMessage("A valid email address is required.");
        RuleFor(x => x.HandicapIndex)
            .NotNull().WithMessage("A handicap index is required for league play.")
            .InclusiveBetween(0.0, 54.0).WithMessage("Handicap index must be between 0 and 54.");
    }
}
