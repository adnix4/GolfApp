using Xunit;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.League;
using WebAPI.Tests.Helpers;
using System.Text.Json;

namespace WebAPI.Tests.LeagueEngines;

/// <summary>
/// Unit tests for the greedy pairing engine: group sizing, handicap ordering,
/// absence exclusion, repeat-pairing reduction, and the JSON helper.
/// </summary>
public class PairingEngineTests
{
    private sealed class Ctx
    {
        public ApplicationDbContext Db = null!;
        public Guid SeasonId;
        public Guid RoundId;
        public PairingEngine Engine = null!;
    }

    private static Ctx Build()
    {
        var db       = InMemoryDbFactory.Create();
        var leagueId = Guid.NewGuid();
        var seasonId = Guid.NewGuid();
        var roundId  = Guid.NewGuid();

        db.Leagues.Add(new League { Id = leagueId, Name = "L" });
        db.Seasons.Add(new Season { Id = seasonId, LeagueId = leagueId, Name = "S1" });
        db.LeagueRounds.Add(new LeagueRound { Id = roundId, SeasonId = seasonId, Status = RoundStatus.Open });
        db.SaveChanges();

        return new Ctx { Db = db, SeasonId = seasonId, RoundId = roundId, Engine = new PairingEngine(db) };
    }

    private static Guid AddMember(Ctx c, string last, double handicap)
    {
        var id = Guid.NewGuid();
        c.Db.LeagueMembers.Add(new LeagueMember
        {
            Id = id, SeasonId = c.SeasonId, FirstName = "P", LastName = last,
            HandicapIndex = handicap, Status = MemberStatus.Active,
        });
        c.Db.SaveChanges();
        return id;
    }

    [Fact]
    public async Task Splits_members_into_groups_of_the_max_size()
    {
        var c = Build();
        AddMember(c, "a", 10); AddMember(c, "b", 11);
        AddMember(c, "c", 12); AddMember(c, "d", 13);

        var groups = await c.Engine.GenerateAsync(c.RoundId, maxPerGroup: 2, default);

        Assert.Equal(2, groups.Count);
        Assert.All(groups, g => Assert.Equal(2, g.MemberIds.Count));
        Assert.Equal((short)1, groups[0].GroupNumber);
        Assert.Equal((short)2, groups[1].GroupNumber);
    }

    [Fact]
    public async Task Final_group_holds_the_remainder_when_not_evenly_divisible()
    {
        var c = Build();
        AddMember(c, "a", 10); AddMember(c, "b", 11); AddMember(c, "c", 12);

        var groups = await c.Engine.GenerateAsync(c.RoundId, maxPerGroup: 2, default);

        Assert.Equal(2, groups.Count);
        Assert.Equal(2, groups[0].MemberIds.Count);
        Assert.Single(groups[1].MemberIds);
    }

    [Fact]
    public async Task Members_are_ordered_by_handicap_so_lowest_pair_together()
    {
        var c = Build();
        var m20 = AddMember(c, "w", 20);
        var m05 = AddMember(c, "x", 5);
        var m15 = AddMember(c, "y", 15);
        var m10 = AddMember(c, "z", 10);

        // No pairing history -> greedy swap makes no changes, ascending order preserved.
        var groups = await c.Engine.GenerateAsync(c.RoundId, maxPerGroup: 2, default);

        Assert.Equal(new[] { m05, m10 }, groups[0].MemberIds);
        Assert.Equal(new[] { m15, m20 }, groups[1].MemberIds);
    }

    [Fact]
    public async Task Absent_members_are_excluded()
    {
        var c = Build();
        var a = AddMember(c, "a", 10);
        var b = AddMember(c, "b", 11);
        var absent = AddMember(c, "c", 12);
        c.Db.RoundAbsences.Add(new RoundAbsence { Id = Guid.NewGuid(), RoundId = c.RoundId, MemberId = absent });
        await c.Db.SaveChangesAsync();

        var groups = await c.Engine.GenerateAsync(c.RoundId, maxPerGroup: 4, default);

        var paired = groups.SelectMany(g => g.MemberIds).ToList();
        Assert.Equal(2, paired.Count);
        Assert.DoesNotContain(absent, paired);
        Assert.Contains(a, paired);
        Assert.Contains(b, paired);
    }

    [Fact]
    public async Task Member_names_are_first_last()
    {
        var c = Build();
        AddMember(c, "Smith", 10);

        var groups = await c.Engine.GenerateAsync(c.RoundId, maxPerGroup: 4, default);

        Assert.Equal("P Smith", groups[0].MemberNames.Single());
    }

    [Fact]
    public async Task No_eligible_members_returns_empty()
    {
        var c = Build();
        var groups = await c.Engine.GenerateAsync(c.RoundId, maxPerGroup: 4, default);
        Assert.Empty(groups);
    }

    [Fact]
    public async Task Greedy_swap_reduces_repeat_pairings_from_history()
    {
        var c = Build();
        // Four members. A prior round paired (a,b) and (c,d).
        var a = AddMember(c, "a", 10);
        var b = AddMember(c, "b", 10); // same handicap as a -> would group together again
        var d = AddMember(c, "d", 20);
        var e = AddMember(c, "e", 20);

        var priorRound = Guid.NewGuid();
        c.Db.LeagueRounds.Add(new LeagueRound { Id = priorRound, SeasonId = c.SeasonId, Status = RoundStatus.Closed });
        c.Db.LeaguePairings.Add(new LeaguePairing
        {
            Id = Guid.NewGuid(), RoundId = priorRound, GroupNumber = 1,
            MemberIdsJson = JsonSerializer.Serialize(new[] { a, b }),
        });
        c.Db.LeaguePairings.Add(new LeaguePairing
        {
            Id = Guid.NewGuid(), RoundId = priorRound, GroupNumber = 2,
            MemberIdsJson = JsonSerializer.Serialize(new[] { d, e }),
        });
        await c.Db.SaveChangesAsync();

        var groups = await c.Engine.GenerateAsync(c.RoundId, maxPerGroup: 2, default);

        // No group should repeat a pairing that already happened.
        var repeated = groups.Any(g =>
            (g.MemberIds.Contains(a) && g.MemberIds.Contains(b)) ||
            (g.MemberIds.Contains(d) && g.MemberIds.Contains(e)));
        Assert.False(repeated);
    }

    [Theory]
    [InlineData("[]")]
    [InlineData("not json")]
    [InlineData("")]
    public void DeserializeMemberIds_returns_empty_for_bad_input(string json)
        => Assert.Empty(PairingEngine.DeserializeMemberIds(json));

    [Fact]
    public void DeserializeMemberIds_parses_a_guid_array()
    {
        var ids = new[] { Guid.NewGuid(), Guid.NewGuid() };
        var parsed = PairingEngine.DeserializeMemberIds(JsonSerializer.Serialize(ids));
        Assert.Equal(ids, parsed);
    }
}
