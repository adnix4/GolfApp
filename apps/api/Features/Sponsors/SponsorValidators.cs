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
        // request that creates it legitimately carries no URL. When a URL IS
        // given it may be an absolute http(s) URL (an external logo we will
        // re-host) or the root-relative /uploads/… form that upload and
        // re-hosting produce.
        RuleFor(x => x.LogoUrl)
            .MaximumLength(500)
            .Must(BeHttpOrRootRelative)
            .WithMessage("LogoUrl must be an absolute http(s) URL or a root-relative path.")
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

    // The leading-slash test must come first: .NET parses "//host/x" as an
    // absolute UNC file:// URI (and "/x" as file:///x on Linux), so an
    // absolute-URI check alone would let a protocol-relative URL — which a
    // browser loads from another host — through.
    private static bool BeHttpOrRootRelative(string? u)
    {
        if (u is null) return false;
        if (u.StartsWith('/')) return !u.StartsWith("//") && !u.StartsWith("/\\");
        return Uri.TryCreate(u, UriKind.Absolute, out var abs)
            && (abs.Scheme == Uri.UriSchemeHttp || abs.Scheme == Uri.UriSchemeHttps);
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
