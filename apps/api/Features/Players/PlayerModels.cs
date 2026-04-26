using System.ComponentModel.DataAnnotations;

namespace GolfFundraiserPro.Api.Features.Players;

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
