using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.League;

public class LeagueService
{
    private readonly ApplicationDbContext   _db;
    private readonly HandicapEngine         _handicap;
    private readonly StandingsCalculator    _standings;
    private readonly SkinsCalculator        _skins;
    private readonly PairingEngine          _pairing;
    private readonly ILogger<LeagueService> _logger;

    public LeagueService(
        ApplicationDbContext   db,
        HandicapEngine         handicap,
        StandingsCalculator    standings,
        SkinsCalculator        skins,
        PairingEngine          pairing,
        ILogger<LeagueService> logger)
    {
        _db        = db;
        _handicap  = handicap;
        _standings = standings;
        _skins     = skins;
        _pairing   = pairing;
        _logger    = logger;
    }

    // ── LEAGUES ───────────────────────────────────────────────────────────────

    public async Task<List<LeagueResponse>> GetLeaguesAsync(Guid orgId, CancellationToken ct)
    {
        var leagues = await _db.Leagues
            .Where(l => l.OrgId == orgId)
            .OrderBy(l => l.Name)
            .Select(l => new { League = l, SeasonCount = l.Seasons.Count })
            .ToListAsync(ct);

        return leagues.Select(x => MapLeague(x.League, x.SeasonCount)).ToList();
    }

    public async Task<LeagueResponse> CreateLeagueAsync(
        Guid orgId, CreateLeagueRequest req, CancellationToken ct)
    {
        if (!Enum.TryParse<LeagueFormat>(req.Format, ignoreCase: true, out var format))
            throw new ValidationException($"Unknown format '{req.Format}'.");

        if (!Enum.TryParse<HandicapSystem>(req.HandicapSystem, ignoreCase: true, out var system))
            throw new ValidationException($"Unknown handicap_system '{req.HandicapSystem}'.");

        var league = new Domain.Entities.League
        {
            Id              = Guid.NewGuid(),
            OrgId           = orgId,
            Name            = req.Name,
            Format          = format,
            HandicapSystem  = system,
            HandicapCap     = req.HandicapCap,
            MaxFlights      = req.MaxFlights,
            DuesCents       = req.DuesCents,
            CreatedAt       = DateTime.UtcNow
        };

        _db.Leagues.Add(league);
        await _db.SaveChangesAsync(ct);
        return MapLeague(league, 0);
    }

    public async Task<LeagueResponse> UpdateLeagueAsync(
        Guid orgId, Guid leagueId, UpdateLeagueRequest req, CancellationToken ct)
    {
        var league = await GetOwnedLeagueAsync(orgId, leagueId, ct);

        if (req.Name           is not null) league.Name          = req.Name;
        if (req.HandicapCap    is not null) league.HandicapCap   = req.HandicapCap.Value;
        if (req.MaxFlights     is not null) league.MaxFlights    = req.MaxFlights.Value;
        if (req.DuesCents      is not null) league.DuesCents     = req.DuesCents.Value;

        if (req.Format is not null)
        {
            if (!Enum.TryParse<LeagueFormat>(req.Format, ignoreCase: true, out var fmt))
                throw new ValidationException($"Unknown format '{req.Format}'.");
            league.Format = fmt;
        }

        if (req.HandicapSystem is not null)
        {
            if (!Enum.TryParse<HandicapSystem>(req.HandicapSystem, ignoreCase: true, out var sys))
                throw new ValidationException($"Unknown handicap_system '{req.HandicapSystem}'.");
            league.HandicapSystem = sys;
        }

        await _db.SaveChangesAsync(ct);
        var count = await _db.Seasons.CountAsync(s => s.LeagueId == leagueId, ct);
        return MapLeague(league, count);
    }

    // ── SEASONS ───────────────────────────────────────────────────────────────

