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
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Features.Auth;
using GolfFundraiserPro.Api.Hubs;
using Hangfire;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

// ── LOAD ENVIRONMENT VARIABLES ────────────────────────────────────────────────
// Must happen BEFORE WebApplication.CreateBuilder so that IConfiguration picks
// up the values. CreateBuilder snapshots environment variables at call time —
// any Environment.SetEnvironmentVariable calls made after that point are not
// visible to configuration["KEY"] lookups.
//
// In production, variables are injected by Railway/Render — no .env file.
var aspnetEnv = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";
if (string.Equals(aspnetEnv, "Development", StringComparison.OrdinalIgnoreCase))
{
    // Look for .env.local two directories up from apps/api (the monorepo root).
    var envFile = Path.Combine(Directory.GetCurrentDirectory(), "..", "..", ".env.local");
    if (File.Exists(envFile))
    {
        foreach (var line in File.ReadAllLines(envFile))
        {
            if (string.IsNullOrWhiteSpace(line) || line.StartsWith('#')) continue;
            var parts = line.Split('=', 2);
            if (parts.Length == 2)
                Environment.SetEnvironmentVariable(parts[0].Trim(), parts[1].Trim());
        }
    }
}

// QuestPDF community license (free for non-commercial / small commercial use)
QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

var builder = WebApplication.CreateBuilder(args);

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

    // Seed super admin account from environment config (idempotent — safe to run every startup)
    try { await SeedSuperAdminAsync(scope.ServiceProvider); }
    catch (Exception ex) { app.Logger.LogError(ex, "Super admin seeding failed."); }
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

// 5. Static files — serves wwwroot/uploads/* for uploaded logos
app.UseStaticFiles();

// 6. Routing — must come before auth middleware
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

// 9. Register Hangfire recurring jobs
RecurringJob.AddOrUpdate<GolfFundraiserPro.Api.Features.Auction.AuctionCloseJob>(
    "auction-close",
    job => job.RunAsync(),
    "*/10 * * * * *"); // every 10 seconds (Hangfire Cron seconds expression)

// 9b. Map controllers to routes
app.MapControllers();

// 10. SignalR hub — clients connect and call JoinEvent(eventCode) to subscribe
app.MapHub<TournamentHub>("/hubs/tournament");

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

// ── SUPER ADMIN SEED ──────────────────────────────────────────────────────────
// Creates a SuperAdmin account from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD env vars.
// Safe to run on every startup — exits early if the account already exists.
static async Task SeedSuperAdminAsync(IServiceProvider services)
{
    var config   = services.GetRequiredService<IConfiguration>();
    var email    = config["SUPER_ADMIN_EMAIL"];
    var password = config["SUPER_ADMIN_PASSWORD"];
    var name     = config["SUPER_ADMIN_NAME"] ?? "Platform Admin";

    if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password)) return;

    var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
    var roleManager = services.GetRequiredService<RoleManager<IdentityRole>>();
    var db          = services.GetRequiredService<ApplicationDbContext>();
    var logger      = services.GetRequiredService<ILoggerFactory>()
                              .CreateLogger("SuperAdminSeed");

    // Ensure SuperAdmin role exists
    if (!await roleManager.RoleExistsAsync(AuthService.RoleSuperAdmin))
        await roleManager.CreateAsync(new IdentityRole(AuthService.RoleSuperAdmin));

    // Idempotent — don't recreate if already exists
    if (await userManager.FindByEmailAsync(email) is not null) return;

    // Create a private platform org (filtered out of all super-admin queries)
    const string platformSlug = "gfp-platform-admin";
    var platformOrg = await db.Organizations.FirstOrDefaultAsync(o => o.Slug == platformSlug);
    if (platformOrg is null)
    {
        platformOrg = new Organization
        {
            Id        = Guid.NewGuid(),
            Name      = "GFP Platform Admin",
            Slug      = platformSlug,
            Is501c3   = false,
            CreatedAt = DateTime.UtcNow,
        };
        db.Organizations.Add(platformOrg);
        await db.SaveChangesAsync();
    }

    var user = new ApplicationUser
    {
        UserName       = email,
        Email          = email,
        DisplayName    = name,
        OrgId          = platformOrg.Id,
        EmailConfirmed = true,
    };

    var result = await userManager.CreateAsync(user, password);
    if (result.Succeeded)
    {
        await userManager.AddToRoleAsync(user, AuthService.RoleSuperAdmin);
        logger.LogInformation("Super admin seeded: {Email}", email);
    }
    else
    {
        logger.LogWarning("Super admin seed failed: {Errors}",
            string.Join(", ", result.Errors.Select(e => e.Description)));
    }
}
