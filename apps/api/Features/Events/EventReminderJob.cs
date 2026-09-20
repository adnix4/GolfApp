using Hangfire;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Emails;

namespace GolfFundraiserPro.Api.Features.Events;

/// <summary>
/// Hourly sweep that mails each upcoming event's roster the day before, asking
/// golfers to set their scorecard up before they arrive.
///
/// THIS IS A LOAD-SHEDDING JOB. Every golfer who joins the night before is one
/// who makes zero requests at the first tee. Joining has always been allowed
/// this early — any status but Cancelled — and the mobile app restores its
/// session from local storage rather than re-joining on launch, so an early join
/// genuinely removes that golfer from event-morning traffic. What was missing
/// was anything that asked them to: the only join affordance was the QR code at
/// the registration desk, which guarantees the whole field arrives at once.
///
/// Hourly rather than continuous because the window is a day wide; precision to
/// the hour is ample, and it keeps the sweep a cheap filtered read.
/// </summary>
public class EventReminderJob
{
    /// <summary>
    /// How far ahead to look. Wider than 24 h so an event is still caught if a
    /// sweep is missed (deploy, restart, clock skew) — the ReminderSentAt stamp
    /// is what stops a double send, not the tightness of this window.
    /// </summary>
    private static readonly TimeSpan LookAhead = TimeSpan.FromHours(30);

    private readonly ApplicationDbContext _db;
    private readonly EmailService _email;
    private readonly IConfiguration _config;
    private readonly ILogger<EventReminderJob> _logger;

    public EventReminderJob(
        ApplicationDbContext db,
        EmailService email,
        IConfiguration config,
        ILogger<EventReminderJob> logger)
    {
        _db      = db;
        _email   = email;
        _config  = config;
        _logger  = logger;
    }

    [AutomaticRetry(Attempts = 0)]
    public async Task RunAsync()
    {
        try { await SweepAsync(CancellationToken.None); }
        catch (Exception ex) { _logger.LogError(ex, "EventReminderJob failed"); }
    }

    internal async Task SweepAsync(CancellationToken ct)
    {
        var now      = DateTime.UtcNow;
        var deadline = now.Add(LookAhead);

        // Registration and Active only: a Draft event is a test/preview and must
        // never mail real people, and by Scoring the round is already under way.
        var due = await _db.Events
            .Where(e => e.ReminderSentAt == null
                     && e.StartAt != null
                     && e.StartAt > now
                     && e.StartAt <= deadline
                     && (e.Status == EventStatus.Registration || e.Status == EventStatus.Active))
            .Select(e => new
            {
                e.Id, e.Name, e.EventCode, e.StartAt,
                OrgSlug = e.Organization.Slug,
            })
            .ToListAsync(ct);

        if (due.Count == 0) return;

        // Without a mail provider the sweep would stamp every event as reminded
        // while delivering nothing — losing the nudge permanently for events
        // that pass through an unconfigured window.
        if (!_email.IsConfigured)
        {
            _logger.LogWarning(
                "Join reminder skipped for {Count} event(s): no email provider configured",
                due.Count);
            return;
        }

        var webBaseUrl = WebBaseUrl();

        foreach (var evt in due)
        {
            // Stamp BEFORE sending. A crash mid-send costs some golfers their
            // nudge; not stamping would risk mailing the whole roster again on
            // the next sweep, which is the worse failure.
            var entity = await _db.Events.FirstOrDefaultAsync(e => e.Id == evt.Id, ct);
            if (entity is null) continue;
            entity.ReminderSentAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);

            var roster = await _db.Players
                .AsNoTracking()
                .Where(p => p.EventId == evt.Id && p.Email != "")
                .Select(p => new { p.FirstName, p.Email })
                .ToListAsync(ct);

            var joinUrl = JoinNudgeEmail.BuildJoinUrl(webBaseUrl, evt.OrgSlug, evt.EventCode);
            var sent    = 0;

            foreach (var player in roster)
            {
                try
                {
                    await _email.SendTransactionalAsync(
                        player.Email,
                        player.FirstName,
                        $"{evt.Name} is tomorrow — set up your scorecard",
                        JoinNudgeEmail.BuildReminderHtml(
                            player.FirstName, evt.Name, evt.EventCode, joinUrl, evt.StartAt),
                        ct);
                    sent++;
                }
                catch (Exception ex)
                {
                    // One bad address must not stop the rest of the roster.
                    _logger.LogWarning(
                        ex, "Join reminder failed for '{Email}' on event '{Code}'",
                        player.Email, evt.EventCode);
                }
            }

            _logger.LogInformation(
                "Join reminder sent for event '{Code}': {Sent}/{Total} golfer(s)",
                evt.EventCode, sent, roster.Count);
        }
    }

    /// <summary>
    /// Public site origin for the links in the email. Falls back to the local
    /// Next.js dev server so a dev environment produces clickable links.
    /// </summary>
    private string WebBaseUrl() =>
        _config["WEB_BASE_URL"] is { Length: > 0 } configured
            ? configured
            : "http://localhost:3000";
}
