// ─────────────────────────────────────────────────────────────────────────────
// Program.cs — Golf Fundraiser Pro API Entry Point
// ─────────────────────────────────────────────────────────────────────────────
//
// WHY THIS FILE IS MINIMAL:
//   The actual service registrations live in ServiceCollectionExtensions.cs.
//   Program.cs is intentionally kept short — it should read like a table of
//   contents for the application, not a wall of configuration code.
//
// PIPELINE ORDER MATTERS:
//   ASP.NET Core middleware is executed in registration order on the way IN,
//   and reverse order on the way OUT. The order below is required:
//
//   1. ExceptionHandling — must be OUTERMOST so it catches exceptions from
//      all middleware below it (including auth, routing, controllers).
//
//   2. Swagger — only in Development; harmless to put early in the pipeline.
//
//   3. HTTPS Redirection — redirects http:// to https:// in production.
//      Skipped in Development (local Docker doesn't have TLS).
//
//   4. CORS — must be BEFORE routing and authorization. CORS preflight
//      requests (OPTIONS) must be handled before auth checks.
//
//   5. Routing — sets up endpoint routing (controllers, minimal APIs).
//
//   6. Authentication — validates JWT Bearer tokens and sets HttpContext.User.
//      Must be BEFORE Authorization (can't authorize without authenticating first).
//
//   7. Authorization — enforces [Authorize] attributes on controllers.
//
//   8. Controllers — maps controller actions to routes.
//
// ─────────────────────────────────────────────────────────────────────────────

using GolfFundraiserPro.Api.Common.Extensions;
using GolfFundraiserPro.Api.Common.Middleware;
using GolfFundraiserPro.Api.Data;
using Hangfire;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// ── LOAD ENVIRONMENT VARIABLES ────────────────────────────────────────────────
// Load from .env.local in development. In production, environment variables
// are injected by Railway/Render — no .env file on the server.
//
// DotNetEnv reads .env.local from the working directory.
// This is optional — if the file doesn't exist, it's silently ignored.
// Production servers must have all variables set in their platform config.
if (builder.Environment.IsDevelopment())
{
    // Look for .env.local in the monorepo root (two directories up from apps/api)
    var envFile = Path.Combine(builder.Environment.ContentRootPath, "..", "..", ".env.local");
    if (File.Exists(envFile))
    {
        // Manual .env parser — read each KEY=VALUE line and set as environment variable
        foreach (var line in File.ReadAllLines(envFile))
        {
            if (string.IsNullOrWhiteSpace(line) || line.StartsWith('#')) continue;
            var parts = line.Split('=', 2);
            if (parts.Length == 2)
            {
                Environment.SetEnvironmentVariable(parts[0].Trim(), parts[1].Trim());
            }
        }
    }
}

// ── ADD SERVICES ──────────────────────────────────────────────────────────────
// All service registrations delegated to the extension method.
// See Common/Extensions/ServiceCollectionExtensions.cs for detailed comments.
builder.Services.AddGolfFundraiserPro(builder.Configuration);

// Controllers — enables attribute-based routing on controller classes.
// The API uses the Minimal API style where possible, but some complex
// feature areas (Auth, Events) use controllers for their built-in model binding.
builder.Services.AddControllers()
    .AddJsonOptions(opts =>
    {
        // Serialize/deserialize enums as strings ("Scramble") instead of integers (0).
        // Required so callers can pass human-readable values in request bodies.
        opts.JsonSerializerOptions.Converters.Add(
            new System.Text.Json.Serialization.JsonStringEnumConverter());
    });

// ── BUILD APP ────────────────────────────────────────────────────────────────
var app = builder.Build();

// ── AUTO-MIGRATE IN DEVELOPMENT ───────────────────────────────────────────────
// In Development, apply pending EF Core migrations automatically on startup.
// This means running `dotnet run` after adding a migration will update the DB.
//
// In Production, migrations are applied as part of the CI/CD deploy step
// (NOT automatically at startup — this prevents accidental data loss).
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

    try
    {
        // Apply any pending migrations
        await db.Database.MigrateAsync();
        app.Logger.LogInformation("Database migrations applied successfully.");

        // Verify PostGIS is enabled — catch configuration errors early at startup
        // rather than cryptically failing on the first geography column access.
        var postgisCheck = await db.Database
            .ExecuteSqlRawAsync("SELECT PostGIS_Version()");
        app.Logger.LogInformation("PostGIS verified. Database ready.");
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex,
            "Failed to apply migrations or verify PostGIS. " +
            "Ensure Docker is running: cd infra && docker compose up -d");
        // Don't crash the server — let it start so developers can see the error
        // and diagnose it. Requests will fail with DB errors until fixed.
    }
}

// ── HTTP PIPELINE CONFIGURATION ───────────────────────────────────────────────

// 1. Global exception handler — MUST be first (outermost middleware)
app.UseMiddleware<ExceptionHandlingMiddleware>();

// 2. Swagger UI — only in Development
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(ui =>
    {
        ui.SwaggerEndpoint("/swagger/v1/swagger.json", "Golf Fundraiser Pro API v1");
        // Put Swagger at the root in Development for easy access
        ui.RoutePrefix = "swagger";
    });

    app.Logger.LogInformation("Swagger UI available at: http://localhost:5000/swagger");
}

// 3. HTTPS Redirection — only in Production (local Docker has no TLS)
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

// 4. CORS — before routing and auth
var corsPolicy = app.Environment.IsDevelopment() ? "GfpDevelopment" : "GfpProduction";
app.UseCors(corsPolicy);

// 5. Routing — must come before auth middleware
app.UseRouting();

// 6. Authentication — validates JWT Bearer tokens, sets HttpContext.User
app.UseAuthentication();

// 7. Authorization — enforces [Authorize] attributes
app.UseAuthorization();

// 8. Hangfire Dashboard — only in Development (don't expose job dashboard publicly)
if (app.Environment.IsDevelopment())
{
    app.UseHangfireDashboard("/hangfire", new DashboardOptions
    {
        // In Production, add DashboardOptions.Authorization with an auth filter
        // to prevent public access to the job dashboard.
        Authorization = []
    });
    app.Logger.LogInformation("Hangfire dashboard available at: http://localhost:5000/hangfire");
}

// 9. Map controllers to routes
app.MapControllers();

// ── HEALTH CHECK ENDPOINT ─────────────────────────────────────────────────────
// Simple endpoint for Docker health checks and Railway/Render uptime monitoring.
// Returns 200 OK with the current UTC time so it's easy to verify the API is live.
app.MapGet("/api/health", () => new
{
    status    = "healthy",
    timestamp = DateTime.UtcNow.ToString("O"),
    version   = "Phase 1.0",
    service   = "Golf Fundraiser Pro API"
})
.WithName("HealthCheck")
.WithTags("System")
.AllowAnonymous();

// ── START ─────────────────────────────────────────────────────────────────────
app.Logger.LogInformation(
    "Golf Fundraiser Pro API starting on {Urls}",
    Environment.GetEnvironmentVariable("ASPNETCORE_URLS") ?? "http://localhost:5000");

await app.RunAsync();
