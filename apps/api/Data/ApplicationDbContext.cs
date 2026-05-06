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

    // ── Phase 4: Payments + Auction ────────────────────────────────────────
    public DbSet<StripeCustomer> StripeCustomers => Set<StripeCustomer>();
    public DbSet<AuctionItem> AuctionItems => Set<AuctionItem>();
    public DbSet<Bid> Bids => Set<Bid>();
    public DbSet<AuctionWinner> AuctionWinners => Set<AuctionWinner>();
    public DbSet<AuctionSession> AuctionSessions => Set<AuctionSession>();

    // ── Phase 5: League Play + Handicaps ──────────────────────────────────
    public DbSet<League> Leagues => Set<League>();
    public DbSet<Season> Seasons => Set<Season>();
    public DbSet<Flight> Flights => Set<Flight>();
    public DbSet<LeagueMember> LeagueMembers => Set<LeagueMember>();
    public DbSet<LeagueRound> LeagueRounds => Set<LeagueRound>();
    public DbSet<LeaguePairing> LeaguePairings => Set<LeaguePairing>();
    public DbSet<LeagueScore> LeagueScores => Set<LeagueScore>();
    public DbSet<HandicapHistory> HandicapHistories => Set<HandicapHistory>();
    public DbSet<Standing> Standings => Set<Standing>();
    public DbSet<Skin> Skins => Set<Skin>();

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

        // ── STRIPE CUSTOMER ───────────────────────────────────────────────
        modelBuilder.Entity<StripeCustomer>(sc =>
        {
            sc.Property(s => s.Id).ValueGeneratedNever();

            sc.HasIndex(s => s.PlayerId).IsUnique()
              .HasDatabaseName("IX_stripe_customers_player_id_unique");

            sc.HasOne(s => s.Player)
              .WithMany()
              .HasForeignKey(s => s.PlayerId)
              .OnDelete(DeleteBehavior.Cascade);
        });

        // ── AUCTION ITEM ──────────────────────────────────────────────────
        modelBuilder.Entity<AuctionItem>(item =>
        {
            item.Property(i => i.Id).ValueGeneratedNever();
            item.Property(i => i.AuctionType).HasConversion<string>();
            item.Property(i => i.Status).HasConversion<string>();
            item.Property(i => i.PhotoUrlsJson).HasColumnType("jsonb");
            item.Property(i => i.DonationDenominationsJson).HasColumnType("jsonb");

            item.HasIndex(i => i.EventId)
                .HasDatabaseName("IX_auction_items_event_id");

            item.HasOne(i => i.Event)
                .WithMany()
                .HasForeignKey(i => i.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ── BID ───────────────────────────────────────────────────────────
        modelBuilder.Entity<Bid>(bid =>
        {
            bid.Property(b => b.Id).ValueGeneratedNever();

            bid.HasIndex(b => b.AuctionItemId)
               .HasDatabaseName("IX_bids_auction_item_id");

            bid.HasOne(b => b.AuctionItem)
               .WithMany(i => i.Bids)
               .HasForeignKey(b => b.AuctionItemId)
               .OnDelete(DeleteBehavior.Cascade);

            bid.HasOne(b => b.Player)
               .WithMany()
               .HasForeignKey(b => b.PlayerId)
               .OnDelete(DeleteBehavior.Restrict);
        });

        // ── AUCTION WINNER ────────────────────────────────────────────────
        modelBuilder.Entity<AuctionWinner>(winner =>
        {
            winner.Property(w => w.Id).ValueGeneratedNever();
            winner.Property(w => w.ChargeStatus).HasConversion<string>();

            winner.HasIndex(w => w.AuctionItemId)
                  .HasDatabaseName("IX_auction_winners_auction_item_id");

            winner.HasOne(w => w.AuctionItem)
                  .WithMany(i => i.Winners)
                  .HasForeignKey(w => w.AuctionItemId)
                  .OnDelete(DeleteBehavior.Cascade);

            winner.HasOne(w => w.Player)
                  .WithMany()
                  .HasForeignKey(w => w.PlayerId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        // ── AUCTION SESSION ────────────────────────────────────────────────
        modelBuilder.Entity<AuctionSession>(session =>
        {
            session.Property(s => s.Id).ValueGeneratedNever();

            session.HasIndex(s => s.EventId)
                   .HasDatabaseName("IX_auction_sessions_event_id");

            session.HasOne(s => s.Event)
                   .WithMany()
                   .HasForeignKey(s => s.EventId)
                   .OnDelete(DeleteBehavior.Cascade);

            session.HasOne(s => s.CurrentItem)
                   .WithMany()
                   .HasForeignKey(s => s.CurrentItemId)
                   .IsRequired(false)
                   .OnDelete(DeleteBehavior.SetNull);
        });

        // ── PHASE 5: LEAGUE + SEASON ──────────────────────────────────────
        modelBuilder.Entity<League>(league =>
        {
            league.Property(l => l.Id).ValueGeneratedNever();
            league.Property(l => l.Format).HasConversion<string>();
            league.Property(l => l.HandicapSystem).HasConversion<string>();
            league.Property(l => l.HandicapFormulaJson).HasColumnType("jsonb");

            league.HasOne(l => l.Organization)
                  .WithMany()
                  .HasForeignKey(l => l.OrgId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Season>(season =>
        {
            season.Property(s => s.Id).ValueGeneratedNever();

            season.HasIndex(s => s.LeagueId)
                  .HasDatabaseName("IX_seasons_league_id");

            season.HasOne(s => s.League)
                  .WithMany(l => l.Seasons)
                  .HasForeignKey(s => s.LeagueId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Flight>(flight =>
        {
            flight.Property(f => f.Id).ValueGeneratedNever();

            flight.HasOne(f => f.Season)
                  .WithMany(s => s.Flights)
                  .HasForeignKey(f => f.SeasonId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<LeagueMember>(member =>
        {
            member.Property(m => m.Id).ValueGeneratedNever();
            member.Property(m => m.Status).HasConversion<string>();

            member.HasIndex(m => new { m.SeasonId, m.Email })
                  .IsUnique()
                  .HasDatabaseName("IX_league_members_season_id_email_unique");

            member.HasOne(m => m.Season)
                  .WithMany(s => s.Members)
                  .HasForeignKey(m => m.SeasonId)
                  .OnDelete(DeleteBehavior.Cascade);

            member.HasOne(m => m.Flight)
                  .WithMany(f => f.Members)
                  .HasForeignKey(m => m.FlightId)
                  .IsRequired(false)
                  .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<LeagueRound>(round =>
        {
            round.Property(r => r.Id).ValueGeneratedNever();
            round.Property(r => r.Status).HasConversion<string>();

            round.HasIndex(r => r.SeasonId)
                 .HasDatabaseName("IX_league_rounds_season_id");

            round.HasOne(r => r.Season)
                 .WithMany(s => s.Rounds)
                 .HasForeignKey(r => r.SeasonId)
                 .OnDelete(DeleteBehavior.Cascade);

            round.HasOne(r => r.Course)
                 .WithMany()
                 .HasForeignKey(r => r.CourseId)
                 .IsRequired(false)
                 .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<LeaguePairing>(pairing =>
        {
            pairing.Property(p => p.Id).ValueGeneratedNever();
            pairing.Property(p => p.MemberIdsJson).HasColumnType("jsonb");

            pairing.HasIndex(p => p.RoundId)
                   .HasDatabaseName("IX_league_pairings_round_id");

            pairing.HasOne(p => p.Round)
                   .WithMany(r => r.Pairings)
                   .HasForeignKey(p => p.RoundId)
                   .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<LeagueScore>(score =>
        {
            score.Property(s => s.Id).ValueGeneratedNever();

            score.HasIndex(s => new { s.RoundId, s.MemberId })
                 .HasDatabaseName("IX_league_scores_round_member");

            score.HasOne(s => s.Round)
                 .WithMany(r => r.Scores)
                 .HasForeignKey(s => s.RoundId)
                 .OnDelete(DeleteBehavior.Cascade);

            score.HasOne(s => s.Member)
                 .WithMany(m => m.Scores)
                 .HasForeignKey(s => s.MemberId)
                 .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<HandicapHistory>(hh =>
        {
            hh.Property(h => h.Id).ValueGeneratedNever();

            hh.HasIndex(h => h.MemberId)
              .HasDatabaseName("IX_handicap_history_member_id");

            hh.HasOne(h => h.Member)
              .WithMany(m => m.HandicapHistories)
              .HasForeignKey(h => h.MemberId)
              .OnDelete(DeleteBehavior.Cascade);

            hh.HasOne(h => h.Round)
              .WithMany()
              .HasForeignKey(h => h.RoundId)
              .IsRequired(false)
              .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Standing>(standing =>
        {
            standing.Property(s => s.Id).ValueGeneratedNever();

            standing.HasIndex(s => new { s.SeasonId, s.MemberId })
                    .IsUnique()
                    .HasDatabaseName("IX_standings_season_member_unique");

            standing.HasOne(s => s.Season)
                    .WithMany(se => se.Standings)
                    .HasForeignKey(s => s.SeasonId)
                    .OnDelete(DeleteBehavior.Cascade);

            standing.HasOne(s => s.Member)
                    .WithMany()
                    .HasForeignKey(s => s.MemberId)
                    .OnDelete(DeleteBehavior.Restrict);

            standing.HasOne(s => s.Flight)
                    .WithMany()
                    .HasForeignKey(s => s.FlightId)
                    .IsRequired(false)
                    .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Skin>(skin =>
        {
            skin.Property(s => s.Id).ValueGeneratedNever();

            skin.HasIndex(s => s.RoundId)
                .HasDatabaseName("IX_skins_round_id");

            skin.HasOne(s => s.Round)
                .WithMany(r => r.Skins)
                .HasForeignKey(s => s.RoundId)
                .OnDelete(DeleteBehavior.Cascade);

            skin.HasOne(s => s.Winner)
                .WithMany()
                .HasForeignKey(s => s.WinnerMemberId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.SetNull);
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
