// ─────────────────────────────────────────────────────────────────────────────
// Data/ApplicationDbContext.cs — EF Core Database Context
// ─────────────────────────────────────────────────────────────────────────────
//
// WHY THIS IS THE MOST IMPORTANT FILE IN THE API:
//   ApplicationDbContext is the bridge between C# entity classes and the
//   PostgreSQL database. Everything EF Core does — migrations, queries,
//   inserts, relationship resolution — flows through this class.
//
// THREE RESPONSIBILITIES:
//   1. DbSet<T> properties — one per entity table. EF Core uses these to
//      generate migrations and build LINQ → SQL translations.
//
//   2. OnModelCreating() — fine-grained mapping that EF Core can't infer
//      from attributes alone: composite unique constraints, enum conversions,
//      PostGIS geometry type names, index definitions, and seed data.
//
//   3. Identity integration — extends IdentityDbContext<ApplicationUser> so
//      the ASP.NET Core Identity tables (AspNetUsers, AspNetRoles, etc.) live
//      in the same database and same migration history as the GFP tables.
//
// IDENTITY CHOICE:
//   Only ORGANIZERS have ASP.NET Identity user accounts.
//   Golfers (players) are event-scoped records in the players table — they
//   do NOT have Identity accounts. This keeps sign-up friction low for
//   golfers while giving organizers full auth features (password reset, etc.)
// ─────────────────────────────────────────────────────────────────────────────

using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using GolfFundraiserPro.Api.Domain.Entities;
using GolfFundraiserPro.Api.Domain.Enums;
using GolfFundraiserPro.Api.Features.Auth;

namespace GolfFundraiserPro.Api.Data;

// ─────────────────────────────────────────────────────────────────────────────
// ApplicationUser — extends IdentityUser with GFP-specific properties.
// Represents an event ORGANIZER (not a golfer/player).
// ─────────────────────────────────────────────────────────────────────────────
public class ApplicationUser : IdentityUser
{
    /// <summary>
    /// The organization this user administers.
    /// One user → one organization in Phase 1.
    /// Multi-org support can be added later by changing this to a join table.
    /// </summary>
    public Guid? OrgId { get; set; }

    public Organization? Organization { get; set; }

    /// <summary>Display name shown in the admin dashboard header.</summary>
    public string DisplayName { get; set; } = string.Empty;
}

