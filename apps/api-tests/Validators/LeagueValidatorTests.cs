using Xunit;
using GolfFundraiserPro.Api.Features.League;

namespace WebAPI.Tests.Validators;

/// <summary>
/// League members and subs need a handicap index: net scoring, flights and the
/// pairing engine all read it. A blank used to bind to 0.0, which silently made
/// the golfer scratch.
/// </summary>
public class LeagueValidatorTests
{
    private static AddMemberRequest Member(double? hcp) =>
        new() { FirstName = "Alex", LastName = "Player", Email = "alex@x.com", HandicapIndex = hcp };

    [Fact]
    public void A_member_with_a_handicap_is_valid()
    {
        var r = new AddMemberRequestValidator().Validate(Member(12.4));
        Assert.True(r.IsValid, string.Join("; ", r.Errors));
    }

    [Fact]
    public void A_member_without_a_handicap_is_rejected_not_saved_as_scratch()
    {
        var r = new AddMemberRequestValidator().Validate(Member(null));
        Assert.Contains(r.Errors, e => e.PropertyName == nameof(AddMemberRequest.HandicapIndex));
    }

    [Theory]
    [InlineData(-0.1)]
    [InlineData(54.1)]
    public void A_member_handicap_outside_0_to_54_is_rejected(double hcp)
    {
        Assert.False(new AddMemberRequestValidator().Validate(Member(hcp)).IsValid);
    }

    [Fact]
    public void A_member_needs_a_valid_email()
    {
        var r = new AddMemberRequestValidator().Validate(Member(10) with { Email = "nope" });
        Assert.Contains(r.Errors, e => e.PropertyName == nameof(AddMemberRequest.Email));
    }

    [Fact]
    public void A_substitute_needs_a_handicap_too()
    {
        var v = new AddSubstituteRequestValidator();
        var sub = new AddSubstituteRequest
        {
            AbsentMemberId = Guid.NewGuid(), FirstName = "Sam", LastName = "Sub", Email = "sam@x.com",
        };
        Assert.False(v.Validate(sub).IsValid);
        Assert.True(v.Validate(sub with { HandicapIndex = 18 }).IsValid);
    }
}
