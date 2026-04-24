// ─────────────────────────────────────────────────────────────────────────────
// Common/Middleware/ExceptionHandlingMiddleware.cs
// ─────────────────────────────────────────────────────────────────────────────
//
// WHY THIS EXISTS:
//   Without a global exception handler, unhandled exceptions produce:
//     • ASP.NET HTML "Developer Exception Page" in Development
//     • A 500 response with no body in Production
//   Neither matches the API error format required by spec Foundation §10:
//     { "error": string, "code": string, "details"?: object }
//
//   This middleware sits at the top of the pipeline and catches any exception
//   that bubbles up from controllers, services, or EF Core. It translates the
//   exception into the correct JSON error shape and HTTP status code.
//
// PLACEMENT IN PIPELINE:
//   Registered FIRST in Program.cs so it wraps the entire pipeline.
//   Any exception thrown anywhere below it is caught here.
//
// SECURITY NOTE:
//   In Production, stack traces are NEVER included in responses.
//   Only in Development do we include them for debugging convenience.
//   This prevents internal implementation details from leaking to attackers.
// ─────────────────────────────────────────────────────────────────────────────

using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace GolfFundraiserPro.Api.Common.Middleware;

/// <summary>
/// Global exception handling middleware. Catches all unhandled exceptions
/// and returns a structured JSON error response matching spec Foundation §10.1.
/// </summary>
public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;
    private readonly IWebHostEnvironment _env;

    public ExceptionHandlingMiddleware(
        RequestDelegate next,
        ILogger<ExceptionHandlingMiddleware> logger,
        IWebHostEnvironment env)
    {
        _next   = next;
        _logger = logger;
        _env    = env;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            // Pass the request down the pipeline.
            // If no exception is thrown, this middleware is transparent.
            await _next(context);
        }
        catch (Exception ex)
        {
            // Log the full exception with stack trace for server-side debugging.
            // The client only sees a sanitised version.
            _logger.LogError(ex, "Unhandled exception for {Method} {Path}",
                context.Request.Method, context.Request.Path);

            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        // Translate the exception type to an HTTP status code and error code
        // matching the standard error codes in spec Foundation §10.1.
        var (statusCode, errorCode, message) = exception switch
        {
            // ── KNOWN DOMAIN EXCEPTIONS ──────────────────────────────────
            // These are deliberately thrown by feature services to signal
            // expected error conditions (not bugs).

            NotFoundException notFound =>
                (HttpStatusCode.NotFound, "NOT_FOUND", notFound.Message),

            ConflictException conflict =>
                (HttpStatusCode.Conflict, "CONFLICT", conflict.Message),

            ForbiddenException forbidden =>
                (HttpStatusCode.Forbidden, "FORBIDDEN", forbidden.Message),

            ValidationException validation =>
                (HttpStatusCode.BadRequest, "VALIDATION_ERROR", validation.Message),

            // ── EF CORE / POSTGRES EXCEPTIONS ────────────────────────────
            // EF Core throws DbUpdateException when a DB constraint is violated.
            // The most common cause is a UNIQUE constraint violation (duplicate key).

            DbUpdateException dbEx when IsUniqueConstraintViolation(dbEx) =>
                (HttpStatusCode.Conflict, "CONFLICT",
                    "A record with these values already exists."),

            DbUpdateException dbEx =>
                (HttpStatusCode.InternalServerError, "DATABASE_ERROR",
                    "A database error occurred. Please try again."),

            // ── UNEXPECTED EXCEPTIONS ─────────────────────────────────────
            // Anything not explicitly handled above is a bug or infrastructure failure.
            // Return 500 with a generic message — NEVER expose internal details.

            _ => (HttpStatusCode.InternalServerError, "INTERNAL_ERROR",
                    "An unexpected error occurred. Please try again.")
        };

        // Build the response body matching spec Foundation §10 error format:
        // { "error": string, "code": string, "details"?: object }
        var errorResponse = new ErrorResponse
        {
            Error   = message,
            Code    = errorCode,
            // Only include the stack trace in Development.
            // In Production this field is omitted entirely.
            Details = _env.IsDevelopment()
                ? new { stackTrace = exception.ToString() }
                : null,
        };

        context.Response.StatusCode  = (int)statusCode;
        context.Response.ContentType = "application/json";

        var json = JsonSerializer.Serialize(errorResponse, new JsonSerializerOptions
        {
            PropertyNamingPolicy        = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition      = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
        });

        await context.Response.WriteAsync(json);
    }

    /// <summary>
    /// Detects whether a DbUpdateException was caused by a UNIQUE constraint violation.
    /// PostgreSQL error code 23505 = unique_violation.
    /// </summary>
    private static bool IsUniqueConstraintViolation(DbUpdateException ex)
    {
        // PostgreSQL error codes are in the InnerException
        return ex.InnerException?.Message.Contains("23505") == true
            || ex.InnerException?.Message.Contains("unique constraint") == true
            || ex.InnerException?.Message.Contains("duplicate key") == true;
    }
}

// ── RESPONSE SHAPE ────────────────────────────────────────────────────────────

/// <summary>
/// JSON response shape for all API errors.
/// Matches spec Foundation §10: { error, code, details? }
/// </summary>
public class ErrorResponse
{
    public string Error   { get; set; } = string.Empty;
    public string Code    { get; set; } = string.Empty;
    public object? Details { get; set; }
}

// ── CUSTOM EXCEPTION TYPES ────────────────────────────────────────────────────
// Feature services throw these typed exceptions instead of generic exceptions.
// This separates "expected business errors" from unexpected bugs.

/// <summary>
/// Thrown when a requested resource doesn't exist or isn't visible to this org.
/// → HTTP 404 NOT_FOUND
/// </summary>
public class NotFoundException : Exception
{
    public NotFoundException(string message) : base(message) { }
    public NotFoundException(string entityName, Guid id)
        : base($"{entityName} with id '{id}' was not found.") { }
}

/// <summary>
/// Thrown when an operation would create a duplicate unique value.
/// → HTTP 409 CONFLICT
/// </summary>
public class ConflictException : Exception
{
    public ConflictException(string message) : base(message) { }
}

/// <summary>
/// Thrown when the authenticated user lacks permission for the requested action.
/// → HTTP 403 FORBIDDEN
/// </summary>
public class ForbiddenException : Exception
{
    public ForbiddenException(string message) : base(message) { }
    public ForbiddenException() : base("You do not have permission to perform this action.") { }
}

/// <summary>
/// Thrown when request data fails business-rule validation
/// (distinct from FluentValidation which handles field-level format validation).
/// → HTTP 400 VALIDATION_ERROR
/// </summary>
public class ValidationException : Exception
{
    public ValidationException(string message) : base(message) { }
}
