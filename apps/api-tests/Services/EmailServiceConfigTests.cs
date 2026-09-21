using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using GolfFundraiserPro.Api.Features.Emails;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Services;

/// <summary>
/// IsConfigured is what stops a bulk send from firing one outbound TLS
/// handshake per recipient when no provider exists — measured at 148 failed
/// SendGrid calls for a single 36-team registration burst, which cost far more
/// than the email would have.
/// </summary>
public class EmailServiceConfigTests
{
    private static EmailService Build(string? apiKey)
    {
        var settings = new Dictionary<string, string?>();
        if (apiKey is not null) settings["SENDGRID_API_KEY"] = apiKey;

        var config = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        return new EmailService(InMemoryDbFactory.Create(), config, NullLogger<EmailService>.Instance);
    }

    [Fact]
    public void Not_configured_without_a_key() => Assert.False(Build(null).IsConfigured);

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Not_configured_for_a_blank_key(string key) => Assert.False(Build(key).IsConfigured);

    [Fact]
    public void Configured_with_a_key() => Assert.True(Build("SG.something").IsConfigured);
}