    public async Task<List<SeasonResponse>> GetSeasonsAsync(
        Guid orgId, Guid leagueId, CancellationToken ct)
    {
        await GetOwnedLeagueAsync(orgId, leagueId, ct);
        var seasons = await _db.Seasons
            .Where(s => s.LeagueId == leagueId)
            .OrderByDescending(s => s.StartDate)
            .Select(s => new
            {
                Season      = s,
                MemberCount = s.Members.Count,
                RoundCount  = s.Rounds.Count
            })
            .ToListAsync(ct);

        return seasons.Select(x => MapSeason(x.Season, x.MemberCount, x.RoundCount)).ToList();
    }

    public async Task<SeasonDashboard> GetSeasonDashboardAsync(
        Guid orgId, Guid leagueId, Guid seasonId, CancellationToken ct)
    {
        await GetOwnedLeagueAsync(orgId, leagueId, ct);
        var season = await GetOwnedSeasonAsync(leagueId, seasonId, ct);

        var members = await GetMembersAsync(orgId, leagueId, seasonId, ct);
        var rounds  = await GetRoundsAsync(orgId, leagueId, seasonId, ct);
        var flights = await GetFlightsAsync(orgId, leagueId, seasonId, ct);
        var stndgs  = await GetStandingsAsync(orgId, leagueId, seasonId, ct);

        return new SeasonDashboard
        {
            Season    = MapSeason(season, members.Count, rounds.Count),
            Rounds    = rounds,
            Roster    = members,
            Flights   = flights,
            Standings = stndgs
        };
    }

    public async Task<SeasonResponse> CreateSeasonAsync(
        Guid orgId, Guid leagueId, CreateSeasonRequest req, CancellationToken ct)
    {
        await GetOwnedLeagueAsync(orgId, leagueId, ct);

        var season = new Season
        {
            Id             = Guid.NewGuid(),
            LeagueId       = leagueId,
            Name           = req.Name,
            TotalRounds    = req.TotalRounds,
            StartDate      = req.StartDate,
            EndDate        = req.EndDate,
            Status         = "Draft",
            RoundsCounted  = req.RoundsCounted,
            StandingMethod = req.StandingMethod,
            CreatedAt      = DateTime.UtcNow
        };

        _db.Seasons.Add(season);
        await _db.SaveChangesAsync(ct);
        return MapSeason(season, 0, 0);
    }

    // ── FLIGHTS ───────────────────────────────────────────────────────────────

    public async Task<List<FlightResponse>> GetFlightsAsync(
        Guid orgId, Guid leagueId, Guid seasonId, CancellationToken ct)
    {
        await GetOwnedSeasonAsync(leagueId, seasonId, ct);
        return await _db.Flights
            .Where(f => f.SeasonId == seasonId)
            .Select(f => new FlightResponse
            {
                Id          = f.Id,
                SeasonId    = f.SeasonId,
                Name        = f.Name,
                MinHandicap = f.MinHandicap,
                MaxHandicap = f.MaxHandicap,
                MemberCount = f.Members.Count(m => m.Status == MemberStatus.Active)
            })
            .OrderBy(f => f.Name)
            .ToListAsync(ct);
    }

    public async Task<FlightResponse> CreateFlightAsync(
        Guid orgId, Guid leagueId, Guid seasonId, CreateFlightRequest req, CancellationToken ct)
    {
        await GetOwnedSeasonAsync(leagueId, seasonId, ct);

        var flight = new Flight
        {
            Id         = Guid.NewGuid(),
            SeasonId   = seasonId,
            Name       = req.Name,
            MinHandicap = req.MinHandicap,
            MaxHandicap = req.MaxHandicap
        };

        _db.Flights.Add(flight);
        await _db.SaveChangesAsync(ct);

        return new FlightResponse
        {
            Id = flight.Id, SeasonId = seasonId, Name = flight.Name,
            MinHandicap = flight.MinHandicap, MaxHandicap = flight.MaxHandicap, MemberCount = 0
        };
    }

    // ── MEMBERS ───────────────────────────────────────────────────────────────

