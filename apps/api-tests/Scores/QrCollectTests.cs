using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Scores;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Scores;

/// <summary>
/// QR scorecard import, the runbook's fallback when a team had no signal
/// (problemList D22, TestingToDoList TT1). Fixtures/qr-payload-v1.txt is
/// produced by the phone's own builder (apps/mobile/src/lib/qrPayload.ts) and
/// checked byte for byte by the mobile test, so importing it here proves the
/// two sides still agree. The payload has no signature, by design.
/// </summary>
public class QrCollectTests
{
    // Must match CONTRACT_INPUT in apps/mobile/src/__tests__/qrPayload.test.ts.
    private const string FixtureEventCode = "QRTEST01";
    private static readonly Guid FixtureTeamId = Guid.Parse("11111111-2222-4333-8444-555555555555");

    private sealed record Ctx(ApplicationDbContext Db, ScoreService Svc, Guid OrgId, Guid EventId, Guid TeamId);

    private static async Task<Ctx> Seed(EventStatus status = EventStatus.Scoring, short holes = 18)
    {
        var db = InMemoryDbFactory.Create();
        var orgId = Guid.NewGuid();
        var eventId = Guid.NewGuid();
        db.Organizations.Add(new Organization { Id = orgId, Name = "Org", Slug = "org" });
        db.Events.Add(new Event
        {
            Id = eventId, OrgId = orgId, Name = "Event", EventCode = FixtureEventCode,
            Format = EventFormat.Scramble, StartType = EventStartType.Shotgun, Holes = holes,
            Status = status, ConfigJson = "{}",
        });
        db.Teams.Add(new Team { Id = FixtureTeamId, EventId = eventId, Name = "Les Aigles Dorés", MaxPlayers = 4 });
        await db.SaveChangesAsync();
        return new Ctx(db, new ScoreService(db, new NullRealTimeService(), NullLogger<ScoreService>.Instance),
                       orgId, eventId, FixtureTeamId);
    }

    private static string[] FixtureParts() =>
        File.ReadAllLines(Path.Combine(AppContext.BaseDirectory, "Fixtures", "qr-payload-v1.txt"))
            .Where(l => l.Length > 0).ToArray();

    private static string B64(string json) => Convert.ToBase64String(Encoding.UTF8.GetBytes(json));

    private static string Payload(string ec = FixtureEventCode, string? tid = null, int v = 1,
                                  string scores = """[{"h":1,"g":4,"p":2}]""", string extra = "") =>
        B64($$"""{"v":{{v}},"ec":"{{ec}}","tid":"{{tid ?? FixtureTeamId.ToString()}}","tn":"x","did":"dev-1","ts":1700000000{{extra}},"scores":{{scores}}}""");

    private static Task<QrCollectResponse> Collect(Ctx c, string payload) =>
        c.Svc.QrCollectAsync(c.OrgId, c.EventId, new QrCollectRequest { Payload = payload });

    // ── The contract ────────────────────────────────────────────────────────

    [Fact]
    public async Task The_phones_own_two_part_payload_imports_every_hole()
    {
        var c = await Seed();
        var parts = FixtureParts();
        Assert.Equal(2, parts.Length);

        var imported = 0;
        foreach (var part in parts) imported += (await Collect(c, part)).ScoresImported;

        Assert.Equal(6, imported);
        var scores = c.Db.Scores.Where(s => s.TeamId == FixtureTeamId).OrderBy(s => s.HoleNumber).ToList();
        Assert.Equal(new short[] { 4, 5, 3, 4, 6, 4 }, scores.Select(s => s.GrossScore).ToArray());
        Assert.Null(scores[1].Putts);                                   // "p": null → no putts recorded
        Assert.All(scores, s => Assert.Equal(ScoreSource.QrTransfer, s.Source));
        Assert.All(scores, s => Assert.NotNull(s.CompletedAt));        // a handed-over hole is finished (U1)
        Assert.All(scores, s => Assert.Equal("dev-qr-fixture", s.DeviceId));
    }

    [Fact]
    public async Task A_leftover_signature_from_an_old_payload_is_ignored()
    {
        var c = await Seed();
        var r = await Collect(c, Payload(extra: ",\"sig\":\"deadbeef\""));
        Assert.Equal(1, r.ScoresImported);
    }

    // ── Structure is still checked ──────────────────────────────────────────

    [Fact]
    public async Task Not_base64_is_rejected()
    {
        var c = await Seed();
        var ex = await Assert.ThrowsAsync<ValidationException>(() => Collect(c, "%%% not base64 %%%"));
        Assert.Contains("Base64", ex.Message);
    }

