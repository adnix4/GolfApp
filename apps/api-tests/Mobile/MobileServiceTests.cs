using Xunit;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Emails;
using GolfFundraiserPro.Api.Features.Mobile;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Mobile;

/// <summary>
/// Tests for MobileService: the join flow, offline batch sync (incl. the
/// anti-injection session-token gate + conflict detection), the scorecard pull,
/// and the self-service profile edit (IDOR protection). In-memory EF Core, same
/// pattern as ScoreServiceIntegrationTests.
/// </summary>
public class MobileServiceTests
{
    private sealed class CapturingRealTime : NullRealTimeService
    {
        public int LeaderboardPublishes { get; private set; }
        public override Task PublishLeaderboardAsync(
            string eventCode, Guid eventId,
            IEnumerable<(Guid TeamId, string TeamName, short HoleNumber, short GrossScore)> acceptedScores,
            CancellationToken ct = default)
        {
            LeaderboardPublishes++;
            return Task.CompletedTask;
        }
    }

    private sealed class World
    {
        public ApplicationDbContext Db = null!;
        public MobileService Svc = null!;
        public CapturingRealTime Rt = null!;
        public Guid EventId;
        public Guid TeamId;
        public Guid PlayerId;
        public string PlayerEmail = "golfer@example.com";
        public string SessionToken = "session-token-123";
        public const string Code = "ABCD1234";
    }

    /// <summary>
    /// Seeds org + event (Scoring) + team + one team-assigned player with a session
    /// token. The player is pre-verified for the default deviceId ("mobile-app") so
    /// join tests that aren't about email verification get the full payload in one
    /// call; pass verifiedDevice: false to exercise the A3 verification challenge.
    /// The optional bypassCode wires JoinVerification:TestBypassCode into config.
    /// </summary>
    private static World Seed(
        EventStatus status = EventStatus.Scoring,
        bool mintToken = true,
        bool verifiedDevice = true,
        string? bypassCode = null)
    {
        var db = InMemoryDbFactory.Create();
        var rt = new CapturingRealTime();
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(bypassCode is null
                ? new Dictionary<string, string?>()
                : new Dictionary<string, string?> { ["JoinVerification:TestBypassCode"] = bypassCode })
            .Build();
        // Real EmailService with no SENDGRID_API_KEY — sends throw and MobileService
        // swallows/logs them, which is exactly the dev-environment behavior.
        var email = new EmailService(db, config, NullLogger<EmailService>.Instance);
        var w = new World
        {
            Db = db, Rt = rt,
            EventId = Guid.NewGuid(), TeamId = Guid.NewGuid(), PlayerId = Guid.NewGuid(),
            Svc = new MobileService(db, rt, email, config, NullLogger<MobileService>.Instance),
        };

        db.Organizations.Add(new Organization { Id = Guid.NewGuid(), Name = "Test Org", Slug = "test" });
        var orgId = db.Organizations.Local.First().Id;

        db.Events.Add(new Event
        {
            Id = w.EventId, OrgId = orgId, Name = "Test Event", EventCode = World.Code,
            Format = EventFormat.Scramble, StartType = EventStartType.Shotgun,
            Holes = 18, Status = status, ConfigJson = "{}",
        });
        db.Teams.Add(new Team { Id = w.TeamId, EventId = w.EventId, Name = "Eagles", MaxPlayers = 4 });
        db.Players.Add(new Player
        {
            Id = w.PlayerId, EventId = w.EventId, TeamId = w.TeamId,
            FirstName = "Pat", LastName = "Golfer", Email = w.PlayerEmail,
            SessionToken = mintToken ? w.SessionToken : null,
            VerifiedDeviceId = verifiedDevice ? "mobile-app" : null,
        });
        db.SaveChanges();
        return w;
    }

    private static PendingScoreInput Pending(short hole, short gross, string? shots = null) =>
        new() { HoleNumber = hole, GrossScore = gross, PlayerShotsJson = shots };

    // ── UpdateSelfAsync — IDOR protection ─────────────────────────────────────────

    [Fact]
    public async Task UpdateSelf_applies_edits_with_a_valid_token()
    {
        var w = Seed();
        var dto = await w.Svc.UpdateSelfAsync(w.PlayerId, new UpdateSelfRequest
        {
            SessionToken = w.SessionToken, FirstName = "  Sam  ", LastName = "Smith", Phone = " 555-1234 ",
        });

        Assert.Equal("Sam", dto.FirstName);     // trimmed
        Assert.Equal("Smith", dto.LastName);
        var p = w.Db.Players.Single(p => p.Id == w.PlayerId);
        Assert.Equal("555-1234", p.Phone);       // trimmed + persisted
    }