// ─────────────────────────────────────────────────────────────────────────────
// ApplicationDbContext
// ─────────────────────────────────────────────────────────────────────────────
public class ApplicationDbContext : IdentityDbContext<ApplicationUser>
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options)
    {
    }

    // ── DBSETS — ONE PER TABLE ─────────────────────────────────────────────
    // EF Core uses these to generate migrations and translate LINQ queries.
    // The DbSet name becomes the default table name if not overridden by [Table].

    /// <summary>Non-profit organizations that run events through GFP.</summary>
    public DbSet<Organization> Organizations => Set<Organization>();

    /// <summary>Golf tournament events created by organizers.</summary>
    public DbSet<Event> Events => Set<Event>();

    /// <summary>Golf courses attached to events.</summary>
    public DbSet<Course> Courses => Set<Course>();

    /// <summary>Per-hole metadata for each course (par, yardage, handicap index).</summary>
    public DbSet<CourseHole> CourseHoles => Set<CourseHole>();

    /// <summary>Teams registered for events.</summary>
    public DbSet<Team> Teams => Set<Team>();

    /// <summary>Individual golfers registered for events (event-scoped, not global users).</summary>
    public DbSet<Player> Players => Set<Player>();

    /// <summary>Gross scores submitted per hole per team.</summary>
    public DbSet<Score> Scores => Set<Score>();

    /// <summary>Event sponsors with logo, tier, and placement configuration.</summary>
    public DbSet<Sponsor> Sponsors => Set<Sponsor>();

    /// <summary>On-course contests (closest to pin, longest drive, etc.).</summary>
    public DbSet<HoleChallenge> HoleChallenges => Set<HoleChallenge>();

    /// <summary>Results recorded for hole challenges.</summary>
    public DbSet<ChallengeResult> ChallengeResults => Set<ChallengeResult>();

    /// <summary>Donations recorded for events.</summary>
    public DbSet<Donation> Donations => Set<Donation>();

    /// <summary>Org-branded email templates stored in the database.</summary>
    public DbSet<EmailTemplate> EmailTemplates => Set<EmailTemplate>();

    /// <summary>Pre-generated QR codes included in the Print Kit PDF.</summary>
    public DbSet<QrCode> QrCodes => Set<QrCode>();

    /// <summary>
    /// Refresh tokens for organizer JWT auth.
    /// Stores hashed tokens — never raw values.
    /// See Features/Auth/TokenService.cs for the hashing strategy.
    /// </summary>
    public DbSet<RefreshTokenRecord> RefreshTokens => Set<RefreshTokenRecord>();

    // ── MODEL CONFIGURATION ────────────────────────────────────────────────
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // IMPORTANT: call base first — Identity needs to configure its own tables
        // (AspNetUsers, AspNetRoles, AspNetUserRoles, etc.) before we add our tables.
        base.OnModelCreating(modelBuilder);

        // ── ORGANIZATION ───────────────────────────────────────────────────
        modelBuilder.Entity<Organization>(org =>
        {
            // UUID primary keys are never auto-generated by the DB.
            // The API sets Id = Guid.NewGuid() before inserting.
            // See spec: "UUID primary keys generated by the API (not DB serial)"
            org.Property(o => o.Id).ValueGeneratedNever();

            // slug must be unique across all organizations.
            // Used in public URLs: /e/{slug}/{eventCode}
            org.HasIndex(o => o.Slug).IsUnique();

            // Map the theme JSONB column explicitly (EF Core won't infer jsonb from string)
            org.Property(o => o.ThemeJson).HasColumnType("jsonb");
        });

        // ── EVENT ──────────────────────────────────────────────────────────
        modelBuilder.Entity<Event>(evt =>
        {
            evt.Property(e => e.Id).ValueGeneratedNever();

            // event_code is a random 8-char alphanumeric. Must be globally unique.
            // Indexed for fast QR code lookups (the scanner sends eventCode, not Id).
            evt.HasIndex(e => e.EventCode).IsUnique();

            // Store enum values as their string names, not integers.
            // Rationale: adding a new enum value to C# won't corrupt existing DB rows.
            evt.Property(e => e.Format).HasConversion<string>();
            evt.Property(e => e.StartType).HasConversion<string>();
            evt.Property(e => e.Status).HasConversion<string>();

            // JSONB config column
            evt.Property(e => e.ConfigJson).HasColumnType("jsonb");

            // An event belongs to one org. Deleting an org cascades to events.
            evt.HasOne(e => e.Organization)
               .WithMany(o => o.Events)
               .HasForeignKey(e => e.OrgId)
               .OnDelete(DeleteBehavior.Cascade);

            // An event optionally has a course. No cascade — courses outlive events.
            evt.HasOne(e => e.Course)
               .WithMany()
               .HasForeignKey(e => e.CourseId)
               .IsRequired(false)
               .OnDelete(DeleteBehavior.SetNull);
        });

        // ── COURSE ────────────────────────────────────────────────────────
        modelBuilder.Entity<Course>(course =>
        {
            course.Property(c => c.Id).ValueGeneratedNever();

            // PostGIS GEOGRAPHY column for lat/lon.
            // The column type "geography (point)" maps to GEOGRAPHY(Point,4326) in Postgres.
            // SRID 4326 = WGS-84 (standard GPS coordinates).
            // UseNetTopologySuite() must be called on the Npgsql data source in Program.cs.
            course.Property(c => c.Location)
                  .HasColumnType("geography (point)");
        });

        // ── COURSE HOLE ───────────────────────────────────────────────────
        modelBuilder.Entity<CourseHole>(hole =>
        {
            hole.Property(h => h.Id).ValueGeneratedNever();

            // Phase 6 columns — geography type with Z (elevation) coordinate
            hole.Property(h => h.CupLocation)
                .HasColumnType("geography (pointz)");

            // A hole belongs to a course. Deleting a course deletes its holes.
            hole.HasOne(h => h.Course)
                .WithMany(c => c.Holes)
                .HasForeignKey(h => h.CourseId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ── TEAM ──────────────────────────────────────────────────────────
        modelBuilder.Entity<Team>(team =>
        {
            team.Property(t => t.Id).ValueGeneratedNever();
            team.Property(t => t.CheckInStatus).HasConversion<string>();

            team.HasOne(t => t.Event)
                .WithMany(e => e.Teams)
                .HasForeignKey(t => t.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ── PLAYER ────────────────────────────────────────────────────────
        modelBuilder.Entity<Player>(player =>
        {
            player.Property(p => p.Id).ValueGeneratedNever();
            player.Property(p => p.RegistrationType).HasConversion<string>();
            player.Property(p => p.SkillLevel).HasConversion<string>();
            player.Property(p => p.AgeGroup).HasConversion<string>();
            player.Property(p => p.CheckInStatus).HasConversion<string>();

            // Email must be unique within an event.
            // "UNIQUE per event" from spec — a person can register for multiple events
            // but not twice for the same event.
            // This composite unique constraint prevents duplicate registrations.
            player.HasIndex(p => new { p.EventId, p.Email })
                  .IsUnique()
                  .HasDatabaseName("IX_players_event_id_email_unique");

            // A player belongs to a team (nullable for unassigned free agents)
            player.HasOne(p => p.Team)
                  .WithMany(t => t.Players)
                  .HasForeignKey(p => p.TeamId)
                  .IsRequired(false)
                  .OnDelete(DeleteBehavior.SetNull);

            // A player is event-scoped
            player.HasOne(p => p.Event)
                  .WithMany()
                  .HasForeignKey(p => p.EventId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // ── SCORE ─────────────────────────────────────────────────────────
        modelBuilder.Entity<Score>(score =>
        {
            score.Property(s => s.Id).ValueGeneratedNever();
            score.Property(s => s.Source).HasConversion<string>();
            score.Property(s => s.PlayerShotsJson).HasColumnType("jsonb");

            // Phase 6 GPS columns
            score.Property(s => s.DriveLocation).HasColumnType("geography (point)");
            score.Property(s => s.BallLocation).HasColumnType("geography (point)");

            // Index for fast leaderboard queries: all scores for an event
            score.HasIndex(s => s.EventId)
                 .HasDatabaseName("IX_scores_event_id");

            // Index for fast team scorecard lookups
            score.HasIndex(s => new { s.TeamId, s.HoleNumber })
                 .HasDatabaseName("IX_scores_team_id_hole_number");

            score.HasOne(s => s.Event)
                 .WithMany(e => e.Scores)
                 .HasForeignKey(s => s.EventId)
                 .OnDelete(DeleteBehavior.Cascade);

            score.HasOne(s => s.Team)
                 .WithMany(t => t.Scores)
                 .HasForeignKey(s => s.TeamId)
                 .OnDelete(DeleteBehavior.Cascade);
        });

        // ── SPONSOR ───────────────────────────────────────────────────────
        modelBuilder.Entity<Sponsor>(sponsor =>
        {
            sponsor.Property(s => s.Id).ValueGeneratedNever();
            sponsor.Property(s => s.Tier).HasConversion<string>();
            sponsor.Property(s => s.PlacementsJson).HasColumnType("jsonb");

            sponsor.HasOne(s => s.Event)
                   .WithMany(e => e.Sponsors)
                   .HasForeignKey(s => s.EventId)
                   .OnDelete(DeleteBehavior.Cascade);
        });

        // ── HOLE CHALLENGE ────────────────────────────────────────────────
        modelBuilder.Entity<HoleChallenge>(challenge =>
        {
            challenge.Property(c => c.Id).ValueGeneratedNever();
            challenge.Property(c => c.ChallengeType).HasConversion<string>();

            challenge.HasOne(c => c.Event)
                     .WithMany(e => e.HoleChallenges)
                     .HasForeignKey(c => c.EventId)
                     .OnDelete(DeleteBehavior.Cascade);

            // Sponsor is optional — challenges can have prizes without a named sponsor
            challenge.HasOne(c => c.Sponsor)
                     .WithMany()
                     .HasForeignKey(c => c.SponsorId)
                     .IsRequired(false)
                     .OnDelete(DeleteBehavior.SetNull);
        });

        // ── CHALLENGE RESULT ──────────────────────────────────────────────
        modelBuilder.Entity<ChallengeResult>(result =>
        {
            result.Property(r => r.Id).ValueGeneratedNever();

            result.HasOne(r => r.Challenge)
                  .WithMany(c => c.Results)
                  .HasForeignKey(r => r.ChallengeId)
                  .OnDelete(DeleteBehavior.Cascade);

            result.HasOne(r => r.Team)
                  .WithMany()
                  .HasForeignKey(r => r.TeamId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        // ── DONATION ──────────────────────────────────────────────────────
        modelBuilder.Entity<Donation>(donation =>
        {
            donation.Property(d => d.Id).ValueGeneratedNever();

            donation.HasOne(d => d.Event)
                    .WithMany(e => e.Donations)
                    .HasForeignKey(d => d.EventId)
                    .OnDelete(DeleteBehavior.Cascade);
        });

        // ── EMAIL TEMPLATE ────────────────────────────────────────────────
        modelBuilder.Entity<EmailTemplate>(template =>
        {
            template.Property(t => t.Id).ValueGeneratedNever();
            template.Property(t => t.TriggerType).HasConversion<string>();

            template.HasOne(t => t.Organization)
                    .WithMany(o => o.EmailTemplates)
                    .HasForeignKey(t => t.OrgId)
                    .OnDelete(DeleteBehavior.Cascade);
        });

        // ── QR CODE ───────────────────────────────────────────────────────
        modelBuilder.Entity<QrCode>(qr =>
        {
            qr.Property(q => q.Id).ValueGeneratedNever();
            qr.Property(q => q.QrType).HasConversion<string>();

            qr.HasOne(q => q.Event)
              .WithMany(e => e.QrCodes)
              .HasForeignKey(q => q.EventId)
              .OnDelete(DeleteBehavior.Cascade);
        });

        // ── REFRESH TOKEN ─────────────────────────────────────────────────
        modelBuilder.Entity<RefreshTokenRecord>(rt =>
        {
            rt.ToTable("refresh_tokens");
            rt.Property(r => r.Id).ValueGeneratedNever();

            // Index on UserId for fast "find all tokens for this user" queries
            // (needed for RevokeAllUserTokensAsync on password change)
            rt.HasIndex(r => r.UserId)
              .HasDatabaseName("IX_refresh_tokens_user_id");

            // Index on Token for fast lookup during validation
            // (called on every access token refresh — must be fast)
            rt.HasIndex(r => r.Token)
              .HasDatabaseName("IX_refresh_tokens_token");

            // A refresh token belongs to one ApplicationUser (organizer)
            rt.HasOne(r => r.User)
              .WithMany()
              .HasForeignKey(r => r.UserId)
              .OnDelete(DeleteBehavior.Cascade);
        });

        // ── APPLICATION USER (additional config) ──────────────────────────
        modelBuilder.Entity<ApplicationUser>(user =>
        {
            user.HasOne(u => u.Organization)
                .WithMany()
                .HasForeignKey(u => u.OrgId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // ── SEED DATA ──────────────────────────────────────────────────────
        ConfigureSeedData(modelBuilder);
    }

    private static void ConfigureSeedData(ModelBuilder modelBuilder)
    {
        // Deterministic GUIDs for seed data so migrations are idempotent.
        // Using Guid.Parse with fixed strings ensures the same ID every time
        // the migration runs (important for FK references in later seed entries).
        var demoOrgId = Guid.Parse("00000000-0000-0000-0000-000000000001");

        modelBuilder.Entity<Organization>().HasData(new Organization
        {
            Id               = demoOrgId,
            Name             = "Clear Lake High School Boosters",
            Slug             = "clhs",
            LogoUrl          = null,
            // null theme = ECO_GREEN_DEFAULT applied at the theme service layer
            ThemeJson        = null,
            MissionStatement = "Supporting excellence in Clear Lake High School extracurricular programs.",
            Is501c3          = true,
            CreatedAt        = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc),
        });
    }
}