    public async Task<List<LeagueMemberResponse>> GetMembersAsync(
        Guid orgId, Guid leagueId, Guid seasonId, CancellationToken ct)
    {
        await GetOwnedSeasonAsync(leagueId, seasonId, ct);
        var sandbagged = await _handicap.DetectSandbaggersAsync(seasonId, ct);

        return await _db.LeagueMembers
            .Where(m => m.SeasonId == seasonId)
            .Include(m => m.Flight)
            .OrderBy(m => m.LastName).ThenBy(m => m.FirstName)
            .Select(m => new LeagueMemberResponse
            {
                Id            = m.Id,
                SeasonId      = m.SeasonId,
                PlayerId      = m.PlayerId,
                FlightId      = m.FlightId,
                FlightName    = m.Flight != null ? m.Flight.Name : null,
                FirstName     = m.FirstName,
                LastName      = m.LastName,
                Email         = m.Email,
                HandicapIndex = m.HandicapIndex,
                DuesPaid      = m.DuesPaid,
                RoundsPlayed  = m.RoundsPlayed,
                Absences      = m.Absences,
                Status        = m.Status.ToString(),
                IsSandbagger  = sandbagged.Contains(m.Id)
            })
            .ToListAsync(ct);
    }

    public async Task<LeagueMemberResponse> AddMemberAsync(
        Guid orgId, Guid leagueId, Guid seasonId, AddMemberRequest req, CancellationToken ct)
    {
        await GetOwnedSeasonAsync(leagueId, seasonId, ct);

        if (!Enum.TryParse<MemberStatus>(req.Status, ignoreCase: true, out var status))
            status = MemberStatus.Active;

        var member = new LeagueMember
        {
            Id            = Guid.NewGuid(),
            SeasonId      = seasonId,
            PlayerId      = req.PlayerId,
            FlightId      = req.FlightId,
            FirstName     = req.FirstName,
            LastName      = req.LastName,
            Email         = req.Email,
            HandicapIndex = req.HandicapIndex,
            DuesPaid      = false,
            Status        = status,
            JoinedAt      = DateTime.UtcNow
        };

        _db.LeagueMembers.Add(member);
        await _db.SaveChangesAsync(ct);

        return new LeagueMemberResponse
        {
            Id = member.Id, SeasonId = seasonId, PlayerId = member.PlayerId,
            FlightId = member.FlightId, FirstName = member.FirstName,
            LastName = member.LastName, Email = member.Email,
            HandicapIndex = member.HandicapIndex, DuesPaid = false,
            RoundsPlayed = 0, Absences = 0,
            Status = member.Status.ToString(), IsSandbagger = false
        };
    }

    public async Task<LeagueMemberResponse> UpdateMemberAsync(
        Guid orgId, Guid leagueId, Guid seasonId, Guid memberId,
        UpdateMemberRequest req, CancellationToken ct)
    {
        await GetOwnedSeasonAsync(leagueId, seasonId, ct);
        var member = await _db.LeagueMembers
            .FirstOrDefaultAsync(m => m.Id == memberId && m.SeasonId == seasonId, ct)
            ?? throw new NotFoundException("Member not found.");

        if (req.FlightId      is not null) member.FlightId      = req.FlightId;
        if (req.HandicapIndex is not null) member.HandicapIndex  = req.HandicapIndex.Value;
        if (req.DuesPaid      is not null) member.DuesPaid       = req.DuesPaid.Value;
        if (req.Status        is not null &&
            Enum.TryParse<MemberStatus>(req.Status, ignoreCase: true, out var s))
            member.Status = s;

        await _db.SaveChangesAsync(ct);

        var sandbagged = await _handicap.DetectSandbaggersAsync(seasonId, ct);
        var flight = req.FlightId.HasValue
            ? await _db.Flights.FindAsync(new object?[] { req.FlightId.Value }, ct)
            : null;

        return new LeagueMemberResponse
        {
            Id = member.Id, SeasonId = seasonId, PlayerId = member.PlayerId,
            FlightId = member.FlightId, FlightName = flight?.Name,
            FirstName = member.FirstName, LastName = member.LastName, Email = member.Email,
            HandicapIndex = member.HandicapIndex, DuesPaid = member.DuesPaid,
            RoundsPlayed = member.RoundsPlayed, Absences = member.Absences,
            Status = member.Status.ToString(), IsSandbagger = sandbagged.Contains(member.Id)
        };
    }

