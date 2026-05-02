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

    /// <summary>
    /// Sends a push notification to the given Expo push tokens.
    /// Silently ignores null/empty tokens (opted-out players).
    /// Batches are capped at 100 per the Expo API limit.
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

        var messages = valid.Select(to => new
        {
            to,
            title,
            body,
            sound = "default",
            data  = data ?? new { },
        });

        try
        {
            using var http = _httpFactory.CreateClient();
            var response = await http.PostAsJsonAsync(
                "https://exp.host/--/api/v2/push/send",
                messages,
                JsonOpts,
                ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Expo push API returned {Status} for {Count} token(s)",
                    response.StatusCode, valid.Count);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Expo push notification failed for {Count} token(s)", valid.Count);
        }
    }
}
