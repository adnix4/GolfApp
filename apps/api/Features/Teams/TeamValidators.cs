// ─────────────────────────────────────────────────────────────────────────────
// Features/Teams/TeamValidators.cs — FluentValidation Rules for Team Requests
// ─────────────────────────────────────────────────────────────────────────────

using FluentValidation;

namespace GolfFundraiserPro.Api.Features.Teams;

public class RegisterTeamRequestValidator : AbstractValidator<RegisterTeamRequest>
{
    public RegisterTeamRequestValidator()
    {
        RuleFor(x => x.TeamName)
            .NotEmpty()
            .MaximumLength(200)
            .WithMessage("Team name is required and must be under 200 characters.");

        RuleFor(x => x.Players)
            .NotEmpty()
            .WithMessage("At least one player (the captain) is required.")
            .Must(p => p.Count <= 8)
            .WithMessage("A team cannot have more than 8 players.");

        // No duplicate emails within the same registration request
        // (prevents the same person registering twice in one submission)
        RuleFor(x => x.Players)
            .Must(players =>
                players.Select(p => p.Email.ToLowerInvariant()).Distinct().Count()
                == players.Count)
            .When(x => x.Players.Count > 1)
            .WithMessage("Duplicate email addresses are not allowed within a team registration.");

        RuleForEach(x => x.Players)
            .SetValidator(new PlayerInputValidator());
    }
}

public class JoinTeamRequestValidator : AbstractValidator<JoinTeamRequest>
{
    public JoinTeamRequestValidator()
    {
        RuleFor(x => x.InviteToken)
            .NotEmpty()
            .WithMessage("An invite token is required to join a team.");

        RuleFor(x => x.Player)
            .NotNull()
            .WithMessage("Player information is required.")
            .SetValidator(new PlayerInputValidator());
    }
}

public class RegisterFreeAgentRequestValidator : AbstractValidator<RegisterFreeAgentRequest>
{
    public RegisterFreeAgentRequestValidator()
    {
        RuleFor(x => x.Player)
            .NotNull()
            .WithMessage("Player information is required.")
            .SetValidator(new PlayerInputValidator());

        RuleFor(x => x.PairingNote)
            .MaximumLength(500)
            .When(x => x.PairingNote != null)
            .WithMessage("Pairing note must be under 500 characters.");
    }
}

public class AssignFreeAgentRequestValidator : AbstractValidator<AssignFreeAgentRequest>
{
    public AssignFreeAgentRequestValidator()
    {
        RuleFor(x => x.PlayerId)
            .NotEmpty()
            .WithMessage("Player ID is required.");

        RuleFor(x => x.TeamId)
            .NotEmpty()
            .WithMessage("Team ID is required.");
    }
}

public class UpdateTeamRequestValidator : AbstractValidator<UpdateTeamRequest>
{
    public UpdateTeamRequestValidator()
    {
        RuleFor(x => x.Name)
            .MaximumLength(200)
            .When(x => x.Name != null)
            .WithMessage("Team name must be under 200 characters.");

        RuleFor(x => x.MaxPlayers)
            .InclusiveBetween((short)1, (short)8)
            .When(x => x.MaxPlayers.HasValue)
            .WithMessage("Max players must be between 1 and 8.");
    }
}

/// <summary>
/// Shared validator for PlayerInput — used by all three registration modes.
/// </summary>
public class PlayerInputValidator : AbstractValidator<PlayerInput>
{
    public PlayerInputValidator()
    {
        RuleFor(x => x.FirstName)
            .NotEmpty()
            .MaximumLength(100)
            .WithMessage("First name is required.");

        RuleFor(x => x.LastName)
            .NotEmpty()
            .MaximumLength(100)
            .WithMessage("Last name is required.");

        RuleFor(x => x.Email)
            .NotEmpty()
            .EmailAddress()
            .MaximumLength(254)
            .WithMessage("A valid email address is required.");

        RuleFor(x => x.Phone)
            .MaximumLength(30)
            .When(x => x.Phone != null);

        RuleFor(x => x.HandicapIndex)
            .InclusiveBetween(0.0, 54.0)
            .When(x => x.HandicapIndex.HasValue)
            .WithMessage("Handicap index must be between 0 and 54.");
    }
}
