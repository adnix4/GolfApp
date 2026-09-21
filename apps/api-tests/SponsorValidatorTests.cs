using Xunit;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Sponsors;

namespace WebAPI.Tests;

public class SponsorValidatorTests
{
    private static CreateSponsorRequest Request(string? logoUrl) => new()
    {
        Name    = "Acme Corp",
        Tier    = SponsorTier.Gold,
        LogoUrl = logoUrl,
    };

    // The admin's upload path creates the sponsor first and POSTs the image to
    // .../logo straight after, so the create request carries no URL at all.
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Sponsor_can_be_created_without_a_logo(string? logoUrl)
    {
        var result = new CreateSponsorRequestValidator().Validate(Request(logoUrl));
        Assert.True(result.IsValid, string.Join("; ", result.Errors));
    }

    [Fact]
    public void Pasted_logo_url_must_be_absolute()
    {
        var result = new CreateSponsorRequestValidator().Validate(Request("logo.png"));
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(CreateSponsorRequest.LogoUrl));
    }

    [Fact]
    public void Absolute_logo_url_is_accepted()
    {
        var result = new CreateSponsorRequestValidator()
            .Validate(Request("https://example.com/logo.png"));
        Assert.True(result.IsValid, string.Join("; ", result.Errors));
    }
}
