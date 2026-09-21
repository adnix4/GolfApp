using System.Net.Http.Json;
using System.Text.Json;

namespace GolfFundraiserPro.Api.Features.Notifications;

/// <summary>
/// Sends push notifications via the Expo Push API.
/// Tokens are stored in players.expo_push_token (null = opted out).
/// </summary>
public class PushNotificationService
{
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<PushNotificationService> _logger;

    private static readonly JsonSerializerOptions JsonOpts =
        new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public PushNotificationService(IHttpClientFactory httpFactory, ILogger<PushNotificationService> logger)
    {
        _httpFactory = httpFactory;
        _logger      = logger;
    }

    /// <summary>Expo accepts at most this many messages in one request.</summary>
    internal const int MaxMessagesPerRequest = 100;

    /// <summary>
    /// How long to wait on Expo before giving up. Without this the call inherits
    /// HttpClient's 100-second default, and there are only 5 Hangfire workers —
    /// one unresponsive push could tie up a fifth of the background capacity.
    /// </summary>
    private static readonly TimeSpan SendTimeout = TimeSpan.FromSeconds(15);

    /// <summary>
    /// Sends a push notification to the given Expo push tokens.
    /// Silently ignores null/empty tokens (opted-out players).
    ///
    /// CHUNKED at <see cref="MaxMessagesPerRequest"/>, which is Expo's per-request
    /// limit. This used to post every token in one request despite the comment
    /// claiming otherwise, so any event with more than 100 opted-in players had
    /// its entire notification rejected — most visibly the hole-in-one alert,
    /// which fans out to the whole field. The failure surfaced only as a log
    /// warning, so nobody's phone buzzed and nothing said why.
    ///
    /// Chunks are sent sequentially. A hole-in-one is a handful of events per
    /// tournament, so two requests cost nothing; should Expo's project-level
    /// rate limit ever matter at very large events, a small delay between
    /// chunks is the knob to add here.
    /// </summary>
    public async Task SendAsync(
        IEnumerable<string> tokens,
        string title,
        string body,
        object? data = null,
        CancellationToken ct = default)
    {
        var valid = tokens.Where(t => !string.IsNullOrWhiteSpace(t)).ToList();
        if (valid.Count == 0) return;

        using var http = _httpFactory.CreateClient();
        http.Timeout = SendTimeout;

        var sent = 0;
        for (var offset = 0; offset < valid.Count; offset += MaxMessagesPerRequest)
        {
            var chunk = valid.Skip(offset).Take(MaxMessagesPerRequest).ToList();

            var messages = chunk.Select(to => new
            {
                to,
                title,
                body,
                sound = "default",
                data  = data ?? new { },
            });

            try
            {
                var response = await http.PostAsJsonAsync(
                    "https://exp.host/--/api/v2/push/send",
                    messages,
                    JsonOpts,
                    ct);

                if (response.IsSuccessStatusCode)
                {
                    sent += chunk.Count;
                }
                else
                {
                    // Per-chunk, so a partial failure is legible: one bad batch
                    // no longer looks like a total loss, and vice versa.
                    _logger.LogWarning(
                        "Expo push API returned {Status} for {Count} of {Total} token(s)",
                        response.StatusCode, chunk.Count, valid.Count);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    ex, "Expo push notification failed for {Count} of {Total} token(s)",
                    chunk.Count, valid.Count);
            }
        }

        if (sent < valid.Count)
        {
            _logger.LogWarning(
                "Expo push delivered {Sent}/{Total} token(s) across {Chunks} request(s)",
                sent, valid.Count,
                (valid.Count + MaxMessagesPerRequest - 1) / MaxMessagesPerRequest);
        }
    }
}
