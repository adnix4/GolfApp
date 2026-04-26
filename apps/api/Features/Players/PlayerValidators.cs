using FluentValidation;

namespace GolfFundraiserPro.Api.Features.Players;

public class UpdatePlayerRequestValidator : AbstractValidator<UpdatePlayerRequest>
{
    public UpdatePlayerRequestValidator()
    {
        RuleFor(x => x.FirstName)
            .MaximumLength(100)
            .When(x => x.FirstName is not null);

        RuleFor(x => x.LastName)
            .MaximumLength(100)
            .When(x => x.LastName is not null);

        RuleFor(x => x.Phone)
            .MaximumLength(30)
            .When(x => x.Phone is not null);

        RuleFor(x => x.HandicapIndex)
            .InclusiveBetween(0.0, 54.0)
            .When(x => x.HandicapIndex.HasValue);
    }
}