    [Fact]
    public async Task Not_json_is_rejected()
    {
        var c = await Seed();
        var ex = await Assert.ThrowsAsync<ValidationException>(() => Collect(c, B64("hello there")));
        Assert.Contains("malformed", ex.Message);
    }

    [Fact]
    public async Task An_unknown_format_version_is_rejected()
    {
        var c = await Seed();
        var ex = await Assert.ThrowsAsync<ValidationException>(() => Collect(c, Payload(v: 2)));
        Assert.Contains("version 2", ex.Message);
    }

    [Fact]
    public async Task A_card_from_another_event_is_rejected()
    {
        var c = await Seed();
        var ex = await Assert.ThrowsAsync<ValidationException>(() => Collect(c, Payload(ec: "OTHER999")));
        Assert.Contains("different event", ex.Message);
    }

    [Fact]
    public async Task The_event_code_match_ignores_case()
    {
        var c = await Seed();
        Assert.Equal(1, (await Collect(c, Payload(ec: "qrtest01"))).ScoresImported);
    }

    [Fact]
    public async Task A_bad_or_foreign_team_is_rejected()
    {
        var c = await Seed();
        await Assert.ThrowsAsync<ValidationException>(() => Collect(c, Payload(tid: "not-a-guid")));
        await Assert.ThrowsAsync<NotFoundException>(() => Collect(c, Payload(tid: Guid.NewGuid().ToString())));
    }

    [Fact]
    public async Task Another_orgs_event_is_not_found()
    {
        var c = await Seed();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            c.Svc.QrCollectAsync(Guid.NewGuid(), c.EventId, new QrCollectRequest { Payload = Payload() }));
    }

    [Theory]
    [InlineData(EventStatus.Draft)]
    [InlineData(EventStatus.Registration)]
    [InlineData(EventStatus.Cancelled)]
    public async Task Only_Active_Scoring_or_Completed_events_accept_cards(EventStatus status)
    {
        var c = await Seed(status);
        await Assert.ThrowsAsync<ValidationException>(() => Collect(c, Payload()));
    }

    [Fact]
    public async Task Holes_and_scores_out_of_range_are_skipped_not_imported()
    {
        var c = await Seed(holes: 9);
        var r = await Collect(c, Payload(scores: """
            [{"h":1,"g":4,"p":2},{"h":0,"g":4,"p":2},{"h":10,"g":4,"p":2},{"h":2,"g":0,"p":1},{"h":3,"g":21,"p":1}]
            """));
        Assert.Equal(1, r.ScoresImported);
        Assert.Equal(new short[] { 1 }, c.Db.Scores.Select(s => s.HoleNumber).ToArray());
    }

    // ── Against what the desk already has ───────────────────────────────────

    private static async Task Existing(Ctx c, short hole, short gross)
    {
        c.Db.Scores.Add(new Score
        {
            Id = Guid.NewGuid(), EventId = c.EventId, TeamId = c.TeamId, HoleNumber = hole, GrossScore = gross,
            DeviceId = "admin-dashboard", SubmittedAt = DateTime.UtcNow, Source = ScoreSource.AdminEntry,
        });
        await c.Db.SaveChangesAsync();
    }

    [Fact]
    public async Task A_hole_the_desk_already_has_with_the_same_score_just_confirms_it()
    {
        var c = await Seed();
        await Existing(c, 1, 4);
        var r = await Collect(c, Payload());   // hole 1 = 4, putts 2
        Assert.Equal((1, 0), (r.ScoresImported, r.Conflicts));
        var s = c.Db.Scores.Single();
        Assert.Equal((short?)2, s.Putts);
        Assert.Equal(ScoreSource.QrTransfer, s.Source);
    }

    [Fact]
    public async Task A_hole_that_differs_is_flagged_as_a_conflict_and_not_overwritten()
    {
        var c = await Seed();
        await Existing(c, 1, 5);
        var r = await Collect(c, Payload());   // QR says 4, desk has 5
        Assert.Equal((0, 1), (r.ScoresImported, r.Conflicts));
        Assert.Equal((1, 5, 4), (r.ConflictDetails[0].HoleNumber, r.ConflictDetails[0].ExistingScore, r.ConflictDetails[0].QrScore));
        var s = c.Db.Scores.Single();
        Assert.Equal(5, s.GrossScore);
        Assert.True(s.IsConflicted);
    }
}
