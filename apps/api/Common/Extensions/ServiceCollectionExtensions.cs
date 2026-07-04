// ─────────────────────────────────────────────────────────────────────────────
// Common/Extensions/ServiceCollectionExtensions.cs
// ─────────────────────────────────────────────────────────────────────────────
//
// WHY THIS FILE EXISTS:
//   ASP.NET Core's dependency injection container is configured in Program.cs.
//   If all registrations live directly in Program.cs, it becomes hundreds of
//   lines long and hard to navigate. This extension method groups related
//   registrations together and keeps Program.cs clean and readable.
//
// USAGE IN Program.cs:
//   builder.Services.AddGolfFundraiserPro(builder.Configuration);
//
// PATTERN: "AddXxx" extension methods on IServiceCollection is the standard
//   ASP.NET Core pattern — it's exactly how AddAuthentication(), AddDbContext(),
//   and AddIdentity() work internally.
// ─────────────────────────────────────────────────────────────────────────────

using System.Text;
using System.Threading.RateLimiting;
using FluentValidation;
using FluentValidation.AspNetCore;
using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using StackExchange.Redis;
using GolfFundraiserPro.Api.Data;
using GolfFundraiserPro.Api.Hubs;

namespace GolfFundraiserPro.Api.Common.Extensions;

public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registers all Golf Fundraiser Pro application services.
    /// Called once in Program.cs: builder.Services.AddGolfFundraiserPro(config)
    /// </summary>
    public static IServiceCollection AddGolfFundraiserPro(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services
            .AddGfpDatabase(configuration)
            .AddGfpIdentityAndAuth(configuration)
            .AddGfpRealTime(configuration)
            .AddGfpBackgroundJobs(configuration)
            .AddGfpValidation()
            .AddGfpCors()
            .AddGfpRateLimiting()
            .AddGfpSwagger();

        // HTTP client factory used by PushNotificationService and EmailBuilderService
        services.AddHttpClient();

        // Response compression — leaderboard/public-event JSON is polled by many
        // clients and compresses ~5-10×. EnableForHttps is required for it to do
        // anything in production (BREACH concerns don't apply here: responses
        // don't interleave secrets with attacker-reflected input).
        services.AddResponseCompression(opts =>
        {
            opts.EnableForHttps = true;
            opts.Providers.Add<Microsoft.AspNetCore.ResponseCompression.BrotliCompressionProvider>();
            opts.Providers.Add<Microsoft.AspNetCore.ResponseCompression.GzipCompressionProvider>();
        });

        return services;
    }

    // ── DATABASE ──────────────────────────────────────────────────────────────
    private static IServiceCollection AddGfpDatabase(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = ToNpgsqlConnectionString(
            configuration["DATABASE_URL"]
            ?? throw new InvalidOperationException(
                "DATABASE_URL environment variable is not set. " +
                "Copy .env.example to .env.local and fill in the value."));

        services.AddDbContext<ApplicationDbContext>(options =>
        {
            options.UseNpgsql(
                connectionString,
                npgsql =>
                {
                    // UseNetTopologySuite() tells Npgsql to map GEOGRAPHY columns
                    // to NetTopologySuite.Geometries.Point (and other geometry types).
                    // Without this call, EF Core cannot handle any GEOGRAPHY column
                    // and migrations for courses.location would fail.
                    npgsql.UseNetTopologySuite();

                    // MigrationsAssembly — ensures EF Core looks for Migration classes
                    // in this assembly (not in Npgsql's assembly).
                    // Required when the DbContext is in a different assembly from migrations.
                    npgsql.MigrationsAssembly("GolfFundraiserPro.Api");
                }
            );

            // In development, log all generated SQL queries to the console.
            // Helps developers see exactly what LINQ is being translated to,
            // making it easy to spot N+1 query problems early.
            if (Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Development")
            {
                options.EnableSensitiveDataLogging();
                options.LogTo(Console.WriteLine, LogLevel.Information);
            }
        });

        return services;
    }

    // ── IDENTITY + JWT AUTH ───────────────────────────────────────────────────
    private static IServiceCollection AddGfpIdentityAndAuth(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // ── ASP.NET CORE IDENTITY ─────────────────────────────────────────
        // Identity manages organizer user accounts: password hashing, user store,
        // email confirmation tokens, role management.
        services.AddIdentity<ApplicationUser, IdentityRole>(options =>
        {
            // Password policy — reasonably strict but not punishing.
            options.Password.RequireDigit           = true;
            options.Password.RequireLowercase       = true;
            options.Password.RequireUppercase       = false; // don't force SHIFT key
            options.Password.RequireNonAlphanumeric = false;
            options.Password.RequiredLength          = 8;

            // Lockout — lock account after 5 failed attempts for 5 minutes.
            // Prevents brute force on organizer accounts.
            options.Lockout.DefaultLockoutTimeSpan  = TimeSpan.FromMinutes(5);
            options.Lockout.MaxFailedAccessAttempts = 5;
            options.Lockout.AllowedForNewUsers      = true;

            // Require unique email addresses across all organizer accounts.
            options.User.RequireUniqueEmail = true;
        })
        .AddEntityFrameworkStores<ApplicationDbContext>()
        .AddDefaultTokenProviders();

        // ── APPLICATION SERVICES ──────────────────────────────────────────
        // Scoped = one instance per HTTP request.
        // All services depend on ApplicationDbContext which is also scoped.
        services.AddScoped<Features.Auth.TokenService>();
        services.AddScoped<Features.Auth.AuthService>();
        services.AddScoped<Features.Events.EventService>();
        services.AddScoped<Features.Events.TestDataService>();

        // Brand-from-website extraction. The synthesizer is the one swappable step:
        // the heuristic (no-key) implementation is registered today; an AI version
        // can replace this single line later without touching the fetch/parse
        // pipeline. The fetch uses a dedicated SSRF-guarded HttpClient that
        // validates the resolved IP at connect time (blocks loopback/private/
        // link-local/metadata) on every hop, with bounded redirects + timeouts.
        services.AddScoped<Features.Events.Branding.IBrandPaletteSynthesizer,
                           Features.Events.Branding.HeuristicBrandPaletteSynthesizer>();
        services.AddScoped<Features.Events.Branding.BrandExtractionService>();
        services.AddHttpClient("brand-extract")
            .ConfigureHttpClient(c =>
            {
                c.Timeout = TimeSpan.FromSeconds(10);
                c.MaxResponseContentBufferSize = 4 * 1024 * 1024;
                c.DefaultRequestHeaders.UserAgent.ParseAdd("GolfFundraiserPro-BrandBot/1.0");
            })
            .ConfigurePrimaryHttpMessageHandler(() => new System.Net.Http.SocketsHttpHandler
            {
                AllowAutoRedirect        = true,
                MaxAutomaticRedirections = 3,
                AutomaticDecompression   = System.Net.DecompressionMethods.All,
                ConnectTimeout           = TimeSpan.FromSeconds(5),
                ConnectCallback          = Features.Events.Branding.PrivateNetworkGuard.GuardedConnectAsync,
            });
        services.AddScoped<Features.Teams.TeamService>();
        services.AddScoped<Features.Players.PlayerService>();
        services.AddScoped<Features.Scores.ScoreService>();
        services.AddScoped<Features.Sponsors.SponsorService>();
        services.AddScoped<Features.QR.QrService>();
        services.AddScoped<Features.Emails.EmailService>();
        services.AddScoped<Features.Mobile.MobileService>();
        services.AddScoped<Features.RealTime.IRealTimeService, Features.RealTime.RealTimeService>();
        services.AddScoped<Features.RealTime.RealTimeService>();

        // Leaderboard infra — singletons own per-event coalescing state and the
        // Redis read-through cache. See Features/Events/Leaderboard/.
        services.AddSingleton<Features.Events.Leaderboard.LeaderboardCache>();
        services.AddSingleton<Features.Events.Leaderboard.LeaderboardBroadcaster>();
        services.AddScoped<Features.Notifications.PushNotificationService>();
        services.AddScoped<Features.EmailBuilder.EmailBuilderService>();

        services.AddScoped<Features.Orgs.OrgService>();

        // Phase 4: Payments + Auction
        services.AddScoped<Features.Payments.PaymentsService>();
        services.AddScoped<Features.Auction.AuctionService>();
        services.AddScoped<Features.Auction.AuctionCloseJob>();

        // Phase 5: League Play
        services.AddScoped<Features.League.HandicapEngine>();
        services.AddScoped<Features.League.StandingsCalculator>();
        services.AddScoped<Features.League.SkinsCalculator>();
        services.AddScoped<Features.League.PairingEngine>();
        services.AddScoped<Features.League.LeagueService>();

        // ── JWT BEARER AUTHENTICATION ─────────────────────────────────────
        // Configures the middleware to validate JWT Bearer tokens on protected endpoints.
        // The token is expected in the Authorization header: "Bearer <token>"
        var jwtSecret = configuration["JWT_SECRET"]
            ?? throw new InvalidOperationException(
                "JWT_SECRET is not set. Run `openssl rand -hex 64` and add to .env.local");

        var jwtKey = Encoding.UTF8.GetBytes(jwtSecret);

        // HMAC-SHA256 signing keys must be at least 256 bits (32 bytes). A shorter
        // secret materially weakens token signatures (and SymmetricSecurityKey will
        // happily accept one), so refuse to start with an undersized key.
        if (jwtKey.Length < 32)
            throw new InvalidOperationException(
                $"JWT_SECRET is too short ({jwtKey.Length} bytes). Use at least 32 bytes "
                + "(256 bits) — e.g. `openssl rand -hex 64`.");

        services
            .AddAuthentication(options =>
            {
                // Default scheme for [Authorize] attributes = JWT Bearer
                options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme    = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    // Validate that the token was signed with our secret key.
                    // If the secret is compromised, rotate it immediately.
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey         = new SymmetricSecurityKey(jwtKey),

                    // In Phase 1 with a single API server, issuer/audience validation
                    // adds overhead without much security benefit. Enable in Phase 3+
                    // when the API scales to multiple instances.
                    ValidateIssuer   = false,
                    ValidateAudience = false,

                    // Validate that the token hasn't expired.
                    // Access tokens expire after 15 minutes (spec Foundation §5.1).
                    ValidateLifetime = true,

                    // Zero clock skew — tokens expire exactly at their expiry time.
                    // A positive ClockSkew would allow tokens to be valid for longer
                    // than intended, which is a security risk.
                    ClockSkew = TimeSpan.Zero,
                };

                // Support JWT tokens in SignalR query strings (Phase 3).
                // SignalR WebSocket connections can't set Authorization headers,
                // so the token is passed as ?access_token=... in the query string.
                options.Events = new JwtBearerEvents
                {
                    OnMessageReceived = context =>
                    {
                        var accessToken = context.Request.Query["access_token"];
                        var path = context.HttpContext.Request.Path;
                        if (!string.IsNullOrEmpty(accessToken) &&
                            path.StartsWithSegments("/hubs"))
                        {
                            context.Token = accessToken;
                        }
                        return Task.CompletedTask;
                    }
                };
            });

        // Authorization policies matching the role system from spec Foundation §5.3
        services.AddAuthorizationBuilder()
            .AddPolicy("OrgAdmin", policy => policy.RequireRole("OrgAdmin"))
            .AddPolicy("EventStaff", policy => policy.RequireRole("OrgAdmin", "EventStaff"))
            .AddPolicy("Golfer", policy => policy.RequireRole("OrgAdmin", "EventStaff", "Golfer"));

        return services;
    }

    // ── SIGNALR + REDIS ───────────────────────────────────────────────────────
    private static IServiceCollection AddGfpRealTime(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var redisUrl = configuration["REDIS_URL"];

        if (!string.IsNullOrWhiteSpace(redisUrl))
        {
            // Normalize redis:// URI → host:port format expected by StackExchange.Redis
            var connStr = redisUrl.StartsWith("redis://", StringComparison.OrdinalIgnoreCase)
                ? redisUrl["redis://".Length..]
                : redisUrl;

            // IConnectionMultiplexer is a singleton — one connection shared app-wide
            services.AddSingleton<IConnectionMultiplexer>(
                _ => ConnectionMultiplexer.Connect(connStr));

            // Redis SignalR backplane — required when running multiple API instances
            services.AddSignalR().AddStackExchangeRedis(connStr);
        }
        else
        {
            // Without Redis, the leaderboard cache and the SignalR backplane
            // silently no-op — every spectator poll then hits Postgres directly
            // and multi-instance SignalR breaks. That's fine in local dev but
            // load-bearing at tournament scale, so Production fails fast unless
            // the operator explicitly opts into single-instance/no-cache mode.
            var env = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";
            var allowNoRedis = string.Equals(
                configuration["GFP_ALLOW_NO_REDIS"], "true", StringComparison.OrdinalIgnoreCase);
            if (string.Equals(env, "Production", StringComparison.OrdinalIgnoreCase) && !allowNoRedis)
                throw new InvalidOperationException(
                    "REDIS_URL is not set. Redis provides the leaderboard burst cache and the " +
                    "SignalR backplane, both load-bearing under tournament load. Set REDIS_URL, " +
                    "or set GFP_ALLOW_NO_REDIS=true to accept single-instance/no-cache operation.");

            // No Redis configured (local dev without Docker Redis) — in-memory SignalR only
            services.AddSignalR();
        }

        return services;
    }

    // ── BACKGROUND JOBS ───────────────────────────────────────────────────────
    private static IServiceCollection AddGfpBackgroundJobs(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Hangfire uses the same PostgreSQL database as the main application.
        // It creates its own schema ("hangfire") automatically on first run.
        // This is simpler than running a separate Redis job queue for Phase 1.
        //
        // Jobs registered:
        //   • 24-hour reminder emails (scheduled relative to event.start_at)
        //   • Thank-you email dispatch (triggered when event → Completed)
        var connectionString = ToNpgsqlConnectionString(
            configuration["DATABASE_URL"]
            ?? throw new InvalidOperationException("DATABASE_URL not set"));

        services.AddHangfire(hangfire => hangfire
            .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(opts => opts.UseNpgsqlConnection(connectionString)));

        // Phase 3: increased to 5 workers to handle push notification jobs alongside email jobs.
        services.AddHangfireServer(options =>
        {
            options.WorkerCount = 5;
            options.Queues      = ["emails", "notifications", "default"];
        });

        return services;
    }

    // ── FLUENT VALIDATION ─────────────────────────────────────────────────────
    private static IServiceCollection AddGfpValidation(
        this IServiceCollection services)
    {
        // Auto-discovers all IValidator<T> implementations in this assembly.
        // Each feature folder (Features/Events/, Features/Teams/, etc.) will
        // contain its own validator classes. FluentValidation finds them all.
        //
        // Returns VALIDATION_ERROR (400) with field-level errors when validation fails.
        // Matches the error format in spec Foundation §10.1.
        services.AddFluentValidationAutoValidation();
        services.AddValidatorsFromAssemblyContaining<ApplicationDbContext>();

        return services;
    }

    // ── CORS ──────────────────────────────────────────────────────────────────
    private static IServiceCollection AddGfpCors(
        this IServiceCollection services)
    {
        services.AddCors(options =>
        {
            options.AddPolicy("GfpDevelopment", policy =>
            {
                // Development: allow all origins so the local dev servers
                // (localhost:3000 Next.js, localhost:8081 Expo admin) can reach the API.
                // Production: replace with explicit origin allowlist.
                policy
                    .WithOrigins(
                        "http://localhost:3000",  // Next.js web
                        "http://localhost:8081",  // Expo Router admin
                        "http://localhost:8082",  // Expo Router admin (alt port)
                        "http://localhost:8083",  // Expo Router admin (alt port)
                        "http://localhost:8084",  // Expo Router admin (alt port)
                        "http://localhost:8085",  // Expo Router admin (alt port)
                        "http://localhost:8080")  // nginx reverse proxy
                    .AllowAnyMethod()
                    .AllowAnyHeader()
                    .AllowCredentials(); // needed for httpOnly cookie refresh token
            });

            options.AddPolicy("GfpProduction", policy =>
            {
                // Production: lock down to known domains.
                // Update these when production domains are known.
                policy
                    .WithOrigins(
                        "https://golffundraiser.pro",
                        "https://admin.golffundraiser.pro")
                    .AllowAnyMethod()
                    .AllowAnyHeader()
                    .AllowCredentials();
            });
        });

        return services;
    }

    // ── RATE LIMITING ─────────────────────────────────────────────────────────
    // Built-in .NET rate limiter (no extra package). A generous per-client GLOBAL
    // limiter backstops every endpoint against floods, plus stricter named
    // policies on the anonymous credential / public-write endpoints that were
    // previously unthrottled (login brute force, join email-enumeration, donate
    // and score-sync flooding).
    //
    // NOTE on shared NAT: at a live event 100+ devices poll from ONE venue IP,
    // so a single per-IP bucket would throttle a busy tournament (especially
    // when SignalR falls back to HTTP polling). The global limiter is therefore
    // a CHAIN: a high per-IP ceiling (bounds any single source, including an
    // attacker rotating device headers) plus a per-device fairness bucket keyed
    // by the mobile scorer's X-GFP-Device header. The security policies below
    // (auth/join/donate) stay strictly IP-keyed — their key must never be
    // client-controllable or the brute-force limits could be bypassed.
    private static IServiceCollection AddGfpRateLimiting(this IServiceCollection services)
    {
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            // Global anti-flood backstop: per-IP ceiling AND per-device bucket.
            options.GlobalLimiter = PartitionedRateLimiter.CreateChained(
                PartitionedRateLimiter.Create<HttpContext, string>(http =>
                    RateLimitPartition.GetSlidingWindowLimiter(
                        IpKey(http),
                        _ => new SlidingWindowRateLimiterOptions
                        {
                            // Sized for a full venue NAT: ~150 devices × ~15 req/min
                            // worst case (SignalR down, all fallback polls active).
                            PermitLimit       = 3000,
                            Window            = TimeSpan.FromMinutes(1),
                            SegmentsPerWindow = 6,
                            QueueLimit        = 0,
                        })),
                PartitionedRateLimiter.Create<HttpContext, string>(http =>
                    RateLimitPartition.GetSlidingWindowLimiter(
                        DeviceOrIpKey(http),
                        _ => new SlidingWindowRateLimiterOptions
                        {
                            PermitLimit       = 600,
                            Window            = TimeSpan.FromMinutes(1),
                            SegmentsPerWindow = 6,
                            QueueLimit        = 0,
                        })));

            // Credentials: login / register / refresh — slow brute force.
            options.AddPolicy("auth", http =>
                RateLimitPartition.GetFixedWindowLimiter(
                    IpKey(http),
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 20,
                        Window      = TimeSpan.FromMinutes(1),
                        QueueLimit  = 0,
                    }));

            // Event join — slows email enumeration without blocking venue arrivals.
            options.AddPolicy("join", http =>
                RateLimitPartition.GetFixedWindowLimiter(
                    IpKey(http),
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 60,
                        Window      = TimeSpan.FromMinutes(1),
                        QueueLimit  = 0,
                    }));

            // Public donation submit — curbs fake-donation flooding.
            options.AddPolicy("donate", http =>
                RateLimitPartition.GetFixedWindowLimiter(
                    IpKey(http),
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 30,
                        Window      = TimeSpan.FromMinutes(1),
                        QueueLimit  = 0,
                    }));

            // Brand-from-website extraction — bounds outbound-fetch abuse (SSRF
            // probing, cost) on the org-admin branding endpoint.
            options.AddPolicy("brandExtract", http =>
                RateLimitPartition.GetFixedWindowLimiter(
                    IpKey(http),
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 10,
                        Window      = TimeSpan.FromMinutes(1),
                        QueueLimit  = 0,
                    }));
        });

        return services;
    }

    // Partition key for rate limiting: the client's IP. Behind a PaaS load
    // balancer the socket IP is the proxy, so prefer the platform-set
    // X-Forwarded-For (leftmost hop = original client). For strict anti-spoofing
    // behind a proxy, configure ForwardedHeaders with known proxies/networks.
    // Per-IP partition key. Used for the security policies (auth/join/donate/
    // brandExtract) — where the key must NOT be client-controllable — and as
    // the outer ceiling of the chained global limiter.
    private static string IpKey(HttpContext http)
    {
        var forwarded = http.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwarded))
            return forwarded.Split(',')[0].Trim();
        return http.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }

    // Fairness key for the global limiter: the mobile scorer sends a stable
    // install id in X-GFP-Device, so 100+ devices behind one venue NAT IP get
    // one bucket EACH instead of sharing the IP bucket. The header is client-
    // controllable, which is only safe because the chained per-IP ceiling
    // still bounds total traffic from any single source.
    private static string DeviceOrIpKey(HttpContext http)
    {
        var device = http.Request.Headers["X-GFP-Device"].ToString();
        if (!string.IsNullOrWhiteSpace(device))
            return "dev:" + (device.Length <= 64 ? device : device[..64]);
        return "ip:" + IpKey(http);
    }

    // ── SWAGGER ───────────────────────────────────────────────────────────────
    private static IServiceCollection AddGfpSwagger(
        this IServiceCollection services)
    {
        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen(swagger =>
        {
            swagger.SwaggerDoc("v1", new()
            {
                Title       = "Golf Fundraiser Pro API",
                Version     = "v1",
                Description = "Golf Scramble Made Easy — Phase 1: Admin-Run Tournament",
            });

            // Add JWT Bearer auth to Swagger UI so developers can authenticate
            // and test protected endpoints directly from the browser.
            swagger.AddSecurityDefinition("Bearer", new()
            {
                Name         = "Authorization",
                Type         = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
                Scheme       = "bearer",
                BearerFormat = "JWT",
                In           = Microsoft.OpenApi.Models.ParameterLocation.Header,
                Description  = "Enter your JWT access token. Get one via POST /api/v1/auth/login",
            });

            swagger.AddSecurityRequirement(new()
            {
                {
                    new Microsoft.OpenApi.Models.OpenApiSecurityScheme
                    {
                        Reference = new() { Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme, Id = "Bearer" }
                    },
                    Array.Empty<string>()
                }
            });
        });

        return services;
    }

    // ── HELPERS ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Converts a postgresql:// URI to an Npgsql ADO.NET connection string.
    /// Npgsql does not accept URI-format connection strings; platforms like
    /// Railway and Heroku provide DATABASE_URL in URI format.
    /// </summary>
    private static string ToNpgsqlConnectionString(string raw)
    {
        if (!raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase) &&
            !raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase))
            return raw; // already in key=value format

        var uri      = new Uri(raw);
        var userInfo = uri.UserInfo.Split(':', 2);
        var username = userInfo.Length > 0 ? Uri.UnescapeDataString(userInfo[0]) : string.Empty;
        var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty;
        var host     = uri.Host;
        var port     = uri.Port > 0 ? uri.Port : 5432;
        var database = uri.AbsolutePath.TrimStart('/');

        return $"Host={host};Port={port};Database={database};Username={username};Password={password}";
    }
}
