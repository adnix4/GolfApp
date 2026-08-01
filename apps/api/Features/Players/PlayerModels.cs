using System.ComponentModel.DataAnnotations;

namespace GolfFundraiserPro.Api.Features.Players;

public record AddPlayerRequest
{
    [Required, MaxLength(100)]
    public string FirstName { get; init; } = "";

    [Required, MaxLength(100)]
    public string LastName { get; init; } = "";

    [MaxLength(254), EmailAddress]
    public string? Email { get; init; }

    [MaxLength(30)]
    public string? Phone { get; init; }

    [Range(0.0, 54.0)]
    public double? HandicapIndex { get; init; }

    /// <summary>Assign to this team. Omit or pass null to add as a free agent.</summary>
    public Guid? TeamId { get; init; }

    /// <summary>
    /// True to register a non-golfer attendee (spouse, sponsor, banquet guest)
    /// so they can bid in the auction. Forces a team-less player tagged
    /// RegistrationType.Attendee, which keeps them off the leaderboard, out of
    /// pairings, and out of the check-in counts that gate Open Scoring.
    /// Ignored when TeamId is supplied — an attendee is never on a team.
    /// </summary>
    public bool IsAttendee { get; init; }
}

public record UpdatePlayerRequest
{
    [MaxLength(100)]
    public string? FirstName { get; init; }

    [MaxLength(100)]
    public string? LastName { get; init; }

    [MaxLength(30)]
    public string? Phone { get; init; }

    [Range(0.0, 54.0)]
    public double? HandicapIndex { get; init; }

    /// <summary>
    /// Reassign to a different team. Pass Guid.Empty to remove from current team
    /// (makes the player a free agent). Null = no change.
    /// </summary>
    public Guid? TeamId { get; init; }

    public bool? ClearTeam { get; init; }
}