    public async Task OverrideHandicapAsync(
        Guid orgId, Guid leagueId, Guid seasonId, Guid memberId,
        OverrideHandicapRequest req, CancellationToken ct)
    {
        await GetOwnedSeasonAsync(leagueId, seasonId, ct);
        var member = await _db.LeagueMembers
            .FirstOrDefaultAsync(m => m.Id == memberId && m.SeasonId == seasonId, ct)
            ?? throw new NotFoundException("Member not found.");

        var oldIndex = member.HandicapIndex;
        member.HandicapIndex = req.NewIndex;

        _db.HandicapHistories.Add(new HandicapHistory
        {
            Id            = Guid.NewGuid(),
            MemberId      = memberId,
            RoundId       = null,
            OldIndex      = oldIndex,
            NewIndex      = req.NewIndex,
            Differential  = req.NewIndex - oldIndex,
            AdminOverride = true,
            Reason        = req.Reason,
            CreatedAt     = DateTime.UtcNow
        });

        await _db.SaveChangesAsync(ct);
    }

    public async Task<List<HandicapHistoryRow>> GetHandicapHistoryAsync(
        Guid orgId, Guid leagueId, Guid seasonId, Guid memberId, CancellationToken ct)
    {
        await GetOwnedSeasonAsync(leagueId, seasonId, ct);
        return await _db.HandicapHistories
            .Include(h => h.Round)
            .Where(h => h.MemberId == memberId)
            .OrderByDescending(h => h.CreatedAt)
            .Select(h => new HandicapHistoryRow
            {
                Id            = h.Id,
                RoundId       = h.RoundId,
                RoundDate     = h.Round != null ? h.Round.RoundDate : (DateOnly?)null,
                OldIndex      = h.OldIndex,
                NewIndex      = h.NewIndex,
                Differential  = h.Differential,
                AdminOverride = h.AdminOverride,
                Reason        = h.Reason,
                CreatedAt     = h.CreatedAt
            })
            .ToListAsync(ct);
    }

    // ── ROUNDS ────────────────────────────────────────────────────────────────

    public async Task<List<LeagueRoundResponse>> GetRoundsAsync(
        Guid orgId, Guid leagueId, Guid seasonId, CancellationToken ct)
    {
        await GetOwnedSeasonAsync(leagueId, seasonId, ct);
        return await _db.LeagueRounds
            .Include(r => r.Course)
            .Where(r => r.SeasonId == seasonId)
            .OrderBy(r => r.RoundDate)
            .Select(r => new LeagueRoundResponse
            {
                Id           = r.Id,
                SeasonId     = r.SeasonId,
                CourseId     = r.CourseId,
                CourseName   = r.Course != null ? r.Course.Name : null,
                RoundDate    = r.RoundDate,
                Status       = r.Status.ToString(),
                Notes        = r.Notes,
                PairingCount = r.Pairings.Count,
                ScoredCount  = r.Scores.Select(s => s.MemberId).Distinct().Count()
            })
            .ToListAsync(ct);
    }

    public async Task<LeagueRoundResponse> CreateRoundAsync(
        Guid orgId, Guid leagueId, Guid seasonId, CreateRoundRequest req, CancellationToken ct)
    {
        await GetOwnedSeasonAsync(leagueId, seasonId, ct);

        var round = new LeagueRound
        {
            Id        = Guid.NewGuid(),
            SeasonId  = seasonId,
            CourseId  = req.CourseId,
            RoundDate = req.RoundDate,
            Status    = RoundStatus.Scheduled,
            Notes     = req.Notes
        };

        _db.LeagueRounds.Add(round);
        await _db.SaveChangesAsync(ct);

        string? courseName = null;
        if (req.CourseId.HasValue)
            courseName = (await _db.Courses.FindAsync(new object?[] { req.CourseId.Value }, ct))?.Name;

        return new LeagueRoundResponse
        {
            Id = round.Id, SeasonId = seasonId, CourseId = req.CourseId,
            CourseName = courseName, RoundDate = req.RoundDate,
            Status = "Scheduled", PairingCount = 0, ScoredCount = 0
        };
    }

