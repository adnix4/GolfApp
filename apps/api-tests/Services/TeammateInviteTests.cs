using Xunit;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Payments;
using GolfFundraiserPro.Api.Features.Teams;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Services;

/// <summary>
/// The mobile Team screen's "Invite a teammate" (TeamService.GetTeammateInviteAsync):
/// any teammate can invite while registration is open and the team has room,
/// proving who they are with their session token. A working link is reused so
/// links already sent keep working; a missing or expired one is minted.
/// </summary>
public class TeammateInviteTests
{
    private const string Secret = "test-jwt-secret-that-is-definitely-long-enough-32+";

    private sealed record Ctx(ApplicationDbContext Db, TeamService Svc, Guid EventId, Guid TeamId, Guid MemberId);

    private const string Token = "member-session-token";

    /// A Registration event with one team: a captain plus a non-captain member
    /// (the one who invites — any teammate may), <paramref name="max"/> spots.
    private static Ctx Build(
        EventStatus status = EventStatus.Registration, string configJson = "{}", short max = 4,
        string? inviteToken = null, DateTime? inviteExpiresAt = null)
    {
        var db = InMemoryDbFactory.Create();
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["JWT_SECRET"] = Secret, ["WEB_BASE_URL"] = "https://golf.example" })
            .Build();
        var orgId = Guid.NewGuid(); var eventId = Guid.NewGuid(); var teamId = Guid.NewGuid();
        var captainId = Guid.NewGuid(); var memberId = Guid.NewGuid();
        db.Organizations.Add(new Organization { Id = orgId, Name = "Acme", Slug = "acme" });
        db.Events.Add(new Event
        {
            Id = eventId, OrgId = orgId, Name = "Gala", EventCode = "GALA0001",
            Format = EventFormat.Scramble, StartType = EventStartType.Shotgun, Holes = 18,
            Status = status, ConfigJson = configJson, StartAt = DateTime.UtcNow.AddDays(14),
        });
        db.Teams.Add(new Team
        {
            Id = teamId, EventId = eventId, Name = "Birdies", MaxPlayers = max,
            CaptainPlayerId = captainId, InviteToken = inviteToken, InviteExpiresAt = inviteExpiresAt,
        });
        db.Players.Add(new Player { Id = captainId, EventId = eventId, TeamId = teamId, FirstName = "Cap", LastName = "Tain", Email = "cap@x.com" });
        db.Players.Add(new Player { Id = memberId, EventId = eventId, TeamId = teamId, FirstName = "Mem", LastName = "Ber", Email = "mem@x.com", SessionToken = Token });
        db.SaveChanges();
        var payments = new PaymentsService(db, config, NullLogger<PaymentsService>.Instance);
        var svc = new TeamService(db, config, payments, new NullRealTimeService(), NullLogger<TeamService>.Instance);
        return new Ctx(db, svc, eventId, teamId, memberId);
    }

    [Fact]
    public async Task Any_teammate_sees_the_button_with_spots_left()
    {
        var c = Build();
        var res = await c.Svc.GetTeammateInviteAsync(c.MemberId, Token, issueLink: false);

        Assert.True(res.CanInvite);
        Assert.Null(res.Reason);
        Assert.Equal(2, res.SpotsLeft);
        Assert.Equal("Birdies", res.TeamName);
        Assert.Null(res.InviteUrl);                              // GET never mints
        Assert.Null(c.Db.Teams.Single().InviteToken);
    }

    [Fact]
    public async Task Issuing_mints_a_link_for_a_team_that_had_none_and_it_joins()
    {
        var c = Build();
        var res = await c.Svc.GetTeammateInviteAsync(c.MemberId, Token, issueLink: true);

        var team = c.Db.Teams.Single();
        Assert.NotNull(team.InviteToken);
        Assert.Equal($"https://golf.example/e/acme/GALA0001/join?token={Uri.EscapeDataString(team.InviteToken!)}", res.InviteUrl);
        Assert.Equal(team.InviteExpiresAt, res.ExpiresAt);

        // The link works: someone joins through it.
        var orgId = c.Db.Events.Single().OrgId;
        await c.Svc.JoinTeamAsync(orgId, c.EventId, new JoinTeamRequest
        {
            InviteToken = team.InviteToken!,
            Player = new() { FirstName = "New", LastName = "Friend", Email = "new@x.com" },
        });
        Assert.Equal(3, c.Db.Players.Count(p => p.TeamId == c.TeamId));
    }

    [Fact]
    public async Task A_working_link_is_reused_so_links_already_sent_keep_working()
    {
        var c = Build();
        var first  = await c.Svc.GetTeammateInviteAsync(c.MemberId, Token, issueLink: true);
        var second = await c.Svc.GetTeammateInviteAsync(c.MemberId, Token, issueLink: true);
        Assert.Equal(first.InviteUrl, second.InviteUrl);
    }

    [Fact]
    public async Task An_expired_link_is_replaced()
    {
        var c = Build(inviteToken: "old-token", inviteExpiresAt: DateTime.UtcNow.AddMinutes(-1));
        var res = await c.Svc.GetTeammateInviteAsync(c.MemberId, Token, issueLink: true);

        Assert.NotEqual("old-token", c.Db.Teams.Single().InviteToken);
        Assert.DoesNotContain("old-token", res.InviteUrl);
        Assert.True(res.ExpiresAt > DateTime.UtcNow);
    }

    [Theory]
    [InlineData(EventStatus.Active,    "{}",                        "Registration for this event has closed.")]
    [InlineData(EventStatus.Scoring,   "{}",                        "Registration for this event has closed.")]
    [InlineData(EventStatus.Completed, "{}",                        "Registration for this event has closed.")]
    public async Task No_invite_once_registration_closes(EventStatus status, string config, string reason)
    {
        var c = Build(status, config);
        var res = await c.Svc.GetTeammateInviteAsync(c.MemberId, Token, issueLink: false);
        Assert.False(res.CanInvite);
        Assert.Equal(reason, res.Reason);

        var ex = await Assert.ThrowsAsync<ValidationException>(() => c.Svc.GetTeammateInviteAsync(c.MemberId, Token, issueLink: true));
        Assert.Equal(reason, ex.Message);
        Assert.Null(c.Db.Teams.Single().InviteToken);
    }

    [Fact]
    public async Task Active_with_walk_ups_still_allows_invites_like_joining_does()
    {
        var c = Build(EventStatus.Active, """{"allowWalkUps":true}""");
        Assert.True((await c.Svc.GetTeammateInviteAsync(c.MemberId, Token, issueLink: false)).CanInvite);
    }

    [Fact]
    public async Task No_invite_when_the_team_is_full()
    {
        var c = Build(max: 2);
        var res = await c.Svc.GetTeammateInviteAsync(c.MemberId, Token, issueLink: false);
        Assert.False(res.CanInvite);
        Assert.Equal("Your team is full.", res.Reason);
        Assert.Equal(0, res.SpotsLeft);
        await Assert.ThrowsAsync<ValidationException>(() => c.Svc.GetTeammateInviteAsync(c.MemberId, Token, issueLink: true));
    }

    [Fact]
    public async Task A_free_agent_has_no_team_to_invite_to()
    {
        var c = Build();
        c.Db.Players.Single(p => p.Id == c.MemberId).TeamId = null;
        c.Db.SaveChanges();

        var res = await c.Svc.GetTeammateInviteAsync(c.MemberId, Token, issueLink: false);
        Assert.False(res.CanInvite);
        Assert.Equal("You're not on a team yet.", res.Reason);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("someone-elses-token")]
    public async Task A_wrong_session_token_looks_like_no_such_player(string? token)
    {
        var c = Build();
        await Assert.ThrowsAsync<NotFoundException>(() => c.Svc.GetTeammateInviteAsync(c.MemberId, token, issueLink: true));
        Assert.Null(c.Db.Teams.Single().InviteToken);
    }
}