    [Fact]
    public async Task UpdateSelf_leaves_unspecified_fields_unchanged()
    {
        var w = Seed();
        await w.Svc.UpdateSelfAsync(w.PlayerId, new UpdateSelfRequest
        {
            SessionToken = w.SessionToken, FirstName = "Sam", // LastName/Phone null
        });

        var p = w.Db.Players.Single(p => p.Id == w.PlayerId);
        Assert.Equal("Sam", p.FirstName);
        Assert.Equal("Golfer", p.LastName); // untouched
    }

    [Fact]
    public async Task UpdateSelf_rejects_a_wrong_token_with_NotFound_no_leak()
    {
        var w = Seed();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            w.Svc.UpdateSelfAsync(w.PlayerId, new UpdateSelfRequest { SessionToken = "wrong", FirstName = "Hacker" }));

        Assert.Equal("Pat", w.Db.Players.Single(p => p.Id == w.PlayerId).FirstName); // not mutated
    }

    [Fact]
    public async Task UpdateSelf_fails_closed_when_player_has_no_token()
    {
        var w = Seed(mintToken: false);
        await Assert.ThrowsAsync<NotFoundException>(() =>
            w.Svc.UpdateSelfAsync(w.PlayerId, new UpdateSelfRequest { SessionToken = "anything", FirstName = "X" }));
    }

    [Fact]
    public async Task UpdateSelf_throws_NotFound_for_unknown_player()
    {
        var w = Seed();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            w.Svc.UpdateSelfAsync(Guid.NewGuid(), new UpdateSelfRequest { SessionToken = w.SessionToken }));
    }

    // ── BatchSyncAsync — anti-injection token gate ────────────────────────────────

    private BatchSyncRequest SyncReq(World w, string token, string device, params PendingScoreInput[] scores) =>
        new() { EventId = w.EventId, TeamId = w.TeamId, SessionToken = token, DeviceId = device, Scores = scores.ToList() };

    [Fact]
    public async Task BatchSync_inserts_new_scores_with_a_valid_team_token()
    {
        var w = Seed();
        var res = await w.Svc.BatchSyncAsync(SyncReq(w, w.SessionToken, "dev-A", Pending(1, 4), Pending(2, 5)));

        Assert.Equal(2, res.Accepted);
        Assert.Equal(0, res.Conflicts);
        Assert.Equal(2, w.Db.Scores.Count(s => s.TeamId == w.TeamId));
        Assert.Equal(ScoreSource.MobileSync, w.Db.Scores.First().Source);
    }

    [Fact]
    public async Task BatchSync_rejects_a_wrong_session_token_with_NotFound()
    {
        var w = Seed();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            w.Svc.BatchSyncAsync(SyncReq(w, "not-the-token", "dev-A", Pending(1, 4))));

        Assert.Empty(w.Db.Scores); // nothing injected
    }

    [Fact]
    public async Task BatchSync_rejects_a_token_from_another_team()
    {
        var w = Seed();
        // A player on a different team with a different token.
        var otherTeam = Guid.NewGuid();
        w.Db.Teams.Add(new Team { Id = otherTeam, EventId = w.EventId, Name = "Birdies", MaxPlayers = 4 });
        w.Db.Players.Add(new Player
        {
            Id = Guid.NewGuid(), EventId = w.EventId, TeamId = otherTeam,
            FirstName = "Other", LastName = "Player", Email = "other@example.com",
            SessionToken = "other-team-token",
        });
        w.Db.SaveChanges();

        await Assert.ThrowsAsync<NotFoundException>(() =>
            w.Svc.BatchSyncAsync(SyncReq(w, "other-team-token", "dev-A", Pending(1, 4))));
    }

    [Fact]
    public async Task BatchSync_same_device_resync_overwrites()
    {
        var w = Seed();
        await w.Svc.BatchSyncAsync(SyncReq(w, w.SessionToken, "dev-A", Pending(1, 4)));
        var res = await w.Svc.BatchSyncAsync(SyncReq(w, w.SessionToken, "dev-A", Pending(1, 6)));

        Assert.Equal(1, res.Accepted);
        Assert.Equal(0, res.Conflicts);
        var score = w.Db.Scores.Single(s => s.TeamId == w.TeamId && s.HoleNumber == 1);
        Assert.Equal((short)6, score.GrossScore);
    }

    [Fact]
    public async Task BatchSync_different_device_same_value_is_accepted()
    {
        var w = Seed();
        await w.Svc.BatchSyncAsync(SyncReq(w, w.SessionToken, "dev-A", Pending(1, 4)));
        var res = await w.Svc.BatchSyncAsync(SyncReq(w, w.SessionToken, "dev-B", Pending(1, 4)));

        Assert.Equal(1, res.Accepted);
        Assert.Equal(0, res.Conflicts);
    }

    [Fact]
    public async Task BatchSync_different_device_different_value_flags_a_conflict()
    {
        var w = Seed();
        await w.Svc.BatchSyncAsync(SyncReq(w, w.SessionToken, "dev-A", Pending(1, 4)));
        var res = await w.Svc.BatchSyncAsync(SyncReq(w, w.SessionToken, "dev-B", Pending(1, 7)));

        Assert.Equal(0, res.Accepted);
        Assert.Equal(1, res.Conflicts);
        var score = w.Db.Scores.Single(s => s.TeamId == w.TeamId && s.HoleNumber == 1);
        Assert.Equal((short)4, score.GrossScore);   // authoritative value kept
        Assert.True(score.IsConflicted);
        Assert.Equal((short)7, score.ProposedScore); // golfer's value surfaced
    }

    [Fact]
    public async Task BatchSync_skips_out_of_range_holes()
    {
        var w = Seed();
        var res = await w.Svc.BatchSyncAsync(SyncReq(w, w.SessionToken, "dev-A", Pending(0, 4), Pending(19, 4), Pending(5, 4)));

        Assert.Equal(1, res.Accepted); // only hole 5 within 1..18
        Assert.Single(w.Db.Scores);
    }

    [Fact]
    public async Task BatchSync_publishes_leaderboard_only_when_scores_are_accepted()
    {
        var w = Seed();
        await w.Svc.BatchSyncAsync(SyncReq(w, w.SessionToken, "dev-A", Pending(1, 4)));
        Assert.Equal(1, w.Rt.LeaderboardPublishes);

        // A pure-conflict sync accepts nothing -> no publish.
        await w.Svc.BatchSyncAsync(SyncReq(w, w.SessionToken, "dev-B", Pending(1, 7)));
        Assert.Equal(1, w.Rt.LeaderboardPublishes);
    }

    [Fact]
    public async Task BatchSync_rejects_when_event_not_active_or_scoring()
    {
        var w = Seed(status: EventStatus.Registration);
        await Assert.ThrowsAsync<ValidationException>(() =>
            w.Svc.BatchSyncAsync(SyncReq(w, w.SessionToken, "dev-A", Pending(1, 4))));
    }

    [Fact]
    public async Task BatchSync_allows_draft_event_test_mode()
    {
        var w = Seed(status: EventStatus.Draft);
        var res = await w.Svc.BatchSyncAsync(SyncReq(w, w.SessionToken, "dev-A", Pending(1, 4)));
        Assert.Equal(1, res.Accepted);
    }

    [Fact]
    public async Task BatchSync_throws_NotFound_for_unknown_event()
    {
        var w = Seed();
        var req = new BatchSyncRequest
        {
            EventId = Guid.NewGuid(), TeamId = w.TeamId, SessionToken = w.SessionToken,
            Scores = new() { Pending(1, 4) },
        };
        await Assert.ThrowsAsync<NotFoundException>(() => w.Svc.BatchSyncAsync(req));
    }

    [Fact]
    public async Task BatchSync_throws_NotFound_for_unknown_team()
    {
        var w = Seed();
        var req = new BatchSyncRequest
        {
            EventId = w.EventId, TeamId = Guid.NewGuid(), SessionToken = w.SessionToken,
            Scores = new() { Pending(1, 4) },
        };
        await Assert.ThrowsAsync<NotFoundException>(() => w.Svc.BatchSyncAsync(req));
    }

    // ── JoinAsync ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Join_returns_team_payload_and_mints_a_session_token()
    {
        var w = Seed(mintToken: false);
        var res = await w.Svc.JoinAsync(World.Code, new JoinEventRequest { Email = w.PlayerEmail });

        Assert.False(string.IsNullOrEmpty(res.SessionToken));
        Assert.NotNull(res.Team);
        Assert.Equal(w.PlayerId, res.Player.Id);
        // token persisted to the player
        Assert.Equal(res.SessionToken, w.Db.Players.Single(p => p.Id == w.PlayerId).SessionToken);
    }

    [Fact]
    public async Task Join_reuses_an_existing_session_token()
    {
        var w = Seed(); // token already minted
        var res = await w.Svc.JoinAsync(World.Code, new JoinEventRequest { Email = w.PlayerEmail });
        Assert.Equal(w.SessionToken, res.SessionToken);
    }

    [Fact]
    public async Task Join_matches_email_case_insensitively_and_lowercases_code()
    {
        var w = Seed();
        var res = await w.Svc.JoinAsync(World.Code.ToLowerInvariant(),
            new JoinEventRequest { Email = w.PlayerEmail.ToUpperInvariant() });
        Assert.Equal(w.PlayerId, res.Player.Id);
    }

    [Fact]
    public async Task Join_rejects_cancelled_event()
    {
        var w = Seed(status: EventStatus.Cancelled);
        await Assert.ThrowsAsync<ValidationException>(() =>
            w.Svc.JoinAsync(World.Code, new JoinEventRequest { Email = w.PlayerEmail }));
    }

    [Fact]
    public async Task Join_rejects_completed_event()
    {
        var w = Seed(status: EventStatus.Completed);
        await Assert.ThrowsAsync<ValidationException>(() =>
            w.Svc.JoinAsync(World.Code, new JoinEventRequest { Email = w.PlayerEmail }));
    }

    [Fact]
    public async Task Join_unknown_email_throws_NotFound()
    {
        var w = Seed();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            w.Svc.JoinAsync(World.Code, new JoinEventRequest { Email = "nobody@example.com" }));
    }

    [Fact]
    public async Task Join_unknown_event_code_throws_NotFound()
    {
        var w = Seed();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            w.Svc.JoinAsync("ZZZZ9999", new JoinEventRequest { Email = w.PlayerEmail }));
    }

    [Fact]
    public async Task Join_free_agent_in_registration_awaits_assignment()
    {
        var w = Seed(status: EventStatus.Registration);
        // Free agent: no team, email stored lowercase (the lookup lowercases the input).
        w.Db.Players.Add(new Player
        {
            Id = Guid.NewGuid(), EventId = w.EventId, TeamId = null,
            FirstName = "Free", LastName = "Agent", Email = "free@example.com",
            VerifiedDeviceId = "mobile-app",
        });
        w.Db.SaveChanges();

        var res = await w.Svc.JoinAsync(World.Code, new JoinEventRequest { Email = "free@example.com" });

        Assert.True(res.AwaitingAssignment);
        Assert.Null(res.Team);
        Assert.False(string.IsNullOrEmpty(res.SessionToken));
    }

    [Fact]
    public async Task Join_free_agent_after_scoring_starts_is_blocked()
    {
        var w = Seed(status: EventStatus.Scoring);
        w.Db.Players.Add(new Player
        {
            Id = Guid.NewGuid(), EventId = w.EventId, TeamId = null,
            FirstName = "Free", LastName = "Agent", Email = "free@example.com",
        });
        w.Db.SaveChanges();

        await Assert.ThrowsAsync<ValidationException>(() =>
            w.Svc.JoinAsync(World.Code, new JoinEventRequest { Email = "free@example.com" }));
    }

    [Fact]
    public async Task Join_reflects_offlineMode_from_event_config()
    {
        var w = Seed();
        w.Db.Events.Single(e => e.Id == w.EventId).ConfigJson = "{\"offlineMode\":true}";
        w.Db.SaveChanges();

        var res = await w.Svc.JoinAsync(World.Code, new JoinEventRequest { Email = w.PlayerEmail });
        Assert.True(res.Event.OfflineMode);
    }

    // ── JoinAsync — A3 email verification ─────────────────────────────────────────

    [Fact]
    public async Task Join_from_unverified_device_challenges_instead_of_minting_a_token()
    {
        var w = Seed(mintToken: false, verifiedDevice: false);
        var res = await w.Svc.JoinAsync(World.Code, new JoinEventRequest { Email = w.PlayerEmail });

        Assert.True(res.VerificationRequired);
        Assert.True(string.IsNullOrEmpty(res.SessionToken)); // no capability handed out

        var p = w.Db.Players.Single(p => p.Id == w.PlayerId);
        Assert.Null(p.SessionToken);                          // token NOT minted
        Assert.Matches(@"^\d{6}$", p.VerificationCode);       // 6-digit code stored
        Assert.NotNull(p.VerificationExpiresAt);
        Assert.True(p.VerificationExpiresAt > DateTime.UtcNow);
    }

    [Fact]
    public async Task Join_with_the_emailed_code_verifies_and_returns_the_payload()
    {
        var w = Seed(mintToken: false, verifiedDevice: false);
        await w.Svc.JoinAsync(World.Code, new JoinEventRequest { Email = w.PlayerEmail, DeviceId = "dev-1" });
        var code = w.Db.Players.Single(p => p.Id == w.PlayerId).VerificationCode!;

        var res = await w.Svc.JoinAsync(World.Code, new JoinEventRequest
        {
            Email = w.PlayerEmail, DeviceId = "dev-1", VerificationCode = code,
        });

        Assert.False(res.VerificationRequired);
        Assert.False(string.IsNullOrEmpty(res.SessionToken));

        var p = w.Db.Players.Single(p => p.Id == w.PlayerId);
        Assert.Equal("dev-1", p.VerifiedDeviceId); // device remembered
        Assert.Null(p.VerificationCode);           // one-time code consumed

        // Rejoin from the SAME device skips the challenge entirely
        var again = await w.Svc.JoinAsync(World.Code, new JoinEventRequest
        {
            Email = w.PlayerEmail, DeviceId = "dev-1",
        });
        Assert.False(again.VerificationRequired);
        Assert.Equal(res.SessionToken, again.SessionToken);
    }

    [Fact]
    public async Task Join_with_a_wrong_code_throws_and_counts_the_attempt()
    {
        var w = Seed(verifiedDevice: false);
        await w.Svc.JoinAsync(World.Code, new JoinEventRequest { Email = w.PlayerEmail });

        await Assert.ThrowsAsync<ValidationException>(() =>
            w.Svc.JoinAsync(World.Code, new JoinEventRequest
            {
                Email = w.PlayerEmail, VerificationCode = "000001",
            }));

        var p = w.Db.Players.Single(p => p.Id == w.PlayerId);
        Assert.Equal((short)1, p.VerificationAttempts);
        Assert.NotNull(p.VerificationCode); // still pending — golfer can retry
    }

    [Fact]
    public async Task Join_invalidates_the_code_after_too_many_wrong_attempts()
    {
        var w = Seed(verifiedDevice: false);
        await w.Svc.JoinAsync(World.Code, new JoinEventRequest { Email = w.PlayerEmail });
        var realCode = w.Db.Players.Single(p => p.Id == w.PlayerId).VerificationCode!;
        var wrong = realCode == "000001" ? "000002" : "000001";

        for (var i = 0; i < 5; i++)
            await Assert.ThrowsAsync<ValidationException>(() =>
                w.Svc.JoinAsync(World.Code, new JoinEventRequest
                {
                    Email = w.PlayerEmail, VerificationCode = wrong,
                }));

        // 6th try hits the attempt limit and invalidates the pending code —
        // even the REAL code no longer works until a new one is requested.
        await Assert.ThrowsAsync<ValidationException>(() =>
            w.Svc.JoinAsync(World.Code, new JoinEventRequest
            {
                Email = w.PlayerEmail, VerificationCode = realCode,
            }));
        Assert.Null(w.Db.Players.Single(p => p.Id == w.PlayerId).VerificationCode);
    }

    [Fact]
    public async Task Join_rejects_an_expired_code()
    {
        var w = Seed(verifiedDevice: false);
        await w.Svc.JoinAsync(World.Code, new JoinEventRequest { Email = w.PlayerEmail });

        var p = w.Db.Players.Single(p => p.Id == w.PlayerId);
        var code = p.VerificationCode!;
        p.VerificationExpiresAt = DateTime.UtcNow.AddMinutes(-1);
        w.Db.SaveChanges();

        await Assert.ThrowsAsync<ValidationException>(() =>
            w.Svc.JoinAsync(World.Code, new JoinEventRequest
            {
                Email = w.PlayerEmail, VerificationCode = code,
            }));
    }

    [Fact]
    public async Task Join_accepts_the_test_bypass_code_when_configured()
    {
        var w = Seed(mintToken: false, verifiedDevice: false, bypassCode: "999999");

        var res = await w.Svc.JoinAsync(World.Code, new JoinEventRequest
        {
            Email = w.PlayerEmail, DeviceId = "dev-1", VerificationCode = "999999",
        });

        Assert.False(res.VerificationRequired);
        Assert.False(string.IsNullOrEmpty(res.SessionToken));
        Assert.Equal("dev-1", w.Db.Players.Single(p => p.Id == w.PlayerId).VerifiedDeviceId);
    }

    [Fact]
    public async Task Join_rejects_the_test_bypass_code_when_not_configured()
    {
        var w = Seed(verifiedDevice: false); // no bypass in config (production posture)
        await Assert.ThrowsAsync<ValidationException>(() =>
            w.Svc.JoinAsync(World.Code, new JoinEventRequest
            {
                Email = w.PlayerEmail, VerificationCode = "999999",
            }));
    }

    [Fact]
    public async Task Join_skips_verification_for_draft_test_mode_events()
    {
        var w = Seed(status: EventStatus.Draft, mintToken: false, verifiedDevice: false);
        var res = await w.Svc.JoinAsync(World.Code, new JoinEventRequest { Email = w.PlayerEmail });

        Assert.False(res.VerificationRequired);
        Assert.False(string.IsNullOrEmpty(res.SessionToken));
    }

    [Fact]
    public async Task Join_challenges_an_unverified_free_agent_before_minting_a_token()
    {
        var w = Seed(status: EventStatus.Registration);
        var freeAgentId = Guid.NewGuid();
        w.Db.Players.Add(new Player
        {
            Id = freeAgentId, EventId = w.EventId, TeamId = null,
            FirstName = "Free", LastName = "Agent", Email = "free@example.com",
        });
        w.Db.SaveChanges();

        var res = await w.Svc.JoinAsync(World.Code, new JoinEventRequest { Email = "free@example.com" });

        Assert.True(res.VerificationRequired);
        Assert.False(res.AwaitingAssignment);
        Assert.Null(w.Db.Players.Single(p => p.Id == freeAgentId).SessionToken);
    }

    // ── GetTeamScoresAsync ────────────────────────────────────────────────────────

    [Fact]
    public async Task GetTeamScores_returns_holes_in_order_with_conflict_state()
    {
        var w = Seed();
        await w.Svc.BatchSyncAsync(SyncReq(w, w.SessionToken, "dev-A", Pending(3, 5), Pending(1, 4)));
        await w.Svc.BatchSyncAsync(SyncReq(w, w.SessionToken, "dev-B", Pending(1, 7))); // conflict on hole 1

        var res = await w.Svc.GetTeamScoresAsync(World.Code, w.TeamId);

        Assert.Equal(new short[] { 1, 3 }, res.Holes.Select(h => h.HoleNumber).ToArray());
        var hole1 = res.Holes.First(h => h.HoleNumber == 1);
        Assert.True(hole1.IsConflicted);
        Assert.Equal((short)7, hole1.ProposedScore);
    }

    [Fact]
    public async Task GetTeamScores_unknown_event_throws_NotFound()
    {
        var w = Seed();
        await Assert.ThrowsAsync<NotFoundException>(() => w.Svc.GetTeamScoresAsync("ZZZZ9999", w.TeamId));
    }

    [Fact]
    public async Task GetTeamScores_team_not_in_event_throws_NotFound()
    {
        var w = Seed();
        await Assert.ThrowsAsync<NotFoundException>(() => w.Svc.GetTeamScoresAsync(World.Code, Guid.NewGuid()));
    }

    // ── ListActiveEventsAsync ─────────────────────────────────────────────────────

    [Fact]
    public async Task ListActiveEvents_includes_open_statuses_and_excludes_draft_completed()
    {
        var w = Seed(status: EventStatus.Active);
        var orgId = w.Db.Organizations.Local.First().Id;
        w.Db.Events.Add(new Event
        {
            Id = Guid.NewGuid(), OrgId = orgId, Name = "Draft One", EventCode = "DRFT0001",
            Format = EventFormat.Scramble, StartType = EventStartType.Shotgun, Holes = 18,
            Status = EventStatus.Draft, ConfigJson = "{}",
        });
        w.Db.SaveChanges();

        var list = await w.Svc.ListActiveEventsAsync();

        Assert.Contains(list, e => e.Id == w.EventId);
        Assert.DoesNotContain(list, e => e.Name == "Draft One");
    }
}
