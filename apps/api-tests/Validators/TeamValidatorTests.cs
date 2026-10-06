using Xunit;
using GolfFundraiserPro.Api.Features.Teams;

namespace WebAPI.Tests.Validators;

/// <summary>
/// Team and player registration validation (TestingToDoList TT3). The
/// registration endpoints are public, so these rules are the first thing an
/// anonymous request meets: they must reject bad input with a 400, never
/// crash into a 500.
/// </summary>
public class TeamValidatorTests
{
    private static PlayerInput Player(string first = "Ava", string email = "ava@example.com") =>
        new() { FirstName = first, LastName = "Stone", Email = email };

    private static RegisterTeamRequest Team(params PlayerInput[] players) =>
        new() { TeamName = "Eagles", Players = players.ToList() };

    [Fact]
    public void A_captain_alone_is_a_valid_team()
    {
        var r = new RegisterTeamRequestValidator().Validate(Team(Player()));
        Assert.True(r.IsValid, string.Join("; ", r.Errors));
    }

    [Fact]
    public void A_team_needs_a_name_and_at_least_one_player()
    {
        var v = new RegisterTeamRequestValidator();
        Assert.False(v.Validate(Team(Player()) with { TeamName = "" }).IsValid);
        Assert.False(v.Validate(Team()).IsValid);
    }

    [Fact]
    public void A_team_is_capped_at_8_players()
    {
        var v = new RegisterTeamRequestValidator();
        PlayerInput[] Many(int n) => Enumerable.Range(0, n).Select(i => Player($"P{i}", $"p{i}@example.com")).ToArray();
        Assert.True(v.Validate(Team(Many(8))).IsValid);
        Assert.False(v.Validate(Team(Many(9))).IsValid);
    }

    [Fact]
    public void The_same_email_twice_in_one_registration_is_rejected_case_insensitively()
    {
        var r = new RegisterTeamRequestValidator().Validate(Team(Player("Ava", "ava@example.com"), Player("Ben", "AVA@Example.com")));
        Assert.Contains(r.Errors, e => e.ErrorMessage.Contains("Duplicate email"));
    }

    // JSON "email": null deserializes to null despite the non-nullable type.
    // The duplicate check lowercases every email; on null it must reject, not
    // throw (an exception here becomes a 500 on a public endpoint).
    [Fact]
    public void A_missing_email_is_a_validation_error_not_a_crash()
    {
        var r = new RegisterTeamRequestValidator().Validate(Team(Player("Ava", null!), Player("Ben", "ben@example.com")));
        Assert.False(r.IsValid);
        Assert.Contains(r.Errors, e => e.PropertyName.EndsWith("Email"));
    }

    [Theory]
    [InlineData("", "Stone", "a@example.com")]
    [InlineData("Ava", "", "a@example.com")]
    [InlineData("Ava", "Stone", "")]
    [InlineData("Ava", "Stone", "not-an-email")]
    public void Each_player_needs_names_and_a_real_email(string first, string last, string email)
    {
        var p = new PlayerInput { FirstName = first, LastName = last, Email = email };
        Assert.False(new PlayerInputValidator().Validate(p).IsValid);
        Assert.False(new RegisterTeamRequestValidator().Validate(Team(p)).IsValid);   // and it applies per player
    }

    [Theory]
    [InlineData(0.0, true)]
    [InlineData(54.0, true)]
    [InlineData(-0.1, false)]
    [InlineData(54.1, false)]
    public void Handicap_index_is_0_to_54(double hcp, bool valid) =>
        Assert.Equal(valid, new PlayerInputValidator().Validate(Player() with { HandicapIndex = hcp }).IsValid);

    [Fact]
    public void Joining_needs_an_invite_token_and_a_valid_player()
    {
        var v = new JoinTeamRequestValidator();
        Assert.True(v.Validate(new JoinTeamRequest { InviteToken = "tok", Player = Player() }).IsValid);
        Assert.False(v.Validate(new JoinTeamRequest { InviteToken = "", Player = Player() }).IsValid);
        Assert.False(v.Validate(new JoinTeamRequest { InviteToken = "tok", Player = Player(email: "nope") }).IsValid);
        Assert.False(v.Validate(new JoinTeamRequest { InviteToken = "tok", Player = null! }).IsValid);
    }

    [Fact]
    public void A_free_agent_note_is_capped_at_500()
    {
        var v = new RegisterFreeAgentRequestValidator();
        Assert.True(v.Validate(new RegisterFreeAgentRequest { Player = Player(), PairingNote = new string('x', 500) }).IsValid);
        Assert.False(v.Validate(new RegisterFreeAgentRequest { Player = Player(), PairingNote = new string('x', 501) }).IsValid);
    }

    [Fact]
    public void Assigning_a_free_agent_needs_both_ids()
    {
        var v = new AssignFreeAgentRequestValidator();
        Assert.True(v.Validate(new AssignFreeAgentRequest { PlayerId = Guid.NewGuid(), TeamId = Guid.NewGuid() }).IsValid);
        Assert.False(v.Validate(new AssignFreeAgentRequest { PlayerId = Guid.Empty, TeamId = Guid.NewGuid() }).IsValid);
        Assert.False(v.Validate(new AssignFreeAgentRequest { PlayerId = Guid.NewGuid(), TeamId = Guid.Empty }).IsValid);
    }

    [Theory]
    [InlineData((short)1, true)]
    [InlineData((short)8, true)]
    [InlineData((short)0, false)]
    [InlineData((short)9, false)]
    public void Team_size_on_update_is_1_to_8(short max, bool valid) =>
        Assert.Equal(valid, new UpdateTeamRequestValidator().Validate(new UpdateTeamRequest { MaxPlayers = max }).IsValid);
}
