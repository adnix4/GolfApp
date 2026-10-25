using MaxLengthAttribute = System.ComponentModel.DataAnnotations.MaxLengthAttribute;
using System.Reflection;
using Xunit;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Players;
using GolfFundraiserPro.Api.Features.QR;
using WebAPI.Tests.Helpers;

namespace WebAPI.Tests.Services;

/// <summary>
/// QrService.GetAllAsync resolves each player check-in QR back to its golfer
/// with one roster query (it used to look players up one at a time), and the
/// signed player check-in token round-trips, fits its column, and rejects
/// tampering (D23, TT12).
/// </summary>
public class QrServiceTests
{
    [Fact]
    public async Task GetAll_names_every_player_checkin_qr()
    {
        var db      = InMemoryDbFactory.Create();
        var orgId   = Guid.NewGuid();
        var eventId = Guid.NewGuid();
        db.Organizations.Add(new Organization { Id = orgId, Name = "Acme", Slug = "acme" });
        db.Events.Add(new Event
        {
            Id = eventId, OrgId = orgId, Name = "Gala", EventCode = "GALA0001",
            Format = EventFormat.Scramble, StartType = EventStartType.Shotgun,
            Holes = 18, Status = EventStatus.Registration, ConfigJson = "{}",
        });
        var names = new[] { ("Ava", "Stone"), ("Ben", "Hart"), ("Cy", "Moss") };
        foreach (var (first, last) in names)
        {
            db.Players.Add(new Player
            {
                Id = Guid.NewGuid(), EventId = eventId, FirstName = first, LastName = last,
                Email = $"{first.ToLowerInvariant()}@example.com",
            });
        }
        await db.SaveChangesAsync();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["JWT_SECRET"] = new string('k', 64) })
            .Build();
        var svc = new QrService(db, config,
            new PlayerService(db, new NullRealTimeService(), NullLogger<PlayerService>.Instance),
            NullLogger<QrService>.Instance);

        await svc.GenerateAsync(orgId, eventId, new GenerateQrRequest { GenerateForAllPlayers = true });
        var all = await svc.GetAllAsync(orgId, eventId);

        var checkins = all.Where(q => q.QrType == nameof(QrType.PlayerCheckin)).ToList();
        Assert.Equal(3, checkins.Count);
        Assert.All(checkins, q => Assert.NotNull(q.PlayerId));
        Assert.Equal(
            names.Select(n => $"{n.Item1} {n.Item2}").OrderBy(n => n),
            checkins.Select(q => q.PlayerName).OrderBy(n => n));
    }

    private const string Secret = "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk";

    [Fact]
    public void Checkin_token_round_trips()
    {
        var playerId = Guid.NewGuid();
        var eventId  = Guid.NewGuid();

        var token = QrService.BuildPlayerCheckinToken(playerId, eventId, Secret);

        Assert.Equal((playerId, eventId), QrService.ParsePlayerCheckinToken(token, Secret));
    }

    [Fact]
    public void Checkin_token_fits_the_token_column()
    {
        // EF InMemory ignores MaxLength, so the 142-char token passed every test
        // and 500'd on Postgres. Check the length against the attribute itself.
        var max = typeof(QrCode).GetProperty(nameof(QrCode.Token))!
            .GetCustomAttribute<MaxLengthAttribute>()!.Length;

        var token = QrService.BuildPlayerCheckinToken(Guid.NewGuid(), Guid.NewGuid(), Secret);

        Assert.Equal(66, token.Length);
        Assert.True(token.Length <= max, $"token is {token.Length} chars, column is {max}");
    }

    [Fact]
    public void Checkin_token_rejects_a_tampered_or_foreign_token()
    {
        var token = QrService.BuildPlayerCheckinToken(Guid.NewGuid(), Guid.NewGuid(), Secret);
        var (pay, sig) = (token.Split('.')[0], token.Split('.')[1]);
        var otherPay = QrService.BuildPlayerCheckinToken(Guid.NewGuid(), Guid.NewGuid(), Secret).Split('.')[0];
        var flipped  = (sig[0] == 'A' ? "B" : "A") + sig[1..];

        Assert.Throws<ValidationException>(() =>
            QrService.ParsePlayerCheckinToken(token, Secret.Replace('k', 'j')));
        Assert.Throws<ValidationException>(() =>
            QrService.ParsePlayerCheckinToken($"{otherPay}.{sig}", Secret));
        Assert.Throws<ValidationException>(() =>
            QrService.ParsePlayerCheckinToken($"{pay}.{flipped}", Secret));
        Assert.Throws<ValidationException>(() =>
            QrService.ParsePlayerCheckinToken($"{pay}.{sig[..^2]}", Secret));
        Assert.Throws<ValidationException>(() =>
            QrService.ParsePlayerCheckinToken($"{pay}.{sig}.x", Secret));
        Assert.Throws<ValidationException>(() =>
            QrService.ParsePlayerCheckinToken("not a token", Secret));
    }
}
