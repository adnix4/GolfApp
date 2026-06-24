using Xunit;
using Microsoft.Extensions.Logging.Abstractions;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Players;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Services;

/// <summary>
/// Tests for PlayerService: add (team-full + status guards), update/reassign,
/// check-in (status guard, idempotency guard, team-complete cascade), and remove
/// (lifecycle guard). Uses NullRealTimeService for the check-in broadcast.
/// </summary>
public class PlayerServiceTests
{
    private sealed class Ctx
    {
        public ApplicationDbContext Db = null!;
        public PlayerService Svc = null!;
        public Guid OrgId;
        public Guid EventId;
    }

    private static Ctx Build(EventStatus status = EventStatus.Registration)
    {
        var db = InMemoryDbFactory.Create();
        var orgId = Guid.NewGuid();
        var eventId = Guid.NewGuid();
        db.Organizations.Add(new Organization { Id = orgId, Name = "Acme", Slug = "acme" });
        db.Events.Add(new Event
        {
            Id = eventId, OrgId = orgId, Name = "Gala", EventCode = "GALA0001",
            Format = EventFormat.Scramble, StartType = EventStartType.Shotgun,
            Holes = 18, Status = status, ConfigJson = "{}",
        });
        db.SaveChanges();
        return new Ctx { Db = db, Svc = new PlayerService(db, new NullRealTimeService(), NullLogger<PlayerService>.Instance), OrgId = orgId, EventId = eventId };
    }

    private static Guid AddTeam(Ctx c, short max = 4)
    {
        var id = Guid.NewGuid();
        c.Db.Teams.Add(new Team { Id = id, EventId = c.EventId, Name = "Eagles", MaxPlayers = max });
        c.Db.SaveChanges();
        return id;
    }

    private static AddPlayerRequest NewPlayer(Guid? teamId = null, string last = "Doe") =>
        new() { FirstName = "Jane", LastName = last, Email = $"{Guid.NewGuid():N}@x.com", TeamId = teamId };

    // ── Add ─────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Add_free_agent_has_no_team()
    {
        var c = Build();
        var res = await c.Svc.AddAsync(c.OrgId, c.EventId, NewPlayer());
        Assert.Null(res.TeamId);
    }

    [Fact]
    public async Task Add_to_full_team_throws_Validation()
    {
        var c = Build();
        var teamId = AddTeam(c, max: 1);
        await c.Svc.AddAsync(c.OrgId, c.EventId, NewPlayer(teamId));
        await Assert.ThrowsAsync<ValidationException>(() => c.Svc.AddAsync(c.OrgId, c.EventId, NewPlayer(teamId)));
    }

    [Fact]
    public async Task Add_to_completed_event_throws_Validation()
    {
        var c = Build(EventStatus.Completed);
        await Assert.ThrowsAsync<ValidationException>(() => c.Svc.AddAsync(c.OrgId, c.EventId, NewPlayer()));
    }

    [Fact]
    public async Task Add_to_event_owned_by_other_org_throws_NotFound()
    {
        var c = Build();
        await Assert.ThrowsAsync<NotFoundException>(() => c.Svc.AddAsync(Guid.NewGuid(), c.EventId, NewPlayer()));
    }

    // ── Update ──────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Update_reassigns_to_a_team()
    {
        var c = Build();
        var teamId = AddTeam(c);
        var player = await c.Svc.AddAsync(c.OrgId, c.EventId, NewPlayer());

        var res = await c.Svc.UpdateAsync(c.OrgId, c.EventId, player.Id, new UpdatePlayerRequest { TeamId = teamId });
        Assert.Equal(teamId, res.TeamId);
    }

    [Fact]
    public async Task Update_to_full_team_throws_Validation()
    {
        var c = Build();
        var full = AddTeam(c, max: 1);
        await c.Svc.AddAsync(c.OrgId, c.EventId, NewPlayer(full));
        var solo = await c.Svc.AddAsync(c.OrgId, c.EventId, NewPlayer());

        await Assert.ThrowsAsync<ValidationException>(() =>
            c.Svc.UpdateAsync(c.OrgId, c.EventId, solo.Id, new UpdatePlayerRequest { TeamId = full }));
    }

    [Fact]
    public async Task Update_clear_team_makes_free_agent()
    {
        var c = Build();
        var teamId = AddTeam(c);
        var player = await c.Svc.AddAsync(c.OrgId, c.EventId, NewPlayer(teamId));

        var res = await c.Svc.UpdateAsync(c.OrgId, c.EventId, player.Id, new UpdatePlayerRequest { ClearTeam = true });
        Assert.Null(res.TeamId);
    }

    // ── Check-in ──────────────────────────────────────────────────────────────────

    [Fact]
    public async Task CheckIn_requires_active_event()
    {
        var c = Build(EventStatus.Registration);
        var player = await c.Svc.AddAsync(c.OrgId, c.EventId, NewPlayer());
        await Assert.ThrowsAsync<ValidationException>(() => c.Svc.CheckInAsync(c.OrgId, c.EventId, player.Id));
    }

    [Fact]
    public async Task CheckIn_marks_checked_in_and_is_not_repeatable()
    {
        var c = Build(EventStatus.Active);
        var player = await c.Svc.AddAsync(c.OrgId, c.EventId, NewPlayer());

        var res = await c.Svc.CheckInAsync(c.OrgId, c.EventId, player.Id);
        Assert.Equal(CheckInStatus.CheckedIn.ToString(), res.CheckInStatus);

        await Assert.ThrowsAsync<ValidationException>(() => c.Svc.CheckInAsync(c.OrgId, c.EventId, player.Id));
    }

    [Fact]
    public async Task CheckIn_completes_the_team_when_all_members_are_in()
    {
        var c = Build(EventStatus.Active);
        var teamId = AddTeam(c, max: 2);
        var p1 = await c.Svc.AddAsync(c.OrgId, c.EventId, NewPlayer(teamId));
        var p2 = await c.Svc.AddAsync(c.OrgId, c.EventId, NewPlayer(teamId));

        await c.Svc.CheckInAsync(c.OrgId, c.EventId, p1.Id);
        Assert.NotEqual(CheckInStatus.Complete, c.Db.Teams.Single(t => t.Id == teamId).CheckInStatus);

        await c.Svc.CheckInAsync(c.OrgId, c.EventId, p2.Id);
        Assert.Equal(CheckInStatus.Complete, c.Db.Teams.Single(t => t.Id == teamId).CheckInStatus);
    }

    // ── Remove ──────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Remove_is_blocked_once_scoring()
    {
        var c = Build(EventStatus.Scoring);
        var player = await SeedPlayerDirect(c);
        await Assert.ThrowsAsync<ValidationException>(() => c.Svc.RemoveAsync(c.OrgId, c.EventId, player));
    }

    [Fact]
    public async Task Remove_succeeds_during_registration()
    {
        var c = Build(EventStatus.Registration);
        var player = await c.Svc.AddAsync(c.OrgId, c.EventId, NewPlayer());
        await c.Svc.RemoveAsync(c.OrgId, c.EventId, player.Id);
        Assert.Empty(c.Db.Players);
    }

    /// <summary>Adds a player directly (AddAsync is blocked in Scoring status).</summary>
    private static async Task<Guid> SeedPlayerDirect(Ctx c)
    {
        var id = Guid.NewGuid();
        c.Db.Players.Add(new Player { Id = id, EventId = c.EventId, FirstName = "S", LastName = "T", Email = "s@x.com" });
        await c.Db.SaveChangesAsync();
        return id;
    }
}
