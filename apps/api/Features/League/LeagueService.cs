using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Emails;
using GolfFundraiserPro.Api.Features.Notifications;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace GolfFundraiserPro.Api.Features.League;

public class LeagueService
{
    private readonly ApplicationDbContext      _db;
    private readonly HandicapEngine            _handicap;
    private readonly StandingsCalculator       _standings;
    private readonly SkinsCalculator           _skins;
    private readonly PairingEngine             _pairing;
    private readonly EmailService              _email;
    private readonly PushNotificationService   _push;
    private readonly ILogger<LeagueService>    _logger;

    public LeagueService(
        ApplicationDbContext      db,
        HandicapEngine            handicap,
        StandingsCalculator       standings,
        SkinsCalculator           skins,
        PairingEngine             pairing,
        EmailService              email,
        PushNotificationService   push,
        ILogger<LeagueService>    logger)
    {
        _db        = db;
        _handicap  = handicap;
        _standings = standings;
        _skins     = skins;
        _pairing   = pairing;
        _email     = email;
        _push      = push;
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
                ScoredCount  = r.Scores.Select(s => s.MemberId).Distinct().Count(),
                AbsenceCount = r.Absences.Count
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

        var newPairings = new List<LeaguePairing>();
        for (int i = 0; i < req.Groups.Count; i++)
        {
            var g = req.Groups[i];
            var pairing = new LeaguePairing
            {
                Id            = Guid.NewGuid(),
                RoundId       = roundId,
                GroupNumber   = (short)(i + 1),
                MemberIdsJson = JsonSerializer.Serialize(g.MemberIds),
                TeeTime       = g.TeeTime,
                StartingHole  = g.StartingHole,
                IsLocked      = req.Lock
            };
            _db.LeaguePairings.Add(pairing);
            newPairings.Add(pairing);
        }

        LeagueRound? round = null;
        if (req.Lock)
        {
            round = await _db.LeagueRounds.FindAsync(new object?[] { roundId }, ct)!;
            if (round!.Status == RoundStatus.Scheduled)
                round.Status = RoundStatus.Open;
        }

        await _db.SaveChangesAsync(ct);

        // Fire pairing notifications when locked
        if (req.Lock && round is not null)
        {
            _ = Task.Run(() => SendPairingNotificationsAsync(
                orgId, seasonId, round, newPairings, CancellationToken.None));
        }
    }