    // ── PAIRINGS ──────────────────────────────────────────────────────────────

    public async Task<List<PairingGroupResponse>> GeneratePairingsAsync(
        Guid orgId, Guid leagueId, Guid seasonId, Guid roundId,
        int maxPerGroup, CancellationToken ct)
    {
        await GetOwnedRoundAsync(leagueId, seasonId, roundId, ct);
        return await _pairing.GenerateAsync(roundId, maxPerGroup, ct);
    }

    public async Task SavePairingsAsync(
        Guid orgId, Guid leagueId, Guid seasonId, Guid roundId,
        SavePairingsRequest req, CancellationToken ct)
    {
        await GetOwnedRoundAsync(leagueId, seasonId, roundId, ct);

        var existing = await _db.LeaguePairings
            .Where(p => p.RoundId == roundId)
            .ToListAsync(ct);
        _db.LeaguePairings.RemoveRange(existing);

        for (int i = 0; i < req.Groups.Count; i++)
        {
            var g = req.Groups[i];
            _db.LeaguePairings.Add(new LeaguePairing
            {
                Id          = Guid.NewGuid(),
                RoundId     = roundId,
                GroupNumber = (short)(i + 1),
                MemberIdsJson = JsonSerializer.Serialize(g.MemberIds),
                TeeTime     = g.TeeTime,
                StartingHole = g.StartingHole,
                IsLocked    = req.Lock
            });
        }

        if (req.Lock)
        {
            var round = await _db.LeagueRounds.FindAsync(new object?[] { roundId }, ct)!;
            if (round!.Status == RoundStatus.Scheduled)
                round.Status = RoundStatus.Open;
        }

        await _db.SaveChangesAsync(ct);
    }

    // ── ROUND STATUS TRANSITIONS ──────────────────────────────────────────────

    public async Task OpenScoringAsync(
        Guid orgId, Guid leagueId, Guid seasonId, Guid roundId, CancellationToken ct)
    {
        var round = await GetOwnedRoundAsync(leagueId, seasonId, roundId, ct);
        if (round.Status != RoundStatus.Open && round.Status != RoundStatus.Scheduled)
            throw new ValidationException("Round must be Scheduled or Open to open scoring.");
        round.Status = RoundStatus.Scoring;
        await _db.SaveChangesAsync(ct);
    }

    public async Task CloseRoundAsync(
        Guid orgId, Guid leagueId, Guid seasonId, Guid roundId,
        int skinsPotCentsPerHolePerPlayer, CancellationToken ct)
    {
        var round = await GetOwnedRoundAsync(leagueId, seasonId, roundId, ct);
        if (round.Status != RoundStatus.Scoring)
            throw new ValidationException("Round must be in Scoring status to close.");

        round.Status = RoundStatus.Closed;

        // Update rounds_played per member
        var scoredMemberIds = await _db.LeagueScores
            .Where(s => s.RoundId == roundId)
            .Select(s => s.MemberId)
            .Distinct()
            .ToListAsync(ct);

        var members = await _db.LeagueMembers
            .Where(m => scoredMemberIds.Contains(m.Id))
            .ToListAsync(ct);
        foreach (var m in members) m.RoundsPlayed++;

        await _db.SaveChangesAsync(ct);

        // Run engines
        await _handicap.RecalculateAsync(seasonId, roundId, ct);
        await _standings.RecalculateAsync(seasonId, ct);

        if (skinsPotCentsPerHolePerPlayer > 0)
            await _skins.CalculateAsync(roundId, skinsPotCentsPerHolePerPlayer, ct);

        _logger.LogInformation("Round {RoundId} closed. Handicaps, standings, and skins updated.", roundId);
    }

