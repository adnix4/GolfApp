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
using Microsoft.EntityFrameworkCore;
using GolfFundraiserPro.Api.Data;

namespace GolfFundraiserPro.Api.Features.Auth;

/// <summary>
/// Validates POST /api/v1/auth/register requests.
/// Checks are async because slug and email uniqueness require DB queries.
/// </summary>
public class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    private readonly ApplicationDbContext _db;

    public RegisterRequestValidator(ApplicationDbContext db)
    {
        _db = db;

        // ── EMAIL ──────────────────────────────────────────────────────────
        RuleFor(x => x.Email)
            .NotEmpty()
            .EmailAddress()
            .MaximumLength(254)
            .WithMessage("A valid email address is required.")
            // Async check: is this email already registered?
            // MustAsync runs a DB query — only reached if prior rules pass.
            .MustAsync(BeUniqueEmailAsync)
            .WithMessage("An account with this email address already exists.");

        // ── PASSWORD ───────────────────────────────────────────────────────
        RuleFor(x => x.Password)
            .NotEmpty()
            .MinimumLength(8)
            .WithMessage("Password must be at least 8 characters.")
            .Matches(@"\d")
            .WithMessage("Password must contain at least one number.")
            // Prevent absurdly long passwords that could cause bcrypt DoS
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
            // Only lowercase letters, numbers, and hyphens allowed.
            // This ensures the slug is safe in URLs without encoding.
            .Matches(@"^[a-z0-9\-]+$")
            .WithMessage("Slug must contain only lowercase letters, numbers, and hyphens. Example: 'clhs-boosters'")
            // No leading/trailing hyphens
            .Must(slug => !slug.StartsWith('-') && !slug.EndsWith('-'))
            .WithMessage("Slug must not start or end with a hyphen.")
            // No consecutive hyphens
            .Must(slug => !slug.Contains("--"))
            .WithMessage("Slug must not contain consecutive hyphens.")
            // Async: is this slug already taken by another org?
            .MustAsync(BeUniqueSlugAsync)
            .WithMessage("This organization slug is already taken. Please choose a different one.");
    }

    private async Task<bool> BeUniqueEmailAsync(
        string email,
        CancellationToken ct)
    {
        // Check ASP.NET Identity users table for duplicate email
        return !await _db.Users
            .AnyAsync(u => u.NormalizedEmail == email.ToUpperInvariant(), ct);
    }

    private async Task<bool> BeUniqueSlugAsync(
        string slug,
        CancellationToken ct)
    {
        return !await _db.Organizations
            .AnyAsync(o => o.Slug == slug, ct);
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
