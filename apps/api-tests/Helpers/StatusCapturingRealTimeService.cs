namespace WebAPI.Tests.Helpers;

/// <summary>
/// NullRealTimeService that records every EventStatusChanged it is asked to
/// send, for asserting what a status or theme change pushes to devices (PF1).
/// </summary>
public sealed class StatusCapturingRealTimeService : NullRealTimeService
{
    public List<(string EventCode, string Status, string? ThemeJson)> StatusChanges { get; } = new();

    public override Task SendEventStatusChangedAsync(
        string eventCode, string status, string? themeJson, CancellationToken ct = default)
    {
        StatusChanges.Add((eventCode, status, themeJson));
        return Task.CompletedTask;
    }
}