    // ── SCORING ───────────────────────────────────────────────────────────────

    public async Task SubmitScoreAsync(
        Guid orgId, Guid leagueId, Guid seasonId, Guid roundId,
        SubmitLeagueScoreRequest req, CancellationToken ct)
    {
        var round = await GetOwnedRoundAsync(leagueId, seasonId, roundId, ct);
        if (round.Status != RoundStatus.Scoring)
            throw new ValidationException("Scoring is not open for this round.");

        var member = await _db.LeagueMembers
            .FirstOrDefaultAsync(m => m.Id == req.MemberId && m.SeasonId == seasonId, ct)
            ?? throw new NotFoundException("Member not found in this season.");

        // Get hole par and handicap_index from course
        short holePar = 4;
        short holeHcpIdx = req.HoleNumber;
        if (round.CourseId.HasValue)
        {
            var hole = await _db.CourseHoles
                .FirstOrDefaultAsync(h => h.CourseId == round.CourseId && h.HoleNumber == req.HoleNumber, ct);
            if (hole is not null)
            {
                holePar    = hole.Par;
                holeHcpIdx = hole.HandicapIndex;
            }
        }

        // Course handicap (simplified Phase 5a — no slope/rating)
        int courseHandicap = (int)Math.Round(member.HandicapIndex);
        int totalHoles = round.CourseId.HasValue
            ? await _db.CourseHoles.CountAsync(h => h.CourseId == round.CourseId, ct)
            : 18;

        // Strokes received on this hole: 1 if holeHcpIdx <= courseHandicap
        int strokesOnHole = holeHcpIdx <= courseHandicap ? 1 : 0;
        if (courseHandicap > totalHoles) strokesOnHole += (courseHandicap - totalHoles) >= holeHcpIdx ? 1 : 0;

        short netScore = (short)(req.GrossScore - strokesOnHole);
        short stableford = (short)Math.Max(0, 2 + holePar - netScore);

        // Upsert
        var existing = await _db.LeagueScores
            .FirstOrDefaultAsync(s => s.RoundId == roundId && s.MemberId == req.MemberId
                                   && s.HoleNumber == req.HoleNumber, ct);
        if (existing is not null)
        {
            existing.GrossScore      = req.GrossScore;
            existing.NetScore        = netScore;
            existing.StablefordPoints = stableford;
        }
        else
        {
            _db.LeagueScores.Add(new LeagueScore
            {
                Id              = Guid.NewGuid(),
                RoundId         = roundId,
                MemberId        = req.MemberId,
                HoleNumber      = req.HoleNumber,
                GrossScore      = req.GrossScore,
                NetScore        = netScore,
                StablefordPoints = stableford
            });
        }

        await _db.SaveChangesAsync(ct);
    }

