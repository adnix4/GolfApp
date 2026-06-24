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
/// Tests for TeamService: full-team registration (+invite token), invite join
/// (expiry/full/token guards), free-agent registration, manual assignment, and the
/// snake-draft auto-pair. Entry-fee Stripe is avoided by leaving the fee unset.
/// </summary>
public class TeamServiceTests
{
    private const string Secret = "test-jwt-secret-that-is-definitely-long-enough-32+";

    private sealed class Ctx
    {
        public ApplicationDbContext Db = null!;
        public TeamService Svc = null!;
        public Guid OrgId;
        public Guid EventId;
    }

    private static Ctx Build(EventStatus status = EventStatus.Registration, string configJson = "{}")
    {
        var db = InMemoryDbFactory.Create();
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["JWT_SECRET"] = Secret })
            .Build();
        var orgId = Guid.NewGuid();
        var eventId = Guid.NewGuid();
        db.Organizations.Add(new Organization { Id = orgId, Name = "Acme", Slug = "acme" });
        db.Events.Add(new Event
        {
            Id = eventId, OrgId = orgId, Name = "Gala", EventCode = "GALA0001",
            Format = EventFormat.Scramble, StartType = EventStartType.Shotgun,
            Holes = 18, Status = status, ConfigJson = configJson,
        });
        db.SaveChanges();
        var payments = new PaymentsService(db, config, NullLogger<PaymentsService>.Instance);
        return new Ctx { Db = db, Svc = new TeamService(db, config, payments, NullLogger<TeamService>.Instance), OrgId = orgId, EventId = eventId };
    }

    private static PlayerInput P(string last, string? email = null) =>
        new() { FirstName = "P", LastName = last, Email = email ?? $"{last.ToLower()}@x.com" };

    // ── Register full team ──────────────────────────────────────────────────────

    [Fact]
    public async Task RegisterTeam_creates_team_players_and_invite_when_not_full()
    {
        var c = Build();
        var res = await c.Svc.RegisterTeamAsync(c.OrgId, c.EventId, new RegisterTeamRequest
        {
            TeamName = "Bogeys", MaxPlayers = 4, Players = new() { P("Capt"), P("Two") },
        });

        Assert.Equal("Bogeys", res.Team.Name);
        Assert.Equal(2, res.Team.Players.Count);
        Assert.NotNull(res.Team.CaptainPlayerId);
        Assert.True(res.Team.HasInviteLink);    // 2 of 4 -> invite generated
        Assert.NotNull(res.InviteUrl);
    }

    [Fact]
    public async Task RegisterTeam_full_roster_has_no_invite()
    {
        var c = Build();
        var res = await c.Svc.RegisterTeamAsync(c.OrgId, c.EventId, new RegisterTeamRequest
        {
            TeamName = "Full", MaxPlayers = 2, Players = new() { P("A"), P("B") },
        });
        Assert.False(res.Team.HasInviteLink);
        Assert.Null(res.InviteUrl);
    }

    [Fact]
    public async Task RegisterTeam_email_already_in_event_throws_Conflict()
    {
        var c = Build();
        // First registration claims the email; a later team re-using it must conflict.
        await c.Svc.RegisterTeamAsync(c.OrgId, c.EventId, new RegisterTeamRequest
        {
            TeamName = "First", Players = new() { P("A", "dup@x.com") },
        });

        await Assert.ThrowsAsync<ConflictException>(() =>
            c.Svc.RegisterTeamAsync(c.OrgId, c.EventId, new RegisterTeamRequest
            {
                TeamName = "Second", Players = new() { P("B", "dup@x.com") },
            }));
    }

    [Fact]
    public async Task RegisterTeam_more_players_than_max_throws_Validation()
    {
        var c = Build();
        await Assert.ThrowsAsync<ValidationException>(() =>
            c.Svc.RegisterTeamAsync(c.OrgId, c.EventId, new RegisterTeamRequest
            {
                TeamName = "Over", MaxPlayers = 1, Players = new() { P("A"), P("B") },
            }));
    }

    [Fact]
    public async Task RegisterTeam_on_completed_event_throws_Validation()
    {
        var c = Build(EventStatus.Completed);
        await Assert.ThrowsAsync<ValidationException>(() =>
            c.Svc.RegisterTeamAsync(c.OrgId, c.EventId, new RegisterTeamRequest
            {
                TeamName = "Late", Players = new() { P("A") },
            }));
    }

    // ── Join via invite ───────────────────────────────────────────────────────────

    [Fact]
    public async Task JoinTeam_adds_player_with_a_valid_invite()
    {
        var c = Build();
        var reg = await c.Svc.RegisterTeamAsync(c.OrgId, c.EventId, new RegisterTeamRequest
        {
            TeamName = "Joinable", MaxPlayers = 4, Players = new() { P("Capt") },
        });
        var token = c.Db.Teams.Single().InviteToken!;

        var res = await c.Svc.JoinTeamAsync(c.OrgId, c.EventId, new JoinTeamRequest
        {
            InviteToken = token, Player = P("Newbie"),
        });

        Assert.Equal(2, res.Team.Players.Count);
    }

    [Fact]
    public async Task JoinTeam_clears_invite_when_team_becomes_full()
    {
        var c = Build();
        await c.Svc.RegisterTeamAsync(c.OrgId, c.EventId, new RegisterTeamRequest
        {
            TeamName = "AlmostFull", MaxPlayers = 2, Players = new() { P("Capt") },
        });
        var token = c.Db.Teams.Single().InviteToken!;

        await c.Svc.JoinTeamAsync(c.OrgId, c.EventId, new JoinTeamRequest { InviteToken = token, Player = P("Last") });

        Assert.Null(c.Db.Teams.Single().InviteToken); // cleared once full
    }

    [Fact]
    public async Task JoinTeam_with_expired_invite_throws_Validation()
    {
        var c = Build();
        await c.Svc.RegisterTeamAsync(c.OrgId, c.EventId, new RegisterTeamRequest
        {
            TeamName = "Expired", MaxPlayers = 4, Players = new() { P("Capt") },
        });
        var team = c.Db.Teams.Single();
        var token = team.InviteToken!;
        team.InviteExpiresAt = DateTime.UtcNow.AddHours(-1); // stored expiry in the past
        await c.Db.SaveChangesAsync();

        await Assert.ThrowsAsync<ValidationException>(() =>
            c.Svc.JoinTeamAsync(c.OrgId, c.EventId, new JoinTeamRequest { InviteToken = token, Player = P("X") }));
    }

    // ── Free agent ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task RegisterFreeAgent_blocked_when_not_enabled()
    {
        var c = Build(configJson: "{}");
        await Assert.ThrowsAsync<ValidationException>(() =>
            c.Svc.RegisterFreeAgentAsync(c.OrgId, c.EventId, new RegisterFreeAgentRequest { Player = P("Solo") }));
    }

    [Fact]
    public async Task RegisterFreeAgent_succeeds_when_enabled()
    {
        var c = Build(configJson: "{\"freeAgentEnabled\":true}");
        var res = await c.Svc.RegisterFreeAgentAsync(c.OrgId, c.EventId, new RegisterFreeAgentRequest { Player = P("Solo") });
        Assert.NotNull(res.Player);
        Assert.Null(res.Player!.TeamId);
    }

    // ── Assign + auto-pair ──────────────────────────────────────────────────────

    [Fact]
    public async Task AssignFreeAgent_to_full_team_throws_Validation()
    {
        var c = Build(configJson: "{\"freeAgentEnabled\":true}");
        var team = await c.Svc.RegisterTeamAsync(c.OrgId, c.EventId, new RegisterTeamRequest
        {
            TeamName = "Full", MaxPlayers = 1, Players = new() { P("A") },
        });
        var fa = await c.Svc.RegisterFreeAgentAsync(c.OrgId, c.EventId, new RegisterFreeAgentRequest { Player = P("Solo") });

        await Assert.ThrowsAsync<ValidationException>(() =>
            c.Svc.AssignFreeAgentAsync(c.OrgId, c.EventId, new AssignFreeAgentRequest
            {
                PlayerId = fa.Player!.Id, TeamId = team.Team.Id,
            }));
    }

    [Fact]
    public async Task AssignFreeAgent_unknown_or_assigned_player_throws_NotFound()
    {
        var c = Build();
        var team = await c.Svc.RegisterTeamAsync(c.OrgId, c.EventId, new RegisterTeamRequest
        {
            TeamName = "T", MaxPlayers = 4, Players = new() { P("A") },
        });
        await Assert.ThrowsAsync<NotFoundException>(() =>
            c.Svc.AssignFreeAgentAsync(c.OrgId, c.EventId, new AssignFreeAgentRequest
            {
                PlayerId = Guid.NewGuid(), TeamId = team.Team.Id,
            }));
    }

    [Fact]
    public async Task AutoPair_groups_free_agents_into_new_teams()
    {
        var c = Build(configJson: "{\"freeAgentEnabled\":true}");
        for (int i = 0; i < 4; i++)
            await c.Svc.RegisterFreeAgentAsync(c.OrgId, c.EventId, new RegisterFreeAgentRequest { Player = P($"Agent{i}") });

        var res = await c.Svc.AutoPairAsync(c.OrgId, c.EventId, new AutoPairRequest
        {
            PlayersPerTeam = 2, FillExistingTeams = false, TeamNamePrefix = "Auto",
        });

        Assert.Equal(4, res.AgentsAssigned);
        Assert.Equal(2, res.TeamsCreated);
        Assert.All(c.Db.Players, p => Assert.NotNull(p.TeamId));
    }

    [Fact]
    public async Task AutoPair_leaves_a_lone_agent_unassigned()
    {
        var c = Build(configJson: "{\"freeAgentEnabled\":true}");
        for (int i = 0; i < 3; i++)
            await c.Svc.RegisterFreeAgentAsync(c.OrgId, c.EventId, new RegisterFreeAgentRequest { Player = P($"Agent{i}") });

        var res = await c.Svc.AutoPairAsync(c.OrgId, c.EventId, new AutoPairRequest
        {
            PlayersPerTeam = 2, FillExistingTeams = false, TeamNamePrefix = "Auto",
        });

        // 3 agents, teams of 2 -> one team of 2, one leftover stays unassigned (need >=2).
        Assert.Equal(2, res.AgentsAssigned);
        Assert.Single(res.Unassigned);
    }

    [Fact]
    public async Task AutoPair_with_no_agents_reports_zero()
    {
        var c = Build();
        var res = await c.Svc.AutoPairAsync(c.OrgId, c.EventId, new AutoPairRequest());
        Assert.Equal(0, res.AgentsAssigned);
    }

    // ── Delete team guard ───────────────────────────────────────────────────────

    [Fact]
    public async Task DeleteTeam_with_players_throws_Validation()
    {
        var c = Build();
        var reg = await c.Svc.RegisterTeamAsync(c.OrgId, c.EventId, new RegisterTeamRequest
        {
            TeamName = "HasPlayers", Players = new() { P("A") },
        });
        await Assert.ThrowsAsync<ValidationException>(() =>
            c.Svc.DeleteTeamAsync(c.OrgId, c.EventId, reg.Team.Id));
    }
}
