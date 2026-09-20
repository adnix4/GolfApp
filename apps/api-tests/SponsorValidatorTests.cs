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

    // Absolute http(s) URLs are external logos we re-host; the root-relative
    // /uploads/… form is what upload and re-hosting store.
    [Theory]
    [InlineData("https://example.com/logo.png")]
    [InlineData("http://example.com/logo.png")]
    [InlineData("/uploads/sponsor-logos/acme.png")]
    public void Http_and_root_relative_logo_urls_are_accepted(string url)
    {
        var result = new CreateSponsorRequestValidator().Validate(Request(url));
        Assert.True(result.IsValid, string.Join("; ", result.Errors));
    }

    [Theory]
    [InlineData("uploads/sponsor-logos/acme.png")]   // relative, but not root-relative
    [InlineData("//evil.example/logo.png")]          // protocol-relative: another host
    [InlineData("/\\evil.example/logo.png")]         // browsers treat as protocol-relative
    [InlineData("file:///etc/passwd")]
    public void Other_logo_urls_are_rejected(string url)
    {
        var result = new CreateSponsorRequestValidator().Validate(Request(url));
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(CreateSponsorRequest.LogoUrl));
    }

    [Fact]
    public void Name_is_still_required()
    {
        var result = new CreateSponsorRequestValidator().Validate(Request(null) with { Name = "" });
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.PropertyName == nameof(CreateSponsorRequest.Name));
    }
}