    public async Task<List<LeagueRoundScorecard>> GetRoundScorecardsAsync(
        Guid orgId, Guid leagueId, Guid seasonId, Guid roundId, CancellationToken ct)
    {
        await GetOwnedRoundAsync(leagueId, seasonId, roundId, ct);

        var scores = await _db.LeagueScores
            .Include(s => s.Member)
            .Where(s => s.RoundId == roundId)
            .ToListAsync(ct);

        var courseHoles = new List<CourseHole>();
        var round = await _db.LeagueRounds.FindAsync(new object?[] { roundId }, ct)!;
        if (round?.CourseId.HasValue == true)
            courseHoles = await _db.CourseHoles
                .Where(h => h.CourseId == round.CourseId)
                .OrderBy(h => h.HoleNumber)
                .ToListAsync(ct);

        return scores
            .GroupBy(s => s.MemberId)
            .Select(g =>
            {
                var m   = g.First().Member;
                var holeRows = g.Select(s =>
                {
                    var ch = courseHoles.FirstOrDefault(h => h.HoleNumber == s.HoleNumber);
                    return new HoleScoreRow
                    {
                        HoleNumber      = s.HoleNumber,
                        Par             = ch?.Par ?? 4,
                        GrossScore      = s.GrossScore,
                        NetScore        = s.NetScore,
                        StablefordPoints = s.StablefordPoints
                    };
                }).OrderBy(h => h.HoleNumber).ToList();

                return new LeagueRoundScorecard
                {
                    MemberId        = m.Id,
                    MemberName      = $"{m.FirstName} {m.LastName}",
                    HandicapIndex   = m.HandicapIndex,
                    GrossTotal      = holeRows.Sum(h => h.GrossScore),
                    NetTotal        = holeRows.Sum(h => h.NetScore),
                    StablefordTotal = holeRows.Sum(h => h.StablefordPoints),
                    Holes           = holeRows
                };
            })
            .OrderBy(sc => sc.MemberName)
            .ToList();
    }

    // ── STANDINGS ─────────────────────────────────────────────────────────────

    public async Task<List<StandingRow>> GetStandingsAsync(
        Guid orgId, Guid leagueId, Guid seasonId, CancellationToken ct)
    {
        await GetOwnedSeasonAsync(leagueId, seasonId, ct);
        return await _db.Standings
            .Include(s => s.Member)
            .ThenInclude(m => m.Flight)
            .Where(s => s.SeasonId == seasonId)
            .OrderBy(s => s.Rank)
            .Select(s => new StandingRow
            {
                Rank          = s.Rank,
                MemberId      = s.MemberId,
                MemberName    = $"{s.Member.FirstName} {s.Member.LastName}",
                FlightName    = s.Member.Flight != null ? s.Member.Flight.Name : "General",
                HandicapIndex = s.Member.HandicapIndex,
                TotalPoints   = s.TotalPoints,
                NetStrokes    = s.NetStrokes,
                SeasonAvgNet  = s.SeasonAvgNet,
                RoundsPlayed  = s.RoundsPlayed
            })
            .ToListAsync(ct);
    }

    // ── SKINS ─────────────────────────────────────────────────────────────────

    public async Task<List<SkinRow>> GetSkinsAsync(
        Guid orgId, Guid leagueId, Guid seasonId, Guid roundId, CancellationToken ct)
    {
        await GetOwnedRoundAsync(leagueId, seasonId, roundId, ct);
        return await _db.Skins
            .Include(s => s.Winner)
            .Where(s => s.RoundId == roundId)
            .OrderBy(s => s.HoleNumber)
            .Select(s => new SkinRow
            {
                Id                  = s.Id,
                HoleNumber          = s.HoleNumber,
                WinnerMemberId      = s.WinnerMemberId,
                WinnerName          = s.Winner != null ? $"{s.Winner.FirstName} {s.Winner.LastName}" : null,
                PotCents            = s.PotCents,
                CarriedOverFromHole = s.CarriedOverFromHole
            })
            .ToListAsync(ct);
    }

    // ── MOBILE: MEMBER SEASON SUMMARY ─────────────────────────────────────────

