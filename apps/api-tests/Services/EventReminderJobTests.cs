using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Emails;
using GolfFundraiserPro.Api.Features.Events;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Services;

/// <summary>
/// The day-before nudge is a load-shedding mechanism: every golfer who sets up
/// the night before makes zero requests at the first tee. What these tests pin
/// down is which events the sweep is allowed to mail about, and that it cannot
/// mail the same roster twice.
///
/// Sending itself needs SendGrid, which is not configured under test — the
/// roster loop swallows the resulting failure per address on purpose, so what is
/// asserted here is the selection and the stamp.
/// </summary>
public class EventReminderJobTests
{
    private static (EventReminderJob job, ApplicationDbContext db) Build()
    {
        var db = InMemoryDbFactory.Create();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["WEB_BASE_URL"] = "https://play.example.org",
                // A provider must LOOK configured or the sweep bails before
                // stamping (it refuses to burn the one-shot marker when nothing
                // could be delivered). Sending still fails against this fake
                // key, which the per-address catch absorbs — exactly the shape
                // these tests want: real selection, no real mail.
                ["SENDGRID_API_KEY"] = "SG.test-key-not-real",
            })
            .Build();

        var email = new EmailService(db, config, NullLogger<EmailService>.Instance);
        var job   = new EventReminderJob(db, email, config, NullLogger<EventReminderJob>.Instance);
        return (job, db);
    }

    private static async Task<Guid> SeedEventAsync(
        ApplicationDbContext db,
        DateTime? startAt,
        EventStatus status = EventStatus.Registration,
        DateTime? reminderSentAt = null)
    {
        var orgId   = Guid.NewGuid();
        var eventId = Guid.NewGuid();

        db.Organizations.Add(new Organization
        {
            Id = orgId, Name = "Test Org", Slug = $"org-{orgId:N}", CreatedAt = DateTime.UtcNow,
        });

        db.Events.Add(new Event
        {
            Id             = eventId,
            OrgId          = orgId,
            Name           = "Charity Classic",
            EventCode      = "ABCD1234",
            Status         = status,
            StartAt        = startAt,
            ReminderSentAt = reminderSentAt,
        });

        db.Players.Add(new Player
        {
            Id        = Guid.NewGuid(),
            EventId   = eventId,
            FirstName = "Ava",
            LastName  = "Stone",
            Email     = "ava@example.com",
        });

        await db.SaveChangesAsync();
        return eventId;
    }

    private static Task<Event?> Reload(ApplicationDbContext db, Guid id) =>
        db.Events.AsNoTracking().FirstOrDefaultAsync(e => e.Id == id);

    [Fact]
    public async Task Stamps_an_event_starting_tomorrow()
    {
        var (job, db) = Build();
        var id = await SeedEventAsync(db, DateTime.UtcNow.AddHours(20));

        await job.SweepAsync(CancellationToken.None);

        Assert.NotNull((await Reload(db, id))!.ReminderSentAt);
    }

    [Fact]
    public async Task Skips_an_event_too_far_out()
    {
        // A month away is not "tomorrow" — mailing now would be noise and would
        // burn the one stamp we get.
        var (job, db) = Build();
        var id = await SeedEventAsync(db, DateTime.UtcNow.AddDays(30));

        await job.SweepAsync(CancellationToken.None);

        Assert.Null((await Reload(db, id))!.ReminderSentAt);
    }

    [Fact]
    public async Task Skips_an_event_that_already_started()
    {
        var (job, db) = Build();
        var id = await SeedEventAsync(db, DateTime.UtcNow.AddHours(-2));

        await job.SweepAsync(CancellationToken.None);

        Assert.Null((await Reload(db, id))!.ReminderSentAt);
    }

    [Fact]
    public async Task Skips_an_event_with_no_start_time()
    {
        var (job, db) = Build();
        var id = await SeedEventAsync(db, null);

        await job.SweepAsync(CancellationToken.None);

        Assert.Null((await Reload(db, id))!.ReminderSentAt);
    }

    [Fact]
    public async Task Never_mails_a_draft_event()
    {
        // Draft is the test/preview mode and is seeded with fake addresses —
        // mailing it would send real email to made-up people.
        var (job, db) = Build();
        var id = await SeedEventAsync(db, DateTime.UtcNow.AddHours(20), EventStatus.Draft);

        await job.SweepAsync(CancellationToken.None);

        Assert.Null((await Reload(db, id))!.ReminderSentAt);
    }

    [Fact]
    public async Task Skips_a_cancelled_event()
    {
        var (job, db) = Build();
        var id = await SeedEventAsync(db, DateTime.UtcNow.AddHours(20), EventStatus.Cancelled);

        await job.SweepAsync(CancellationToken.None);

        Assert.Null((await Reload(db, id))!.ReminderSentAt);
    }

    [Fact]
    public async Task Includes_an_active_event()
    {
        var (job, db) = Build();
        var id = await SeedEventAsync(db, DateTime.UtcNow.AddHours(20), EventStatus.Active);

        await job.SweepAsync(CancellationToken.None);

        Assert.NotNull((await Reload(db, id))!.ReminderSentAt);
    }

    [Fact]
    public async Task Does_not_mail_the_same_event_twice()
    {
        // The whole point of the stamp: an hourly sweep must not mail a roster
        // once an hour until the event starts.
        var (job, db) = Build();
        var alreadySent = DateTime.UtcNow.AddHours(-3);
        var id = await SeedEventAsync(db, DateTime.UtcNow.AddHours(20),
                                      EventStatus.Registration, alreadySent);

        await job.SweepAsync(CancellationToken.None);

        Assert.Equal(alreadySent, (await Reload(db, id))!.ReminderSentAt);
    }

    [Fact]
    public async Task A_second_sweep_leaves_the_first_stamp_alone()
    {
        var (job, db) = Build();
        var id = await SeedEventAsync(db, DateTime.UtcNow.AddHours(20));

        await job.SweepAsync(CancellationToken.None);
        var first = (await Reload(db, id))!.ReminderSentAt;

        await job.SweepAsync(CancellationToken.None);

        Assert.Equal(first, (await Reload(db, id))!.ReminderSentAt);
    }

    [Fact]
    public async Task Handles_a_sweep_with_nothing_due()
    {
        var (job, db) = Build();
        await SeedEventAsync(db, DateTime.UtcNow.AddDays(60));

        await job.SweepAsync(CancellationToken.None); // must not throw
    }

    [Fact]
    public void Join_url_points_at_the_smart_join_landing_page()
    {
        // SmartJoin is what deep-links into gfp://join on a phone; a link
        // straight at the API or the bare event page would lose that.
        var url = JoinNudgeEmail.BuildJoinUrl("https://play.example.org/", "acme", "ABCD1234");

        Assert.Equal("https://play.example.org/e/acme/ABCD1234/join", url);
    }

    [Fact]
    public void Reminder_body_carries_the_event_code_and_link()
    {
        // The code is the manual fallback when the deep link doesn't fire.
        var html = JoinNudgeEmail.BuildReminderHtml(
            "Ava", "Charity Classic", "ABCD1234",
            "https://play.example.org/e/acme/ABCD1234/join", DateTime.UtcNow.AddDays(1));

        Assert.Contains("ABCD1234", html);
        Assert.Contains("https://play.example.org/e/acme/ABCD1234/join", html);
        Assert.Contains("Ava", html);
    }

    [Fact]
    public void Email_bodies_escape_their_inputs()
    {
        // Event names are organizer-supplied and land in HTML.
        var html = JoinNudgeEmail.BuildWelcomeHtml(
            "Ava", "<script>alert(1)</script>", "ABCD1234", "https://x.test/j", null);

        Assert.DoesNotContain("<script>", html);
        Assert.Contains("&lt;script&gt;", html);
    }
}
