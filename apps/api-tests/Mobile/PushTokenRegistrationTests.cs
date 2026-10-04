using Microsoft.AspNetCore.Mvc;
using Xunit;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Features.Notifications;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Mobile;

/// <summary>
/// POST /players/{id}/push-token decides who receives a golfer's outbid alerts.
/// Player ids are public (the Stroke Play board lists them), so the endpoint
/// must demand the golfer's /join session token like every other self-action
/// (problemList D5), and must not reveal whether an id exists.
/// </summary>
public class PushTokenRegistrationTests
{
    private const string Session = "session-token-from-join";

    private static async Task<(ApplicationDbContext db, NotificationsController ctl, Guid playerId)> Setup()
    {
        var db = InMemoryDbFactory.Create();
        var id = Guid.NewGuid();
        db.Players.Add(new Player
        {
            Id = id, EventId = Guid.NewGuid(), FirstName = "Ava", LastName = "Stone",
            Email = "ava@example.com", SessionToken = Session, ExpoPushToken = "ExponentPushToken[original]",
        });
        await db.SaveChangesAsync();
        return (db, new NotificationsController(db), id);
    }

    private static string? StoredToken(ApplicationDbContext db, Guid id) =>
        db.Players.Single(p => p.Id == id).ExpoPushToken;

    [Fact]
    public async Task Registers_with_the_golfers_own_session_token()
    {
        var (db, ctl, id) = await Setup();
        var result = await ctl.RegisterPushToken(id, new RegisterPushTokenRequest("ExponentPushToken[new]", Session), default);
        Assert.IsType<OkObjectResult>(result);
        Assert.Equal("ExponentPushToken[new]", StoredToken(db, id));
    }

    [Fact]
    public async Task Opting_out_with_a_null_token_needs_the_session_too()
    {
        var (db, ctl, id) = await Setup();
        var result = await ctl.RegisterPushToken(id, new RegisterPushTokenRequest(null, Session), default);
        Assert.IsType<OkObjectResult>(result);
        Assert.Null(StoredToken(db, id));
    }

    // Before D5 any caller could do both of these with just a public player id.
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("someone-elses-session")]
    public async Task Without_the_right_session_neither_hijacks_nor_clears(string? session)
    {
        var (db, ctl, id) = await Setup();

        var hijack = await ctl.RegisterPushToken(id, new RegisterPushTokenRequest("ExponentPushToken[attacker]", session), default);
        var clear  = await ctl.RegisterPushToken(id, new RegisterPushTokenRequest(null, session), default);

        Assert.IsType<NotFoundObjectResult>(hijack);
        Assert.IsType<NotFoundObjectResult>(clear);
        Assert.Equal("ExponentPushToken[original]", StoredToken(db, id));
    }

    [Fact]
    public async Task A_wrong_session_looks_exactly_like_an_unknown_player()
    {
        var (_, ctl, id) = await Setup();
        var wrong   = await ctl.RegisterPushToken(id, new RegisterPushTokenRequest("x", "nope"), default) as NotFoundObjectResult;
        var unknown = await ctl.RegisterPushToken(Guid.NewGuid(), new RegisterPushTokenRequest("x", Session), default) as NotFoundObjectResult;
        Assert.NotNull(wrong);
        Assert.NotNull(unknown);
        Assert.Equal(System.Text.Json.JsonSerializer.Serialize(unknown!.Value),
                     System.Text.Json.JsonSerializer.Serialize(wrong!.Value));
    }
}
