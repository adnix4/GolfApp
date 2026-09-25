using System.Text.Json;
using GolfFundraiserPro.Api.Domain.Enums;

namespace GolfFundraiserPro.Api.Features.Scores;

/// <summary>
/// How a hole is scored under each event format (U8) — pure, no DB, unit-tested.
///
/// The organizer picks the format; this is the one place that turns the
/// per-golfer strokes in scores.player_shots into what that format counts.
/// Both clients carry a TypeScript twin (packages/shared-types/src/formatScoring.ts)
/// for their live preview — change the two in lockstep. The server is the
/// authority: every write path recomputes GrossScore through here, so a client
/// running old math (or an old build syncing from a phone) can't store a
/// number the format doesn't produce.
///
///   Scramble   — one team ball. player_shots is "shots of yours the team
///                used", so the counts SUM to the team score.
///   BestBall   — Rules of Golf 23 (four-ball): everyone plays their own ball,
///                the LOWEST golfer score is the team's score on the hole.
///   Stroke     — Rule 3.3: individual. Each golfer's strokes are their own
///                score; standings are per golfer. The team row stores the
///                aggregate only so the team view has a number.
///   Stableford — Rule 21.1: points per GOLFER against par, summed for the
///                team. The team row stores the aggregate strokes.
///
/// Gross only — events carry no handicaps.
/// </summary>
public static class FormatScoring
{
    /// <summary>
    /// Upper bounds for a team row. A Stroke/Stableford row aggregates every
    /// golfer's ball, so the old single-ball limits (20 strokes, 10 putts)
    /// rejected an ordinary foursome. Sized for the largest team (8, see
    /// TeamValidators) at the single-ball limits.
    /// </summary>
    public const short MaxTeamHoleGross = 160;
    public const short MaxTeamHolePutts = 80;

    /// <summary>
    /// Parses scores.player_shots ({ "player-uuid": strokes }). Malformed JSON,
    /// non-GUID keys and non-positive counts are dropped — a golfer at 0 has
    /// no score on the hole, not a score of 0.
    /// </summary>
    public static IReadOnlyDictionary<Guid, int> ParseShots(string? json)
    {
        var result = new Dictionary<Guid, int>();
        if (string.IsNullOrWhiteSpace(json)) return result;

        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return result;

            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                if (!Guid.TryParse(prop.Name, out var playerId)) continue;
                if (prop.Value.ValueKind != JsonValueKind.Number) continue;
                if (!prop.Value.TryGetInt32(out var strokes) || strokes <= 0) continue;
                result[playerId] = strokes;
            }
        }
        catch (JsonException)
        {
            // Unreadable breakdown — fall back to the typed gross.
        }

        return result;
    }

    /// <summary>
    /// The team row's GrossScore for a hole. With no per-golfer strokes the
    /// gross the client sent stands — that is a score typed directly on the
    /// card, and there's nothing to derive it from.
    /// </summary>
    public static short TeamHoleGross(
        EventFormat format, IReadOnlyDictionary<Guid, int> shots, short fallbackGross)
    {
        if (shots.Count == 0) return fallbackGross;

        var gross = format == EventFormat.BestBall
            ? shots.Values.Min()
            : shots.Values.Sum();

        return (short)Math.Min(gross, short.MaxValue);
    }

    /// <summary>
    /// Stableford points for one score against par (Rule 21.1):
    /// double bogey or worse 0 · bogey 1 · par 2 · birdie 3 · eagle 4 · albatross 5.
    /// </summary>
    public static int StablefordPoints(int par, int strokes)
        => Math.Max(0, par - strokes + 2);

    /// <summary>
    /// A team's Stableford points on a hole: each golfer's points, summed. A
    /// hole typed as a single gross (no breakdown) scores as one ball.
    /// </summary>
    public static int TeamStablefordPoints(
        IReadOnlyDictionary<Guid, int> shots, int par, int teamGross)
        => shots.Count == 0
            ? StablefordPoints(par, teamGross)
            : shots.Values.Sum(s => StablefordPoints(par, s));

    /// <summary>
    /// Par the team row is measured against: one par per ball in play. A
    /// Stroke/Stableford row aggregates every golfer's strokes, so comparing it
    /// to a single par would read a foursome of pars as +12.
    /// </summary>
    public static int TeamHolePar(
        EventFormat format, IReadOnlyDictionary<Guid, int> shots, int par)
        => IsAggregate(format) && shots.Count > 0 ? par * shots.Count : par;

    /// <summary>
    /// Whether a completed hole is a hole-in-one, and by whom.
    ///
    /// Scramble: the team made it in one — credited to the team (no players).
    /// Other formats: any golfer whose own ball went in with one stroke. The
    /// team row can't tell you that — a Stroke foursome's aggregate is never 1.
    /// With no breakdown, a typed gross of 1 is the only evidence there is.
    /// </summary>
    public static HoleInOne? FindHoleInOne(
        EventFormat format, IReadOnlyDictionary<Guid, int> shots, short gross)
    {
        if (format == EventFormat.Scramble || shots.Count == 0)
            return gross == 1 ? new HoleInOne([]) : null;

        var aces = shots.Where(kv => kv.Value == 1).Select(kv => kv.Key).ToList();
        return aces.Count > 0 ? new HoleInOne(aces) : null;
    }

    /// <summary>
    /// Formats whose team row is an aggregate of every golfer's own ball
    /// rather than one team score (Scramble's ball, Best Ball's lowest).
    /// </summary>
    public static bool IsAggregate(EventFormat format)
        => format is EventFormat.Stroke or EventFormat.Stableford;

    /// <param name="PlayerIds">Golfers who aced. Empty = the team (scramble, or no breakdown).</param>
    public sealed record HoleInOne(IReadOnlyList<Guid> PlayerIds);
}
