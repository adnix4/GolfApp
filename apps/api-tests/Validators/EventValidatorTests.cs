using Xunit;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Events;

namespace WebAPI.Tests.Validators;

/// <summary>
/// Event, course and starting-position request validation (TestingToDoList
/// TT3). These run on every matching request through FluentValidation
/// auto-validation, so a gap here is a gap in what the API accepts.
/// </summary>
public class EventValidatorTests
{
    private static readonly DateTime Future = DateTime.UtcNow.AddDays(30);

    private static CreateEventRequest Create() => new()
    {
        Name = "Spring Scramble", Format = EventFormat.Scramble, StartType = EventStartType.Shotgun,
        Holes = 18, StartAt = Future,
    };

    private static bool Fails<T>(FluentValidation.IValidator<T> v, T req, string property) =>
        v.Validate(req).Errors.Any(e => e.PropertyName == property);

    // ── Create ──────────────────────────────────────────────────────────────

    [Fact]
    public void A_complete_event_is_valid()
    {
        var r = new CreateEventRequestValidator().Validate(Create());
        Assert.True(r.IsValid, string.Join("; ", r.Errors));
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    public void Create_needs_a_name(string? name) =>
        Assert.True(Fails(new CreateEventRequestValidator(), Create() with { Name = name! }, "Name"));

    [Fact]
    public void Create_name_is_capped_at_200() =>
        Assert.True(Fails(new CreateEventRequestValidator(), Create() with { Name = new string('x', 201) }, "Name"));

    [Theory]
    [InlineData(9, true)]
    [InlineData(18, true)]
    [InlineData(0, false)]
    [InlineData(10, false)]
    [InlineData(27, false)]
    public void Holes_must_be_9_or_18(short holes, bool valid) =>
        Assert.Equal(!valid, Fails(new CreateEventRequestValidator(), Create() with { Holes = holes }, "Holes"));

    [Fact]
    public void Format_and_start_type_must_be_known_values()
    {
        var v = new CreateEventRequestValidator();
        Assert.True(Fails(v, Create() with { Format = (EventFormat)99 }, "Format"));
        Assert.True(Fails(v, Create() with { StartType = (EventStartType)99 }, "StartType"));
    }

    [Fact]
    public void Start_must_be_in_the_future_when_given_but_is_optional()
    {
        var v = new CreateEventRequestValidator();
        Assert.True(Fails(v, Create() with { StartAt = DateTime.UtcNow.AddMinutes(-1) }, "StartAt"));
        Assert.True(v.Validate(Create() with { StartAt = null }).IsValid);
    }

    [Theory]
    [InlineData(0, true)]
    [InlineData(5000, true)]
    [InlineData(-1, false)]
    public void Entry_fee_cannot_be_negative(int cents, bool valid)
    {
        var req = Create() with { Config = new EventConfigDto { EntryFeeCents = cents } };
        Assert.Equal(valid, new CreateEventRequestValidator().Validate(req).IsValid);
    }

    // ── Update (every field optional) ───────────────────────────────────────

    [Fact]
    public void An_empty_update_is_valid() =>
        Assert.True(new UpdateEventRequestValidator().Validate(new UpdateEventRequest()).IsValid);

    [Fact]
    public void Update_checks_only_the_fields_it_is_given()
    {
        var v = new UpdateEventRequestValidator();
        Assert.True(Fails(v, new UpdateEventRequest { Holes = 12 }, "Holes"));
        Assert.True(Fails(v, new UpdateEventRequest { Name = new string('x', 201) }, "Name"));
        Assert.True(Fails(v, new UpdateEventRequest { StartAt = DateTime.UtcNow.AddDays(-1) }, "StartAt"));
        Assert.False(v.Validate(new UpdateEventRequest { Config = new EventConfigDto { EntryFeeCents = -5 } }).IsValid);
        Assert.False(v.Validate(new UpdateEventRequest { Config = new EventConfigDto { MaxTeams = 0 } }).IsValid);
        Assert.True(v.Validate(new UpdateEventRequest { Config = new EventConfigDto { MaxTeams = 1 } }).IsValid);
    }

    // ── Course ──────────────────────────────────────────────────────────────

    private static AttachCourseRequest Course(List<CourseHoleRequest>? holes = null) => new()
    {
        Name = "Pine Valley", Address = "1 Fairway", City = "Austin", State = "TX", Zip = "78701", Holes = holes,
    };

    private static List<CourseHoleRequest> Holes18() =>
        Enumerable.Range(1, 18).Select(i => new CourseHoleRequest
            { HoleNumber = (short)i, Par = 4, HandicapIndex = (short)i }).ToList();

    [Fact]
    public void A_full_18_hole_course_is_valid() =>
        Assert.True(new AttachCourseRequestValidator().Validate(Course(Holes18())).IsValid);

    [Fact]
    public void A_course_can_be_attached_before_its_holes_are_known() =>
        Assert.True(new AttachCourseRequestValidator().Validate(Course()).IsValid);

    [Theory]
    [InlineData("Name")]
    [InlineData("Address")]
    [InlineData("City")]
    [InlineData("State")]
    public void Course_address_fields_are_required(string field)
    {
        var c = field switch
        {
            "Name"    => Course() with { Name = "" },
            "Address" => Course() with { Address = "" },
            "City"    => Course() with { City = "" },
            _         => Course() with { State = "" },
        };
        Assert.True(Fails(new AttachCourseRequestValidator(), c, field));
        // The edit form shares the same required fields.
        var u = new UpdateCourseRequest { Name = c.Name, Address = c.Address, City = c.City, State = c.State, Zip = c.Zip };
        Assert.True(Fails(new UpdateCourseRequestValidator(), u, field));
    }

    [Theory]
    [InlineData(0, 4, 1)]    // hole 0
    [InlineData(19, 4, 1)]   // hole 19
    [InlineData(1, 2, 1)]    // par 2
    [InlineData(1, 6, 1)]    // par 6
    [InlineData(1, 4, 0)]    // handicap 0
    [InlineData(1, 4, 19)]   // handicap 19
    public void A_hole_outside_the_rules_is_rejected(short hole, short par, short hcp)
    {
        // The validator doesn't require all 18 holes, so one hole isolates the rule.
        var bad = new CourseHoleRequest { HoleNumber = hole, Par = par, HandicapIndex = hcp };
        Assert.False(new AttachCourseRequestValidator().Validate(Course([bad])).IsValid);
        Assert.True(new AttachCourseRequestValidator().Validate(Course([bad with { HoleNumber = 1, Par = 4, HandicapIndex = 1 }])).IsValid);
    }

    [Fact]
    public void Duplicate_hole_numbers_are_rejected()
    {
        var holes = Holes18();
        holes[17] = holes[17] with { HoleNumber = 1 };
        var r = new AttachCourseRequestValidator().Validate(Course(holes));
        Assert.Contains(r.Errors, e => e.ErrorMessage == "Duplicate hole numbers are not allowed.");
    }

    // ── Starting positions ──────────────────────────────────────────────────

    [Fact]
    public void Shotgun_assignments_need_distinct_holes_and_teams_on_holes_1_to_18()
    {
        var v = new ShotgunAssignmentsRequestValidator();
        Guid t1 = Guid.NewGuid(), t2 = Guid.NewGuid();
        ShotgunAssignmentsRequest R(params ShotgunAssignment[] a) => new() { Assignments = a.ToList() };

        Assert.True(v.Validate(R(new ShotgunAssignment { TeamId = t1, StartingHole = 1 }, new ShotgunAssignment { TeamId = t2, StartingHole = 10 })).IsValid);
        Assert.False(v.Validate(R()).IsValid);                                                         // empty
        Assert.False(v.Validate(R(new ShotgunAssignment { TeamId = t1, StartingHole = 1 }, new ShotgunAssignment { TeamId = t2, StartingHole = 1 })).IsValid);  // same hole
        Assert.False(v.Validate(R(new ShotgunAssignment { TeamId = t1, StartingHole = 1 }, new ShotgunAssignment { TeamId = t1, StartingHole = 2 })).IsValid);  // same team
        Assert.False(v.Validate(R(new ShotgunAssignment { TeamId = t1, StartingHole = 19 })).IsValid);                 // off the course
        Assert.False(v.Validate(R(new ShotgunAssignment { TeamId = Guid.Empty, StartingHole = 3 })).IsValid);          // no team
    }

    [Fact]
    public void Tee_times_need_a_time_and_distinct_teams()
    {
        var v = new TeeTimesRequestValidator();
        Guid t1 = Guid.NewGuid();
        var at = DateTime.UtcNow.AddDays(1);
        Assert.True(v.Validate(new TeeTimesRequest { Assignments = { new() { TeamId = t1, TeeTime = at } } }).IsValid);
        Assert.False(v.Validate(new TeeTimesRequest()).IsValid);
        Assert.False(v.Validate(new TeeTimesRequest { Assignments = { new() { TeamId = t1, TeeTime = default } } }).IsValid);
        Assert.False(v.Validate(new TeeTimesRequest { Assignments =
            { new() { TeamId = t1, TeeTime = at }, new() { TeamId = t1, TeeTime = at.AddMinutes(10) } } }).IsValid);
    }
}
