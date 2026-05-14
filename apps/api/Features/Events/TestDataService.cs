// ─────────────────────────────────────────────────────────────────────────────
// Features/Events/TestDataService.cs — Test Data Seed / Clear Logic
// ─────────────────────────────────────────────────────────────────────────────
//
// All rows created by this service are tagged is_test = true so they can be
// bulk-deleted without touching real data. Test data is scoped to one event.
//
// SEED STRATEGY (server-side, one API call):
//   • 8 teams named "Test Team Alpha" through "Test Team Hotel"
//   • 4 players per team with deterministic fake names/emails
//   • Scramble scores for all holes (par ± 1, realistic for charity events)
//   • 5 donations ($25–$500)
//   • Challenge results for each existing hole challenge
//
// CLEAR RULES:
//   ClearRegistrationAndScoringAsync  — teams, players, scores
//   ClearAllAsync                     — all of the above + donations, bids,
//                                       auction_winners, challenge_results
// ─────────────────────────────────────────────────────────────────────────────

using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.Events;

public class TestDataService
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<TestDataService> _logger;

    private static readonly string[] TeamSuffixes =
        ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel"];

    private static readonly (string First, string Last)[] FakeNames =
    [
        ("James", "Anderson"), ("Maria", "Johnson"), ("Robert", "Smith"), ("Lisa", "Williams"),
        ("Michael", "Brown"),  ("Sarah", "Jones"),   ("David", "Garcia"), ("Emily", "Davis"),
        ("Daniel", "Miller"),  ("Jessica", "Wilson"), ("Matthew", "Moore"), ("Ashley", "Taylor"),
        ("Christopher", "Thomas"), ("Amanda", "Jackson"), ("Joshua", "White"), ("Megan", "Harris"),
        ("Andrew", "Martin"),  ("Stephanie", "Thompson"), ("Kevin", "Martinez"), ("Rachel", "Robinson"),
        ("Brian", "Clark"),    ("Nicole", "Rodriguez"), ("Ryan", "Lewis"),  ("Heather", "Lee"),
        ("Justin", "Walker"),  ("Amber", "Hall"),     ("Brandon", "Allen"), ("Samantha", "Young"),
        ("Tyler", "Hernandez"), ("Brittany", "King"), ("Aaron", "Wright"), ("Kayla", "Lopez"),
    ];

    private static readonly int[] DonationAmountsCents = [2500, 5000, 10000, 25000, 50000];

    public TestDataService(ApplicationDbContext db, ILogger<TestDataService> logger)
    {
        _db     = db;
        _logger = logger;
    }

    // ── TOGGLE TEST MODE ──────────────────────────────────────────────────────

    public async Task<bool> ToggleTestModeAsync(
        Guid orgId, Guid eventId, bool enabled, CancellationToken ct = default)
    {
        var evt = await _db.Events
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct)
            ?? throw new NotFoundException("Event", eventId);

        evt.IsTestMode = enabled;
        await _db.SaveChangesAsync(ct);
        return evt.IsTestMode;
    }

    // ── SEED TEST DATA ────────────────────────────────────────────────────────

    public async Task<TestDataSummaryResponse> SeedTestDataAsync(
        Guid orgId, Guid eventId, CancellationToken ct = default)
    {
        var evt = await _db.Events
            .Include(e => e.Course).ThenInclude(c => c!.Holes)
            .Include(e => e.HoleChallenges)
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct)
            ?? throw new NotFoundException("Event", eventId);

        if (evt.Status == EventStatus.Active || evt.Status == EventStatus.Scoring ||
            evt.Status == EventStatus.Completed)
        {
            throw new ValidationException(
                "Test data can only be seeded during Draft or Registration phases.");
        }

        var holes  = evt.Course?.Holes.OrderBy(h => h.HoleNumber).ToList() ?? [];
        var parMap = holes.ToDictionary(h => (int)h.HoleNumber, h => (int)h.Par);
        if (parMap.Count == 0)
        {
            // Fallback: par 4 for all holes when no course is attached
            for (int i = 1; i <= evt.Holes; i++) parMap[i] = 4;
        }

        var rng       = new Random(42); // deterministic seed for reproducibility
        var nameIndex = 0;
        var runTag    = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); // unique per seed run
        var teams     = new List<Team>();
        var players   = new List<Player>();
        var scores    = new List<Score>();

        for (int t = 0; t < 8; t++)
        {
            var team = new Team
            {
                Id          = Guid.NewGuid(),
                EventId     = eventId,
                Name        = $"Test Team {TeamSuffixes[t]}",
                IsTest      = true,
                MaxPlayers  = 4,
                CheckInStatus = CheckInStatus.Pending,
            };
            teams.Add(team);

            for (int p = 0; p < 4; p++)
            {
                var (first, last) = FakeNames[nameIndex % FakeNames.Length];
                nameIndex++;
                players.Add(new Player
                {
                    Id               = Guid.NewGuid(),
                    TeamId           = team.Id,
                    EventId          = eventId,
                    FirstName        = first,
                    LastName         = last,
                    Email            = $"test.{nameIndex}.{runTag}@example.com",
                    RegistrationType = RegistrationType.FullTeam,
                    CheckInStatus    = CheckInStatus.Pending,
                    IsTest           = true,
                });
            }

            // Generate realistic scramble scores for all holes
            foreach (var (hole, par) in parMap)
            {
                // Scramble scores: mostly par/birdie, occasional bogey
                var delta = rng.Next(0, 10) switch
                {
                    < 2 => -1, // birdie
                    < 7 =>  0, // par
                    _ =>    1, // bogey
                };
                scores.Add(new Score
                {
                    Id         = Guid.NewGuid(),
                    EventId    = eventId,
                    TeamId     = team.Id,
                    HoleNumber = (short)hole,
                    GrossScore = (short)Math.Max(1, par + delta),
                    DeviceId   = "test-seed",
                    Source     = ScoreSource.AdminEntry,
                    IsTest     = true,
                    SubmittedAt = DateTime.UtcNow,
                });
            }
        }

        _db.Teams.AddRange(teams);
        _db.Players.AddRange(players);
        _db.Scores.AddRange(scores);

        // Test donations
        var donations = DonationAmountsCents.Select((cents, i) => new Donation
        {
            Id         = Guid.NewGuid(),
            EventId    = eventId,
            DonorName  = $"Test Donor {i + 1}",
            DonorEmail = $"testdonor{i + 1}@example.com",
            AmountCents = cents,
            IsTest     = true,
            CreatedAt  = DateTime.UtcNow,
        }).ToList();
        _db.Donations.AddRange(donations);

        // Challenge results for existing challenges
        var challengeResults = new List<ChallengeResult>();
        foreach (var challenge in evt.HoleChallenges)
        {
            foreach (var team in teams.Take(4)) // first 4 test teams
            {
                float? value = challenge.ChallengeType switch
                {
                    ChallengeType.ClosestToPin  => (float)(rng.Next(3, 40) + rng.NextDouble()),
                    ChallengeType.LongestDrive  => (float)(rng.Next(180, 290) + rng.NextDouble()),
                    ChallengeType.Putting       => (float)rng.Next(1, 4),
                    _                           => null,
                };
                challengeResults.Add(new ChallengeResult
                {
                    Id          = Guid.NewGuid(),
                    ChallengeId = challenge.Id,
                    TeamId      = team.Id,
                    ResultValue = value,
                    ResultNotes = "Test result",
                    IsTest      = true,
                    RecordedAt  = DateTime.UtcNow,
                });
            }
        }
        if (challengeResults.Count > 0)
            _db.ChallengeResults.AddRange(challengeResults);

        // Enable test mode automatically when seeding
        evt.IsTestMode = true;

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Seeded test data for event {EventId}: {Teams} teams, {Scores} scores, {Donations} donations",
            eventId, teams.Count, scores.Count, donations.Count);

        return await GetSummaryAsync(orgId, eventId, ct);
    }

    // ── CLEAR REGISTRATION + SCORING TEST DATA ────────────────────────────────

    public async Task<TestDataSummaryResponse> ClearRegistrationAndScoringAsync(
        Guid orgId, Guid eventId, CancellationToken ct = default)
    {
        var evt = await _db.Events
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct)
            ?? throw new NotFoundException("Event", eventId);

        var testScores = await _db.Scores
            .Where(s => s.EventId == eventId && s.IsTest)
            .ToListAsync(ct);
        _db.Scores.RemoveRange(testScores);

        var testPlayers = await _db.Players
            .Where(p => p.EventId == eventId && p.IsTest)
            .ToListAsync(ct);
        _db.Players.RemoveRange(testPlayers);

        var testTeams = await _db.Teams
            .Where(t => t.EventId == eventId && t.IsTest)
            .ToListAsync(ct);
        _db.Teams.RemoveRange(testTeams);

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Cleared registration+scoring test data for event {EventId}: " +
            "{Teams} teams, {Players} players, {Scores} scores",
            eventId, testTeams.Count, testPlayers.Count, testScores.Count);

        return await GetSummaryAsync(orgId, eventId, ct);
    }

    // ── CLEAR ALL TEST DATA ───────────────────────────────────────────────────

    public async Task<TestDataSummaryResponse> ClearAllTestDataAsync(
        Guid orgId, Guid eventId, CancellationToken ct = default)
    {
        var evt = await _db.Events
            .FirstOrDefaultAsync(e => e.Id == eventId && e.OrgId == orgId, ct)
            ?? throw new NotFoundException("Event", eventId);

        var testWinners = await _db.AuctionWinners
            .Where(w => w.AuctionItem.EventId == eventId && w.IsTest)
            .ToListAsync(ct);
        _db.AuctionWinners.RemoveRange(testWinners);

        var testBids = await _db.Bids
            .Where(b => b.AuctionItem.EventId == eventId && b.IsTest)
            .ToListAsync(ct);
        _db.Bids.RemoveRange(testBids);

        var testAuctionItems = await _db.AuctionItems
            .Where(a => a.EventId == eventId && a.IsTest)
            .ToListAsync(ct);
        _db.AuctionItems.RemoveRange(testAuctionItems);

        var testChallengeResults = await _db.ChallengeResults
            .Where(r => r.Challenge.EventId == eventId && r.IsTest)
            .ToListAsync(ct);
        _db.ChallengeResults.RemoveRange(testChallengeResults);

        var testDonations = await _db.Donations
            .Where(d => d.EventId == eventId && d.IsTest)
            .ToListAsync(ct);
        _db.Donations.RemoveRange(testDonations);

        // Cascade: clear scores before players/teams
        var testScores = await _db.Scores
            .Where(s => s.EventId == eventId && s.IsTest)
            .ToListAsync(ct);
        _db.Scores.RemoveRange(testScores);

        var testPlayers = await _db.Players
            .Where(p => p.EventId == eventId && p.IsTest)
            .ToListAsync(ct);
        _db.Players.RemoveRange(testPlayers);

        var testTeams = await _db.Teams
            .Where(t => t.EventId == eventId && t.IsTest)
            .ToListAsync(ct);
        _db.Teams.RemoveRange(testTeams);

        // Turn off test mode when all data is cleared
        evt.IsTestMode = false;

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Cleared ALL test data for event {EventId}", eventId);

        return await GetSummaryAsync(orgId, eventId, ct);
    }

    // ── GET SUMMARY ───────────────────────────────────────────────────────────

    public async Task<TestDataSummaryResponse> GetSummaryAsync(
        Guid orgId, Guid eventId, CancellationToken ct = default)
    {
        var exists = await _db.Events
            .AnyAsync(e => e.Id == eventId && e.OrgId == orgId, ct);
        if (!exists) throw new NotFoundException("Event", eventId);

        var teams      = await _db.Teams.CountAsync(t => t.EventId == eventId && t.IsTest, ct);
        var players    = await _db.Players.CountAsync(p => p.EventId == eventId && p.IsTest, ct);
        var scores     = await _db.Scores.CountAsync(s => s.EventId == eventId && s.IsTest, ct);
        var donations  = await _db.Donations.CountAsync(d => d.EventId == eventId && d.IsTest, ct);
        var results    = await _db.ChallengeResults
            .CountAsync(r => r.Challenge.EventId == eventId && r.IsTest, ct);
        var bids       = await _db.Bids
            .CountAsync(b => b.AuctionItem.EventId == eventId && b.IsTest, ct);
        var aItems     = await _db.AuctionItems.CountAsync(a => a.EventId == eventId && a.IsTest, ct);
        var winners    = await _db.AuctionWinners
            .CountAsync(w => w.AuctionItem.EventId == eventId && w.IsTest, ct);

        return new TestDataSummaryResponse
        {
            TeamsCount            = teams,
            PlayersCount          = players,
            ScoresCount           = scores,
            DonationsCount        = donations,
            ChallengeResultsCount = results,
            BidsCount             = bids,
            AuctionItemsCount     = aItems,
            AuctionWinnersCount   = winners,
            TotalCount            = teams + players + scores + donations + results + bids + aItems + winners,
        };
    }
}
