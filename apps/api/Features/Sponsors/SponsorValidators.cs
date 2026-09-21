using FluentValidation;

namespace GolfFundraiserPro.Api.Features.Sponsors;

public class CreateSponsorRequestValidator : AbstractValidator<CreateSponsorRequest>
{
    public CreateSponsorRequestValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty()
            .MaximumLength(200);

        // A logo is optional at create time: the admin's upload path saves the
        // sponsor first and POSTs the file to .../logo straight after, so the
        // request that creates it legitimately carries no URL. Only a pasted
        // URL is checked.
        RuleFor(x => x.LogoUrl)
            .MaximumLength(500)
            .Must(u => Uri.TryCreate(u, UriKind.Absolute, out _))
            .WithMessage("LogoUrl must be a valid absolute URL.")
            .When(x => !string.IsNullOrWhiteSpace(x.LogoUrl));

        RuleFor(x => x.WebsiteUrl)
            .MaximumLength(500)
            .Must(u => Uri.TryCreate(u, UriKind.Absolute, out _))
            .WithMessage("WebsiteUrl must be a valid absolute URL.")
            .When(x => !string.IsNullOrWhiteSpace(x.WebsiteUrl));

        RuleFor(x => x.Tagline)
            .MaximumLength(200)
            .When(x => x.Tagline is not null);
    }
}

public class CreateChallengeRequestValidator : AbstractValidator<CreateChallengeRequest>
{
    public CreateChallengeRequestValidator()
    {
        RuleFor(x => x.HoleNumber)
            .InclusiveBetween((short)1, (short)18)
            .When(x => x.HoleNumber.HasValue);

        RuleFor(x => x.Description)
            .NotEmpty()
            .MaximumLength(500);

        RuleFor(x => x.PrizeDescription)
            .MaximumLength(500)
            .When(x => x.PrizeDescription is not null);
    }
}

public class RecordDonationRequestValidator : AbstractValidator<RecordDonationRequest>
{
    public RecordDonationRequestValidator()
    {
        RuleFor(x => x.DonorName)
            .NotEmpty()
            .MaximumLength(200);

        RuleFor(x => x.DonorEmail)
            .NotEmpty()
            .EmailAddress()
            .MaximumLength(254);

        RuleFor(x => x.AmountCents)
            .GreaterThanOrEqualTo(100)
            .WithMessage("Donation amount must be at least $1.00 (100 cents).");
    }
}
