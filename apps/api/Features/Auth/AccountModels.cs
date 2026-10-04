using System.ComponentModel.DataAnnotations;

namespace GolfFundraiserPro.Api.Features.Auth;

// ── Accepting a staff invite (problemList D20) ──────────────────────────────

/// <summary>What the accept screen shows before the person sets a password.</summary>
public record InvitePreviewResponse
{
    public string OrgName { get; init; } = string.Empty;
    public string Email   { get; init; } = string.Empty;
    public string Role    { get; init; } = string.Empty;
}

public record AcceptInviteRequest
{
    [Required]
    public string Token { get; init; } = string.Empty;

    [Required, MinLength(2), MaxLength(100)]
    public string DisplayName { get; init; } = string.Empty;

    /// <summary>Identity enforces the same rules as registration (8+, a digit, a lowercase letter).</summary>
    [Required]
    public string Password { get; init; } = string.Empty;
}

// ── Password reset (problemList D21) ────────────────────────────────────────

public record ForgotPasswordRequest
{
    [Required, EmailAddress]
    public string Email { get; init; } = string.Empty;
}

public record ResetPasswordRequest
{
    [Required, EmailAddress]
    public string Email { get; init; } = string.Empty;

    [Required]
    public string Token { get; init; } = string.Empty;

    [Required]
    public string NewPassword { get; init; } = string.Empty;
}
