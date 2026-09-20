using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using GolfFundraiserPro.Api.Features.Notifications;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Services;

/// <summary>
/// Expo rejects a request carrying more than 100 messages outright. The service
/// used to post every token in one request regardless, so a tournament with more
/// than 100 opted-in players had its whole notification dropped — most visibly
/// the hole-in-one alert, which fans out to the entire field. The only trace was
/// a log warning, so nobody's phone buzzed and nothing said why.
/// </summary>
public class PushNotificationServiceTests
{
    private static PushNotificationService Build(RecordingHttpClientFactory factory) =>
        new(factory, NullLogger<PushNotificationService>.Instance);

    private static List<string> TokensFor(int count) =>
        Enumerable.Range(0, count).Select(i => $"ExponentPushToken[{i:D4}]").ToList();

    private static int MessagesIn(string body) =>
        JsonDocument.Parse(body).RootElement.GetArrayLength();

    [Fact]
    public async Task Sends_nothing_when_no_tokens()
    {
        var factory = new RecordingHttpClientFactory();
        await Build(factory).SendAsync([], "t", "b");

        Assert.Equal(0, factory.RequestCount);
    }

    [Fact]
    public async Task Sends_nothing_when_every_token_is_blank()
    {
        // Opted-out players carry null/empty tokens; they must not produce an
        // empty request to Expo.
        var factory = new RecordingHttpClientFactory();
        await Build(factory).SendAsync(["", "   ", null!], "t", "b");

        Assert.Equal(0, factory.RequestCount);
    }

    [Fact]
    public async Task Sends_a_small_audience_in_one_request()
    {
        var factory = new RecordingHttpClientFactory();
        await Build(factory).SendAsync(TokensFor(12), "Hole-in-One!", "body");

        Assert.Equal(1, factory.RequestCount);
        Assert.Equal(12, MessagesIn(factory.Bodies[0]));
    }

    [Fact]
    public async Task Sends_exactly_one_request_at_the_batch_limit()
    {
        var factory = new RecordingHttpClientFactory();
        await Build(factory).SendAsync(TokensFor(100), "Hole-in-One!", "body");

        Assert.Equal(1, factory.RequestCount);
        Assert.Equal(100, MessagesIn(factory.Bodies[0]));
    }

    [Fact]
    public async Task Splits_one_over_the_limit_into_two_requests()
    {
        var factory = new RecordingHttpClientFactory();
        await Build(factory).SendAsync(TokensFor(101), "Hole-in-One!", "body");

        Assert.Equal(2, factory.RequestCount);
        Assert.Equal(100, MessagesIn(factory.Bodies[0]));
        Assert.Equal(1,   MessagesIn(factory.Bodies[1]));
    }

    [Fact]
    public async Task Splits_a_large_field_into_full_chunks_plus_a_remainder()
    {
        // 250 is a plausible big-event roster: the old code sent one 250-message
        // request and lost every one of them.
        var factory = new RecordingHttpClientFactory();
        await Build(factory).SendAsync(TokensFor(250), "Hole-in-One!", "body");

        Assert.Equal(3, factory.RequestCount);
        Assert.Equal([100, 100, 50], factory.Bodies.Select(MessagesIn).ToArray());
    }

    [Fact]
    public async Task Every_token_is_sent_exactly_once_across_the_chunks()
    {
        var factory = new RecordingHttpClientFactory();
        var tokens  = TokensFor(250);
        await Build(factory).SendAsync(tokens, "Hole-in-One!", "body");

        var delivered = factory.Bodies
            .SelectMany(b => JsonDocument.Parse(b).RootElement.EnumerateArray()
                .Select(m => m.GetProperty("to").GetString()!))
            .ToList();

        Assert.Equal(tokens.Count, delivered.Count);
        Assert.Equal(tokens.OrderBy(t => t), delivered.OrderBy(t => t));
    }

    [Fact]
    public async Task Blank_tokens_are_filtered_before_chunking()
    {
        // Otherwise a roster padded with opted-out players would split into more
        // requests than it needs, and Expo would reject the empty entries.
        var factory = new RecordingHttpClientFactory();
        var tokens  = TokensFor(100).Concat(["", "  "]).ToList();

        await Build(factory).SendAsync(tokens, "t", "b");

        Assert.Equal(1, factory.RequestCount);
        Assert.Equal(100, MessagesIn(factory.Bodies[0]));
    }

    [Fact]
    public async Task Carries_the_title_body_and_data_on_every_message()
    {
        var factory = new RecordingHttpClientFactory();
        await Build(factory).SendAsync(
            TokensFor(150), "Hole-in-One!", "Team Eagle aced hole 7!",
            new { type = "hole_in_one", holeNumber = 7 });

        foreach (var message in factory.Bodies
                     .SelectMany(b => JsonDocument.Parse(b).RootElement.EnumerateArray()))
        {
            Assert.Equal("Hole-in-One!", message.GetProperty("title").GetString());
            Assert.Equal("Team Eagle aced hole 7!", message.GetProperty("body").GetString());
            Assert.Equal("hole_in_one", message.GetProperty("data").GetProperty("type").GetString());
        }
    }

    [Fact]
    public async Task Keeps_sending_later_chunks_after_one_is_rejected()
    {
        // A rejected batch must not abort the rest: partial delivery beats none.
        var factory = new RecordingHttpClientFactory(HttpStatusCode.BadRequest);
        await Build(factory).SendAsync(TokensFor(250), "t", "b");

        Assert.Equal(3, factory.RequestCount);
    }

    [Fact]
    public async Task Posts_to_the_expo_push_endpoint()
    {
        var factory = new RecordingHttpClientFactory();
        await Build(factory).SendAsync(TokensFor(1), "t", "b");

        Assert.Equal("https://exp.host/--/api/v2/push/send", factory.Uris[0]);
    }
}