    public async Task<MemberSeasonSummary?> GetMemberSummaryAsync(
        Guid seasonId, Guid memberId, CancellationToken ct)
    {
        var member = await _db.LeagueMembers
            .Include(m => m.Flight)
            .FirstOrDefaultAsync(m => m.Id == memberId && m.SeasonId == seasonId, ct);
        if (member is null) return null;

        var standing = await _db.Standings
            .FirstOrDefaultAsync(s => s.SeasonId == seasonId && s.MemberId == memberId, ct);

        var history = await _db.HandicapHistories
            .Include(h => h.Round)
            .Where(h => h.MemberId == memberId)
            .OrderByDescending(h => h.CreatedAt)
            .Take(10)
            .Select(h => new HandicapHistoryRow
            {
                Id = h.Id, RoundId = h.RoundId,
                RoundDate = h.Round != null ? h.Round.RoundDate : (DateOnly?)null,
                OldIndex = h.OldIndex, NewIndex = h.NewIndex,
                Differential = h.Differential, AdminOverride = h.AdminOverride,
                Reason = h.Reason, CreatedAt = h.CreatedAt
            })
            .ToListAsync(ct);

        var roundResults = await _db.LeagueScores
            .Include(s => s.Round)
            .Where(s => s.MemberId == memberId && s.Round.Status == RoundStatus.Closed)
            .GroupBy(s => new { s.RoundId, s.Round.RoundDate })
            .Select(g => new RoundResultRow
            {
                RoundId        = g.Key.RoundId,
                RoundDate      = g.Key.RoundDate,
                GrossTotal     = (int)g.Sum(s => s.GrossScore),
                NetTotal       = (int)g.Sum(s => s.NetScore),
                StablefordPoints = (int)g.Sum(s => s.StablefordPoints),
                Differential   = 0
            })
            .OrderByDescending(r => r.RoundDate)
            .ToListAsync(ct);

        return new MemberSeasonSummary
        {
            MemberId      = member.Id,
            Name          = $"{member.FirstName} {member.LastName}",
            HandicapIndex = member.HandicapIndex,
            FlightName    = member.Flight?.Name ?? "General",
            Rank          = standing?.Rank ?? 0,
            TotalPoints   = standing?.TotalPoints ?? 0,
            RoundsPlayed  = member.RoundsPlayed,
            HandicapTrend = history,
            RoundHistory  = roundResults
        };
    }

    // ── HELPERS ───────────────────────────────────────────────────────────────

    private async Task<Domain.Entities.League> GetOwnedLeagueAsync(
        Guid orgId, Guid leagueId, CancellationToken ct)
    {
        var league = await _db.Leagues.FirstOrDefaultAsync(
            l => l.Id == leagueId && l.OrgId == orgId, ct);
        return league ?? throw new NotFoundException("League not found.");
    }

    private async Task<Season> GetOwnedSeasonAsync(
        Guid leagueId, Guid seasonId, CancellationToken ct)
    {
        var season = await _db.Seasons.FirstOrDefaultAsync(
            s => s.Id == seasonId && s.LeagueId == leagueId, ct);
        return season ?? throw new NotFoundException("Season not found.");
    }

    private async Task<LeagueRound> GetOwnedRoundAsync(
        Guid leagueId, Guid seasonId, Guid roundId, CancellationToken ct)
    {
        var season = await GetOwnedSeasonAsync(leagueId, seasonId, ct);
        var round = await _db.LeagueRounds.FirstOrDefaultAsync(
            r => r.Id == roundId && r.SeasonId == seasonId, ct);
        return round ?? throw new NotFoundException("Round not found.");
    }

    private static LeagueResponse MapLeague(Domain.Entities.League l, int seasonCount) =>
        new()
        {
            Id             = l.Id,
            OrgId          = l.OrgId,
            Name           = l.Name,
            Format         = l.Format.ToString(),
            HandicapSystem = l.HandicapSystem.ToString(),
            HandicapCap    = l.HandicapCap,
            MaxFlights     = l.MaxFlights,
            DuesCents      = l.DuesCents,
            SeasonCount    = seasonCount,
            CreatedAt      = l.CreatedAt
        };

    private static SeasonResponse MapSeason(Season s, int memberCount, int roundCount) =>
        new()
        {
            Id             = s.Id,
            LeagueId       = s.LeagueId,
            Name           = s.Name,
            TotalRounds    = s.TotalRounds,
            StartDate      = s.StartDate,
            EndDate        = s.EndDate,
            Status         = s.Status,
            RoundsCounted  = s.RoundsCounted,
            StandingMethod = s.StandingMethod,
            MemberCount    = memberCount,
            RoundCount     = roundCount,
            CreatedAt      = s.CreatedAt
        };
}
