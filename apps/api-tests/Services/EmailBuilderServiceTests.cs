using Xunit;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.EmailBuilder;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Services;

/// <summary>
/// Tests for the email-ad builder data payload: the WHERE/WHEN/pricing fields
/// added for the event-page-style redesign, the self-hosted per-event QR URL,
/// and the absolutization of locally-stored "/uploads/…" image paths (email
/// clients render the HTML outside our site, so relative paths would break).
/// </summary>
public class EmailBuilderServiceTests
{
    private sealed class NoopHttpFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }

    private static (EmailBuilderService Svc, ApplicationDbContext Db, Guid OrgId, Guid EventId) Seed(
        string configJson = "{}",
        DateTime? startAt = null,
        bool withCourse = true)
    {
        var db = InMemoryDbFactory.Create();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["APP_BASE_URL"]   = "https://web.example.org",
            ["API_PUBLIC_URL"] = "https://api.example.org",
        }).Build();

        var orgId   = Guid.NewGuid();
        var eventId = Guid.NewGuid();
        var courseId = Guid.NewGuid();

        db.Organizations.Add(new Organization
        {
            Id = orgId, Name = "Boosters", Slug = "boosters",
            LogoUrl = "/uploads/logos/org.png", Is501c3 = true,
        });
        if (withCourse)
            db.Courses.Add(new Course
            {
                Id = courseId, OrgId = orgId, Name = "Whitetail GC",
                Address = "1339 County Rd", City = "Colfax", State = "WI", Zip = "54730",
            });
        db.Events.Add(new Event
        {
            Id = eventId, OrgId = orgId, Name = "Golf & Give",
            EventCode = "TESTCODE", Format = EventFormat.Scramble,
            StartType = EventStartType.Shotgun, Holes = 18,
            Status = EventStatus.Registration,
            StartAt = startAt, ConfigJson = configJson,
            CourseId = withCourse ? courseId : null,
        });
        db.Events.Local.First().Sponsors.Add(new Sponsor
        {
            Id = Guid.NewGuid(), EventId = eventId, Name = "Local Sponsor",
            LogoUrl = "/uploads/sponsor-logos/s.png", Tier = SponsorTier.Gold,
        });
        db.SaveChanges();

        var svc = new EmailBuilderService(
            db, new NoopHttpFactory(), config, NullLogger<EmailBuilderService>.Instance);
        return (svc, db, orgId, eventId);
    }

    [Fact]
    public async Task BuilderData_populates_when_where_and_pricing_fields()
    {
        var (svc, _, orgId, eventId) = Seed(
            configJson: "{\"entryFeeCents\":40000}",
            startAt: new DateTime(2026, 9, 19, 7, 30, 0, DateTimeKind.Utc));

        var data = await svc.GetBuilderDataAsync(orgId, eventId, default);

        Assert.Equal("September 19, 2026", data.EventDate);
        Assert.Equal("7:30 AM · Shotgun start", data.EventTime);
        Assert.Equal("Whitetail GC", data.CourseName);
        Assert.Equal("1339 County Rd, Colfax, WI 54730", data.CourseAddress);
        Assert.StartsWith("https://www.google.com/maps/search/?api=1&query=1339%20County%20Rd",
            data.DirectionsUrl);
        Assert.Equal(40000, data.EntryFeeCents);
        Assert.True(data.Is501c3);
    }

    [Fact]
    public async Task BuilderData_builds_registration_and_qr_urls_from_config()
    {
        var (svc, _, orgId, eventId) = Seed();

        var data = await svc.GetBuilderDataAsync(orgId, eventId, default);

        Assert.Equal("https://web.example.org/e/boosters/TESTCODE", data.RegistrationUrl);
        // Self-hosted per-event QR PNG — served by our API, not a third party.
        Assert.Equal("https://api.example.org/api/v1/pub/events/TESTCODE/registration-qr.png",
            data.QrCodeUrl);
    }

    [Fact]
    public async Task BuilderData_absolutizes_local_upload_paths_for_email_use()
    {
        var (svc, _, orgId, eventId) = Seed();

        var data = await svc.GetBuilderDataAsync(orgId, eventId, default);

        Assert.Equal("https://api.example.org/uploads/logos/org.png", data.OrgLogoUrl);
        Assert.Equal("https://api.example.org/uploads/sponsor-logos/s.png",
            data.Sponsors.Single().LogoUrl);
    }

    [Fact]
    public async Task BuilderData_handles_missing_course_fee_and_start_time()
    {
        var (svc, _, orgId, eventId) = Seed(withCourse: false);

        var data = await svc.GetBuilderDataAsync(orgId, eventId, default);

        Assert.Equal("Date TBD", data.EventDate);
        Assert.Equal(string.Empty, data.EventTime);
        Assert.Equal(string.Empty, data.CourseAddress);
        Assert.Equal(string.Empty, data.DirectionsUrl);
        Assert.Null(data.EntryFeeCents);
    }

    [Fact]
    public async Task BuilderData_throws_NotFound_for_an_event_outside_the_org()
    {
        var (svc, _, _, eventId) = Seed();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            svc.GetBuilderDataAsync(Guid.NewGuid(), eventId, default));
    }
}
