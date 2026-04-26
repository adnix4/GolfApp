// ─────────────────────────────────────────────────────────────────────────────
// Features/Auth/AuthValidators.cs — FluentValidation Rules for Auth Requests
// ─────────────────────────────────────────────────────────────────────────────
//
// WHY FLUENTVALIDATION ALONGSIDE DATA ANNOTATIONS:
//   Data annotations (like [Required] and [EmailAddress] on AuthModels.cs) handle
//   simple field-level format checks.  FluentValidation handles:
//     1. Multi-field rules (e.g. password confirmation matching)
//     2. Async rules (e.g. checking slug uniqueness against the DB)
//     3. Business rules with readable error messages in the API error format
//     4. Conditional rules (e.g. different validation based on request context)
//
// HOW ERRORS ARE RETURNED:
//   FluentValidation.AspNetCore integrates with the model binding pipeline.
//   When validation fails, ASP.NET Core automatically returns 400 Bad Request
//   with the spec error format via the ExceptionHandlingMiddleware:
//   { "error": "...", "code": "VALIDATION_ERROR", "details": { field: [messages] } }
// ─────────────────────────────────────────────────────────────────────────────

using FluentValidation;

namespace GolfFundraiserPro.Api.Features.Auth;

/// <summary>
/// Validates POST /api/v1/auth/register requests.
/// Only synchronous format/length rules here — DB uniqueness is checked in AuthService
/// because FluentValidation's ASP.NET auto-validation pipeline is synchronous and
/// cannot execute MustAsync rules.
/// </summary>
public class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        // ── EMAIL ──────────────────────────────────────────────────────────
        RuleFor(x => x.Email)
            .NotEmpty()
            .EmailAddress()
            .MaximumLength(254)
            .WithMessage("A valid email address is required.");

        // ── PASSWORD ───────────────────────────────────────────────────────
        RuleFor(x => x.Password)
            .NotEmpty()
            .MinimumLength(8)
            .WithMessage("Password must be at least 8 characters.")
            .Matches(@"\d")
            .WithMessage("Password must contain at least one number.")
            .MaximumLength(128)
            .WithMessage("Password must not exceed 128 characters.");

        // ── DISPLAY NAME ───────────────────────────────────────────────────
        RuleFor(x => x.DisplayName)
            .NotEmpty()
            .MaximumLength(100)
            .WithMessage("Display name is required and must be under 100 characters.");

        // ── ORG NAME ───────────────────────────────────────────────────────
        RuleFor(x => x.OrgName)
            .NotEmpty()
            .MaximumLength(200)
            .WithMessage("Organization name is required and must be under 200 characters.");

        // ── ORG SLUG ───────────────────────────────────────────────────────
        RuleFor(x => x.OrgSlug)
            .NotEmpty()
            .MaximumLength(60)
            .Matches(@"^[a-z0-9\-]+$")
            .WithMessage("Slug must contain only lowercase letters, numbers, and hyphens. Example: 'clhs-boosters'")
            .Must(slug => !slug.StartsWith('-') && !slug.EndsWith('-'))
            .WithMessage("Slug must not start or end with a hyphen.")
            .Must(slug => !slug.Contains("--"))
            .WithMessage("Slug must not contain consecutive hyphens.");
    }
}

/// <summary>
/// Validates POST /api/v1/auth/login requests.
/// Only format validation here — credential verification happens in AuthService.
/// </summary>
public class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty()
            .EmailAddress()
            .WithMessage("A valid email address is required.");

        RuleFor(x => x.Password)
            .NotEmpty()
            .WithMessage("Password is required.");
        // No further password rules here — we don't want to hint
        // to an attacker what the password policy is on the login form.
    }
}