    private async Task SendPairingNotificationsAsync(
        Guid orgId, Guid seasonId, LeagueRound round,
        List<LeaguePairing> groups, CancellationToken ct)
    {
        try
        {
            // Load all members in this season (keyed by id)
            var allMembers = await _db.LeagueMembers
                .Where(m => m.SeasonId == seasonId)
                .ToListAsync(ct);
            var memberMap = allMembers.ToDictionary(m => m.Id);

            // Load players for push tokens (only members with PlayerId)
            var playerIds = allMembers
                .Where(m => m.PlayerId.HasValue)
                .Select(m => m.PlayerId!.Value)
                .ToList();
            var playerTokens = await _db.Players
                .Where(p => playerIds.Contains(p.Id) && p.ExpoPushToken != null)
                .Select(p => new { p.Id, p.ExpoPushToken })
                .ToListAsync(ct);
            var tokenByPlayerId = playerTokens.ToDictionary(p => p.Id, p => p.ExpoPushToken!);

            // Round number: count of rounds in season sorted by date up to this one
            var roundNum = await _db.LeagueRounds
                .Where(r => r.SeasonId == seasonId && r.RoundDate <= round.RoundDate)
                .CountAsync(ct);

            foreach (var group in groups)
            {
                var groupMemberIds = PairingEngine.DeserializeMemberIds(group.MemberIdsJson);
                var groupMembers   = groupMemberIds.Select(id => memberMap.TryGetValue(id, out var m) ? m : null)
                    .Where(m => m is not null).ToList()!;

                var groupMateNames = groupMembers.Select(m => m!.FirstName).ToList();
                var teeTimeStr     = group.TeeTime.HasValue
                    ? group.TeeTime.Value.ToString(@"h\:mm tt")
                    : "TBD";
                var holeStr        = group.StartingHole.HasValue
                    ? $"Hole {group.StartingHole}"
                    : "see sheet";

                foreach (var member in groupMembers)
                {
                    if (member is null) continue;
                    var mates = groupMateNames.Where(n => n != member!.FirstName).ToList();
                    var matesStr = mates.Count > 0 ? string.Join(", ", mates) : "solo";
                    var pushBody = $"Round {roundNum} pairings — tee off {teeTimeStr} at {holeStr} with {matesStr}.";

                    // Push notification
                    if (member.PlayerId.HasValue && tokenByPlayerId.TryGetValue(member.PlayerId.Value, out var token))
                        await _push.SendAsync(new[] { token }, "Your Pairings Are Ready!", pushBody, null, ct);

                    // Email
                    await _email.SendAsync(orgId, EmailTriggerType.RoundResult, member.Email,
                        $"{member.FirstName} {member.LastName}", new Dictionary<string, string>
                        {
                            ["FIRST_NAME"]   = member.FirstName,
                            ["ROUND_NUMBER"] = roundNum.ToString(),
                            ["ROUND_DATE"]   = round.RoundDate.ToString("MMMM d, yyyy"),
                            ["TEE_TIME"]     = teeTimeStr,
                            ["STARTING_HOLE"] = holeStr,
                            ["GROUP_MATES"]  = matesStr,
                        }, ct);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error sending pairing notifications for round {RoundId}", round.Id);
        }
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

        var season = await GetOwnedSeasonAsync(leagueId, seasonId, ct);

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
        var handicapUpdates = await _handicap.RecalculateAsync(seasonId, roundId, ct);
        await _standings.RecalculateAsync(seasonId, ct);

        if (skinsPotCentsPerHolePerPlayer > 0)
            await _skins.CalculateAsync(roundId, skinsPotCentsPerHolePerPlayer, ct);

        _logger.LogInformation("Round {RoundId} closed. Handicaps, standings, and skins updated.", roundId);

        // Fire round result + handicap update emails (fire-and-forget)
        _ = Task.Run(() => SendRoundCloseEmailsAsync(
            orgId, seasonId, roundId, round, scoredMemberIds, handicapUpdates, CancellationToken.None));
    }

    private async Task SendRoundCloseEmailsAsync(
        Guid orgId, Guid seasonId, Guid roundId, LeagueRound round,
        List<Guid> scoredMemberIds,
        List<HandicapEngine.HandicapUpdateNotice> handicapUpdates,
        CancellationToken ct)
    {
        try
        {
            // Round result emails
            var scoredMembers = await _db.LeagueMembers
                .Where(m => scoredMemberIds.Contains(m.Id))
                .ToListAsync(ct);

            // Load scores for this round grouped by member
            var roundScores = await _db.LeagueScores
                .Where(s => s.RoundId == roundId)
                .GroupBy(s => s.MemberId)
                .Select(g => new
                {
                    MemberId  = g.Key,
                    Gross     = (int)g.Sum(s => s.GrossScore),
                    Net       = (int)g.Sum(s => s.NetScore),
                    Stableford = (int)g.Sum(s => s.StablefordPoints)
                })
                .ToListAsync(ct);

            foreach (var m in scoredMembers)
            {
                var rs = roundScores.FirstOrDefault(r => r.MemberId == m.Id);
                if (rs is null) continue;

                await _email.SendAsync(orgId, EmailTriggerType.RoundResult, m.Email,
                    $"{m.FirstName} {m.LastName}", new Dictionary<string, string>
                    {
                        ["FIRST_NAME"]   = m.FirstName,
                        ["ROUND_DATE"]   = round.RoundDate.ToString("MMMM d, yyyy"),
                        ["GROSS_SCORE"]  = rs.Gross.ToString(),
                        ["NET_SCORE"]    = rs.Net.ToString(),
                        ["STABLEFORD"]   = rs.Stableford.ToString(),
                    }, ct);
            }

            // Handicap update emails
            foreach (var update in handicapUpdates)
            {
                await _email.SendAsync(orgId, EmailTriggerType.HandicapUpdate, update.Email,
                    update.Name, new Dictionary<string, string>
                    {
                        ["FIRST_NAME"]    = update.Name.Split(' ').First(),
                        ["OLD_HANDICAP"]  = update.OldIndex.ToString("F1"),
                        ["NEW_HANDICAP"]  = update.NewIndex.ToString("F1"),
                        ["ROUND_DATE"]    = round.RoundDate.ToString("MMMM d, yyyy"),
                    }, ct);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error sending round close emails for round {RoundId}", roundId);
        }
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
                RoundsPlayed  = s.RoundsPlayed,
                MatchWins     = s.MatchWins,
                MatchLosses   = s.MatchLosses,
                MatchHalves   = s.MatchHalves
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

        var headToHead = await GetHeadToHeadAsync(seasonId, memberId, ct);

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
            RoundHistory  = roundResults,
            HeadToHead    = headToHead
        };
    }

    // ── ABSENCES ──────────────────────────────────────────────────────────────

    public async Task<RoundAbsenceResponse> ReportAbsenceAsync(
        Guid orgId, Guid leagueId, Guid seasonId, Guid roundId,
        ReportAbsenceRequest req, CancellationToken ct)
    {
        await GetOwnedRoundAsync(leagueId, seasonId, roundId, ct);
        var member = await _db.LeagueMembers
            .FirstOrDefaultAsync(m => m.Id == req.MemberId && m.SeasonId == seasonId, ct)
            ?? throw new NotFoundException("Member not found.");

        var existing = await _db.RoundAbsences
            .FirstOrDefaultAsync(a => a.RoundId == roundId && a.MemberId == req.MemberId, ct);
        if (existing is not null)
            throw new ValidationException("Absence already reported for this member and round.");

        var absence = new RoundAbsence
        {
            Id         = Guid.NewGuid(),
            RoundId    = roundId,
            MemberId   = req.MemberId,
            ReportedAt = DateTime.UtcNow
        };
        _db.RoundAbsences.Add(absence);
        member.Absences++;
        await _db.SaveChangesAsync(ct);

        return new RoundAbsenceResponse
        {
            Id         = absence.Id,
            RoundId    = roundId,
            MemberId   = req.MemberId,
            MemberName = $"{member.FirstName} {member.LastName}",
            ReportedAt = absence.ReportedAt
        };
    }

    public async Task<List<RoundAbsenceResponse>> GetRoundAbsencesAsync(
        Guid orgId, Guid leagueId, Guid seasonId, Guid roundId, CancellationToken ct)
    {
        await GetOwnedRoundAsync(leagueId, seasonId, roundId, ct);
        return await _db.RoundAbsences
            .Include(a => a.Member)
            .Include(a => a.Sub)
            .Where(a => a.RoundId == roundId)
            .Select(a => new RoundAbsenceResponse
            {
                Id            = a.Id,
                RoundId       = a.RoundId,
                MemberId      = a.MemberId,
                MemberName    = $"{a.Member.FirstName} {a.Member.LastName}",
                SubMemberId   = a.SubMemberId,
                SubMemberName = a.Sub != null ? $"{a.Sub.FirstName} {a.Sub.LastName}" : null,
                ReportedAt    = a.ReportedAt
            })
            .ToListAsync(ct);
    }

    // ── SUBSTITUTES ───────────────────────────────────────────────────────────

    public async Task<LeagueMemberResponse> AddSubstituteAsync(
        Guid orgId, Guid leagueId, Guid seasonId, Guid roundId,
        AddSubstituteRequest req, CancellationToken ct)
    {
        await GetOwnedRoundAsync(leagueId, seasonId, roundId, ct);

        var absence = await _db.RoundAbsences
            .FirstOrDefaultAsync(a => a.RoundId == roundId && a.MemberId == req.AbsentMemberId, ct)
            ?? throw new NotFoundException("Absence record not found for this member and round.");

        var sub = new LeagueMember
        {
            Id            = Guid.NewGuid(),
            SeasonId      = seasonId,
            FirstName     = req.FirstName,
            LastName      = req.LastName,
            Email         = req.Email,
            HandicapIndex = req.HandicapIndex,
            Status        = MemberStatus.Sub,
            JoinedAt      = DateTime.UtcNow
        };
        _db.LeagueMembers.Add(sub);
        absence.SubMemberId = sub.Id;
        await _db.SaveChangesAsync(ct);

        return new LeagueMemberResponse
        {
            Id = sub.Id, SeasonId = seasonId, PlayerId = null,
            FlightId = null, FlightName = null,
            FirstName = sub.FirstName, LastName = sub.LastName,
            Email = sub.Email, HandicapIndex = sub.HandicapIndex,
            DuesPaid = false, RoundsPlayed = 0, Absences = 0,
            Status = sub.Status.ToString(), IsSandbagger = false
        };
    }

    // ── HEAD-TO-HEAD ──────────────────────────────────────────────────────────

    public async Task<List<HeadToHeadRow>> GetHeadToHeadAsync(
        Guid seasonId, Guid memberId, CancellationToken ct)
    {
        var closedRoundIds = await _db.LeagueRounds
            .Where(r => r.SeasonId == seasonId && r.Status == RoundStatus.Closed)
            .Select(r => r.Id)
            .ToListAsync(ct);

        if (closedRoundIds.Count == 0) return new List<HeadToHeadRow>();

        var pairings = await _db.LeaguePairings
            .Where(p => closedRoundIds.Contains(p.RoundId))
            .ToListAsync(ct);

        var relevantPairings = pairings
            .Where(p => PairingEngine.DeserializeMemberIds(p.MemberIdsJson).Contains(memberId))
            .ToList();

        if (relevantPairings.Count == 0) return new List<HeadToHeadRow>();

        var roundIds = relevantPairings.Select(p => p.RoundId).Distinct().ToList();

        var scores = await _db.LeagueScores
            .Where(s => roundIds.Contains(s.RoundId))
            .GroupBy(s => new { s.RoundId, s.MemberId })
            .Select(g => new { g.Key.RoundId, g.Key.MemberId, NetTotal = (int)g.Sum(s => s.NetScore) })
            .ToListAsync(ct);

        var records = new Dictionary<Guid, (int Wins, int Losses, int Ties)>();

        foreach (var pairing in relevantPairings)
        {
            var groupIds = PairingEngine.DeserializeMemberIds(pairing.MemberIdsJson);
            var myNet    = scores.FirstOrDefault(s => s.RoundId == pairing.RoundId && s.MemberId == memberId)?.NetTotal;
            if (myNet is null) continue;

            foreach (var oppId in groupIds.Where(id => id != memberId))
            {
                var oppNet = scores.FirstOrDefault(s => s.RoundId == pairing.RoundId && s.MemberId == oppId)?.NetTotal;
                if (oppNet is null) continue;

                records.TryGetValue(oppId, out var cur);
                records[oppId] = myNet < oppNet
                    ? (cur.Wins + 1, cur.Losses, cur.Ties)
                    : myNet > oppNet
                        ? (cur.Wins, cur.Losses + 1, cur.Ties)
                        : (cur.Wins, cur.Losses, cur.Ties + 1);
            }
        }

        if (records.Count == 0) return new List<HeadToHeadRow>();

        var opponentIds = records.Keys.ToList();
        var opponentMap = await _db.LeagueMembers
            .Where(m => opponentIds.Contains(m.Id))
            .Select(m => new { m.Id, Name = $"{m.FirstName} {m.LastName}" })
            .ToDictionaryAsync(m => m.Id, m => m.Name, ct);

        return records
            .Select(kv => new HeadToHeadRow
            {
                OpponentId   = kv.Key,
                OpponentName = opponentMap.TryGetValue(kv.Key, out var n) ? n : "Unknown",
                Wins         = kv.Value.Wins,
                Losses       = kv.Value.Losses,
                Ties         = kv.Value.Ties
            })
            .OrderByDescending(r => r.Wins)
            .ThenBy(r => r.Losses)
            .ToList();
    }

    // ── HANDICAP SYNC TOGGLE ─────────────────────────────────────────────────

    public async Task UpdateSeasonSyncAsync(
        Guid orgId, Guid leagueId, Guid seasonId,
        UpdateSeasonSyncRequest req, CancellationToken ct)
    {
        await GetOwnedLeagueAsync(orgId, leagueId, ct);
        var season = await GetOwnedSeasonAsync(leagueId, seasonId, ct);
        season.SyncHandicapToPlayer = req.SyncHandicapToPlayer;
        await _db.SaveChangesAsync(ct);
    }

    // ── PDF EXPORTS ───────────────────────────────────────────────────────────

    public async Task<byte[]> GetPairingsPdfBytesAsync(
        Guid orgId, Guid leagueId, Guid seasonId, Guid roundId, CancellationToken ct)
    {
        var round = await GetOwnedRoundAsync(leagueId, seasonId, roundId, ct);
        var course = round.CourseId.HasValue
            ? await _db.Courses.FindAsync(new object?[] { round.CourseId.Value }, ct)
            : null;

        var pairings = await _db.LeaguePairings
            .Where(p => p.RoundId == roundId)
            .OrderBy(p => p.GroupNumber)
            .ToListAsync(ct);

        var allMemberIds = pairings
            .SelectMany(p => PairingEngine.DeserializeMemberIds(p.MemberIdsJson))
            .Distinct().ToList();

        var memberMap = await _db.LeagueMembers
            .Where(m => allMemberIds.Contains(m.Id))
            .Select(m => new { m.Id, Name = $"{m.FirstName} {m.LastName}", m.HandicapIndex })
            .ToDictionaryAsync(m => m.Id, ct);

        return QuestPDF.Fluent.Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(QuestPDF.Helpers.PageSizes.Letter);
                page.Margin(1, QuestPDF.Infrastructure.Unit.Centimetre);
                page.DefaultTextStyle(x => x.FontSize(10));

                page.Header().Column(col =>
                {
                    col.Item().Text($"Pairings Tee Sheet")
                        .FontSize(18).Bold();
                    col.Item().Text($"{round.RoundDate:MMMM d, yyyy}" +
                        (course != null ? $"  ·  {course.Name}" : ""))
                        .FontSize(11).FontColor(QuestPDF.Helpers.Colors.Grey.Darken2);
                    col.Item().Height(8);
                });

                page.Content().Column(col =>
                {
                    foreach (var pairing in pairings)
                    {
                        var ids     = PairingEngine.DeserializeMemberIds(pairing.MemberIdsJson);
                        var teeStr  = pairing.TeeTime.HasValue
                            ? pairing.TeeTime.Value.ToString(@"h\:mm tt") : "—";
                        var holeStr = pairing.StartingHole.HasValue
                            ? $"Hole {pairing.StartingHole}" : "—";

                        col.Item().Border(1)
                            .BorderColor(QuestPDF.Helpers.Colors.Grey.Lighten2)
                            .Padding(6)
                            .Column(inner =>
                            {
                                inner.Item().Row(row =>
                                {
                                    row.RelativeItem().Text($"Group {pairing.GroupNumber}")
                                        .Bold().FontSize(12);
                                    row.AutoItem().Text($"{teeStr}  ·  {holeStr}")
                                        .FontSize(10)
                                        .FontColor(QuestPDF.Helpers.Colors.Grey.Darken1);
                                });

                                foreach (var id in ids)
                                {
                                    if (!memberMap.TryGetValue(id, out var m)) continue;
                                    inner.Item().Text($"  {m.Name}  (HCP {m.HandicapIndex:F1})")
                                        .FontSize(10);
                                }
                            });

                        col.Item().Height(6);
                    }
                });

                page.Footer().AlignRight()
                    .Text(t =>
                    {
                        t.Span("Page ").FontSize(8);
                        t.CurrentPageNumber().FontSize(8);
                        t.Span(" of ").FontSize(8);
                        t.TotalPages().FontSize(8);
                    });
            });
        }).GeneratePdf();
    }

    public async Task<byte[]> GetStandingsPdfBytesAsync(
        Guid orgId, Guid leagueId, Guid seasonId, CancellationToken ct)
    {
        await GetOwnedLeagueAsync(orgId, leagueId, ct);
        var season = await GetOwnedSeasonAsync(leagueId, seasonId, ct);
        var rows   = await GetStandingsAsync(orgId, leagueId, seasonId, ct);

        var league = await _db.Leagues.FindAsync(new object?[] { season.LeagueId }, ct);
        var isStroke = league?.Format == LeagueFormat.Stroke;

        return QuestPDF.Fluent.Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(QuestPDF.Helpers.PageSizes.Letter);
                page.Margin(1, QuestPDF.Infrastructure.Unit.Centimetre);
                page.DefaultTextStyle(x => x.FontSize(10));

                page.Header().Column(col =>
                {
                    col.Item().Text("Season Standings").FontSize(18).Bold();
                    col.Item().Text($"{season.Name}  ·  {DateTime.UtcNow:MMMM d, yyyy}")
                        .FontSize(11).FontColor(QuestPDF.Helpers.Colors.Grey.Darken2);
                    col.Item().Height(8);
                });

                page.Content().Table(table =>
                {
                    table.ColumnsDefinition(cols =>
                    {
                        cols.ConstantColumn(35);  // Rank
                        cols.RelativeColumn(3);   // Name
                        cols.RelativeColumn(2);   // Flight
                        cols.ConstantColumn(45);  // HCP
                        cols.ConstantColumn(55);  // Points / Net
                        cols.ConstantColumn(40);  // Rounds
                    });

                    // Header row
                    static QuestPDF.Infrastructure.IContainer HeaderCell(
                        QuestPDF.Infrastructure.IContainer c) =>
                        c.Background(QuestPDF.Helpers.Colors.Grey.Lighten3).Padding(4);

                    table.Header(header =>
                    {
                        header.Cell().Element(HeaderCell).Text("Rank").Bold();
                        header.Cell().Element(HeaderCell).Text("Player").Bold();
                        header.Cell().Element(HeaderCell).Text("Flight").Bold();
                        header.Cell().Element(HeaderCell).Text("HCP").Bold();
                        header.Cell().Element(HeaderCell).Text(isStroke ? "Net" : "Pts").Bold();
                        header.Cell().Element(HeaderCell).Text("Rnds").Bold();
                    });

                    // Data rows
                    foreach (var (r, idx) in rows.Select((r, i) => (r, i)))
                    {
                        var bg = idx % 2 == 0
                            ? QuestPDF.Helpers.Colors.White
                            : QuestPDF.Helpers.Colors.Grey.Lighten5;

                        QuestPDF.Infrastructure.IContainer DataCell(
                            QuestPDF.Infrastructure.IContainer c) =>
                            c.Background(bg).Padding(4);

                        table.Cell().Element(DataCell).Text(r.Rank.ToString());
                        table.Cell().Element(DataCell).Text(r.MemberName);
                        table.Cell().Element(DataCell).Text(r.FlightName);
                        table.Cell().Element(DataCell).Text(r.HandicapIndex.ToString("F1"));
                        table.Cell().Element(DataCell)
                            .Text(isStroke ? r.NetStrokes.ToString() : r.TotalPoints.ToString());
                        table.Cell().Element(DataCell).Text(r.RoundsPlayed.ToString());
                    }
                });

                page.Footer().AlignRight()
                    .Text(t =>
                    {
                        t.Span("Page ").FontSize(8);
                        t.CurrentPageNumber().FontSize(8);
                        t.Span(" of ").FontSize(8);
                        t.TotalPages().FontSize(8);
                    });
            });
        }).GeneratePdf();
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
            Id                   = s.Id,
            LeagueId             = s.LeagueId,
            Name                 = s.Name,
            TotalRounds          = s.TotalRounds,
            StartDate            = s.StartDate,
            EndDate              = s.EndDate,
            Status               = s.Status,
            RoundsCounted        = s.RoundsCounted,
            StandingMethod       = s.StandingMethod,
            SyncHandicapToPlayer = s.SyncHandicapToPlayer,
            MemberCount          = memberCount,
            RoundCount           = roundCount,
            CreatedAt            = s.CreatedAt
        };
}
