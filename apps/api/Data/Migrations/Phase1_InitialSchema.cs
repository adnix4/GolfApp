// ─────────────────────────────────────────────────────────────────────────────
// Data/Migrations/Phase1_InitialSchema.cs
// ─────────────────────────────────────────────────────────────────────────────
//
// WHAT THIS MIGRATION DOES:
//   Creates the COMPLETE Phase 1 database schema in one migration.
//   Spec: "Full schema created in Phase 1 migrations. All tables exist from
//          day one — later phases write to columns that were always there."
//
// HOW TO APPLY:
//   From apps/api directory:
//     dotnet ef database update
//
// HOW TO GENERATE A REAL MIGRATION (after updating entities):
//   From apps/api directory:
//     dotnet ef migrations add Phase2_AddOfflineColumns
//   This file shows the PATTERN — the real migration output from EF Core
//   will be longer and more precise for the exact Postgres column types.
//
// SPEC REQUIREMENT (Foundation §2.2):
//   "Run: CREATE EXTENSION IF NOT EXISTS postgis; in migration's Up() raw SQL"
//   This is done first in Up() below before any table creation.
//
// MIGRATION NAMING CONVENTION (spec Foundation §4):
//   Phase1_InitialSchema      ← this file
//   Phase2_AddOfflineColumns  ← Phase 2 (SQLite sync columns)
//   Phase4_AddAuction         ← Phase 4 (Stripe + auction tables)
//   Phase5_AddLeague          ← Phase 5 (league/season tables)
//   Phase6_AddGPS             ← Phase 6 (GPS coordinate columns)
//
// NOTE: This file is a hand-authored migration following EF Core conventions.
//       When `dotnet ef migrations add Phase1_InitialSchema` is run in the
//       actual project, EF Core will generate a more complete version based on
//       the exact entity configuration in ApplicationDbContext.
//       This file serves as the reference implementation.
// ─────────────────────────────────────────────────────────────────────────────

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations;

/// <inheritdoc />
public partial class Phase1_InitialSchema : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // ── STEP 0: ENABLE POSTGIS ────────────────────────────────────────
        // MUST be first — tables with GEOGRAPHY columns will fail without it.
        // Spec Foundation §2.2: "Run CREATE EXTENSION IF NOT EXISTS postgis;
        // in migration's Up() raw SQL block."
        migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS postgis;");
        migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS postgis_topology;");

        // ── STEP 1: ORGANIZATIONS ─────────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "organizations",
            columns: table => new
            {
                id                = table.Column<Guid>(nullable: false),
                name              = table.Column<string>(maxLength: 200, nullable: false),
                slug              = table.Column<string>(maxLength: 60, nullable: false),
                logo_url          = table.Column<string>(maxLength: 500, nullable: true),
                // JSONB column for the 5-token color theme override.
                // null = use ECO_GREEN_DEFAULT from @gfp/theme.
                theme             = table.Column<string>(type: "jsonb", nullable: true),
                mission_statement = table.Column<string>(maxLength: 1000, nullable: true),
                is_501c3          = table.Column<bool>(nullable: false, defaultValue: false),
                created_at        = table.Column<DateTime>(nullable: false),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_organizations", x => x.id);
            });

        // Unique index on slug — used in public URL routing /e/{slug}/{eventCode}
        migrationBuilder.CreateIndex(
            name:    "IX_organizations_slug_unique",
            table:   "organizations",
            column:  "slug",
            unique:  true);

        // ── STEP 2: ASPNETUSERS + IDENTITY TABLES ─────────────────────────
        // Note: In the real EF Core migration, Identity tables are auto-generated
        // by the IdentityDbContext base class migration. They include:
        //   AspNetUsers, AspNetRoles, AspNetUserRoles, AspNetUserClaims,
        //   AspNetRoleClaims, AspNetUserLogins, AspNetUserTokens
        //
        // The ApplicationUser extends IdentityUser with:
        //   OrgId (FK to organizations), DisplayName
        //
        // These are created by EF Core automatically — not shown here to avoid
        // duplicating the Identity schema definition.

        // ── STEP 3: REFRESH TOKENS ────────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "refresh_tokens",
            columns: table => new
            {
                id         = table.Column<Guid>(nullable: false),
                user_id    = table.Column<string>(nullable: false),    // FK to AspNetUsers.Id
                // SHA-256 hash of the raw token. Never store raw token.
                token      = table.Column<string>(nullable: false),
                expires_at = table.Column<DateTime>(nullable: false),
                created_at = table.Column<DateTime>(nullable: false),
                is_revoked = table.Column<bool>(nullable: false, defaultValue: false),
                revoked_at = table.Column<DateTime>(nullable: true),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_refresh_tokens", x => x.id);
                table.ForeignKey(
                    name:             "FK_refresh_tokens_AspNetUsers_user_id",
                    column:           x => x.user_id,
                    principalTable:   "AspNetUsers",
                    principalColumn:  "Id",
                    onDelete:         ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_refresh_tokens_user_id",
            table: "refresh_tokens",
            column: "user_id");

        migrationBuilder.CreateIndex(
            name: "IX_refresh_tokens_token",
            table: "refresh_tokens",
            column: "token");

        // ── STEP 4: COURSES ───────────────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "courses",
            columns: table => new
            {
                id       = table.Column<Guid>(nullable: false),
                org_id   = table.Column<Guid>(nullable: false),
                name     = table.Column<string>(maxLength: 200, nullable: false),
                address  = table.Column<string>(maxLength: 300, nullable: false),
                city     = table.Column<string>(maxLength: 100, nullable: false),
                state    = table.Column<string>(maxLength: 50, nullable: false),
                zip      = table.Column<string>(maxLength: 20, nullable: false),
                // PostGIS GEOGRAPHY(Point,4326) — lat/lon of the course clubhouse
                // SRID 4326 = WGS-84 (standard GPS coordinate system)
                location = table.Column<NetTopologySuite.Geometries.Point>(
                    type: "geography (point)", nullable: true),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_courses", x => x.id);
                table.ForeignKey(
                    name:           "FK_courses_organizations_org_id",
                    column:         x => x.org_id,
                    principalTable: "organizations",
                    principalColumn: "id",
                    onDelete:       ReferentialAction.Cascade);
            });

        // ── STEP 5: COURSE HOLES ──────────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "course_holes",
            columns: table => new
            {
                id              = table.Column<Guid>(nullable: false),
                course_id       = table.Column<Guid>(nullable: false),
                hole_number     = table.Column<short>(nullable: false),
                par             = table.Column<short>(nullable: false),
                handicap_index  = table.Column<short>(nullable: false),
                yardage_white   = table.Column<int>(nullable: true),
                yardage_blue    = table.Column<int>(nullable: true),
                yardage_red     = table.Column<int>(nullable: true),
                // Phase 6 GPS columns — nullable until Phase 6 deployed.
                // GEOGRAPHY(PointZ,4326) includes elevation (Z coordinate).
                cup_location    = table.Column<NetTopologySuite.Geometries.Point>(
                    type: "geography (pointz)", nullable: true),
                cup_elevation_m = table.Column<float>(nullable: true),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_course_holes", x => x.id);
                table.ForeignKey(
                    name:            "FK_course_holes_courses_course_id",
                    column:          x => x.course_id,
                    principalTable:  "courses",
                    principalColumn: "id",
                    onDelete:        ReferentialAction.Cascade);
            });

        // ── STEP 6: EVENTS ────────────────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "events",
            columns: table => new
            {
                id          = table.Column<Guid>(nullable: false),
                org_id      = table.Column<Guid>(nullable: false),
                course_id   = table.Column<Guid>(nullable: true),
                name        = table.Column<string>(maxLength: 200, nullable: false),
                // 8-char random alphanumeric. Used in QR codes and public URLs.
                event_code  = table.Column<string>(maxLength: 8, nullable: false),
                format      = table.Column<string>(nullable: false),
                start_type  = table.Column<string>(nullable: false),
                holes       = table.Column<short>(nullable: false, defaultValue: (short)18),
                status      = table.Column<string>(nullable: false, defaultValue: "Draft"),
                start_at    = table.Column<DateTime>(nullable: true),
                // Flexible JSONB config: allow_walk_ups, max_teams, tee_intervals, etc.
                config      = table.Column<string>(type: "jsonb", nullable: false, defaultValue: "{}"),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_events", x => x.id);
                table.ForeignKey(
                    name:            "FK_events_organizations_org_id",
                    column:          x => x.org_id,
                    principalTable:  "organizations",
                    principalColumn: "id",
                    onDelete:        ReferentialAction.Cascade);
                table.ForeignKey(
                    name:            "FK_events_courses_course_id",
                    column:          x => x.course_id,
                    principalTable:  "courses",
                    principalColumn: "id",
                    onDelete:        ReferentialAction.SetNull);
            });

        // event_code must be globally unique — used in QR scanner lookup
        migrationBuilder.CreateIndex(
            name:   "IX_events_event_code_unique",
            table:  "events",
            column: "event_code",
            unique: true);

        // ── STEP 7: TEAMS ─────────────────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "teams",
            columns: table => new
            {
                id                 = table.Column<Guid>(nullable: false),
                event_id           = table.Column<Guid>(nullable: false),
                name               = table.Column<string>(maxLength: 200, nullable: false),
                captain_player_id  = table.Column<Guid>(nullable: true),
                starting_hole      = table.Column<short>(nullable: true),
                tee_time           = table.Column<DateTime>(nullable: true),
                entry_fee_paid     = table.Column<bool>(nullable: false, defaultValue: false),
                invite_token       = table.Column<string>(maxLength: 64, nullable: true),
                invite_expires_at  = table.Column<DateTime>(nullable: true),
                max_players        = table.Column<short>(nullable: false, defaultValue: (short)4),
                check_in_status    = table.Column<string>(nullable: false, defaultValue: "Pending"),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_teams", x => x.id);
                table.ForeignKey(
                    name:            "FK_teams_events_event_id",
                    column:          x => x.event_id,
                    principalTable:  "events",
                    principalColumn: "id",
                    onDelete:        ReferentialAction.Cascade);
            });

        // ── STEP 8: PLAYERS ───────────────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "players",
            columns: table => new
            {
                id                  = table.Column<Guid>(nullable: false),
                team_id             = table.Column<Guid>(nullable: true),
                event_id            = table.Column<Guid>(nullable: false),
                first_name          = table.Column<string>(maxLength: 100, nullable: false),
                last_name           = table.Column<string>(maxLength: 100, nullable: false),
                email               = table.Column<string>(maxLength: 254, nullable: false),
                phone               = table.Column<string>(maxLength: 30, nullable: true),
                handicap_index      = table.Column<double>(nullable: true),
                registration_type   = table.Column<string>(nullable: false),
                skill_level         = table.Column<string>(nullable: true),
                age_group           = table.Column<string>(nullable: true),
                pairing_note        = table.Column<string>(maxLength: 500, nullable: true),
                check_in_status     = table.Column<string>(nullable: false, defaultValue: "Pending"),
                check_in_at         = table.Column<DateTime>(nullable: true),
                // Phase 4 columns — nullable until Phase 4 deployed (spec Foundation §4)
                has_payment_method  = table.Column<bool>(nullable: false, defaultValue: false),
                stripe_customer_id  = table.Column<string>(maxLength: 50, nullable: true),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_players", x => x.id);
                table.ForeignKey(
                    name:            "FK_players_teams_team_id",
                    column:          x => x.team_id,
                    principalTable:  "teams",
                    principalColumn: "id",
                    onDelete:        ReferentialAction.SetNull);
                table.ForeignKey(
                    name:            "FK_players_events_event_id",
                    column:          x => x.event_id,
                    principalTable:  "events",
                    principalColumn: "id",
                    onDelete:        ReferentialAction.Cascade);
            });

        // UNIQUE constraint: one email per event (a player can't register twice)
        migrationBuilder.CreateIndex(
            name:    "IX_players_event_id_email_unique",
            table:   "players",
            columns: new[] { "event_id", "email" },
            unique:  true);

        // ── STEP 9: SCORES ────────────────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "scores",
            columns: table => new
            {
                id            = table.Column<Guid>(nullable: false),
                event_id      = table.Column<Guid>(nullable: false),
                team_id       = table.Column<Guid>(nullable: false),
                hole_number   = table.Column<short>(nullable: false),
                gross_score   = table.Column<short>(nullable: false),
                putts         = table.Column<short>(nullable: true),
                player_shots  = table.Column<string>(type: "jsonb", nullable: true),
                device_id     = table.Column<string>(maxLength: 100, nullable: false),
                submitted_at  = table.Column<DateTime>(nullable: false),
                synced_at     = table.Column<DateTime>(nullable: true),
                source        = table.Column<string>(nullable: false),
                is_conflicted = table.Column<bool>(nullable: false, defaultValue: false),
                // Phase 6 GPS columns — nullable until Phase 6 deployed
                drive_location = table.Column<NetTopologySuite.Geometries.Point>(
                    type: "geography (point)", nullable: true),
                ball_location  = table.Column<NetTopologySuite.Geometries.Point>(
                    type: "geography (point)", nullable: true),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_scores", x => x.id);
                table.ForeignKey(
                    name:            "FK_scores_events_event_id",
                    column:          x => x.event_id,
                    principalTable:  "events",
                    principalColumn: "id",
                    onDelete:        ReferentialAction.Cascade);
                table.ForeignKey(
                    name:            "FK_scores_teams_team_id",
                    column:          x => x.team_id,
                    principalTable:  "teams",
                    principalColumn: "id",
                    onDelete:        ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex("IX_scores_event_id",        "scores", "event_id");
        migrationBuilder.CreateIndex("IX_scores_team_id_hole",    "scores", new[] { "team_id", "hole_number" });

        // ── STEP 10: SPONSORS ─────────────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "sponsors",
            columns: table => new
            {
                id            = table.Column<Guid>(nullable: false),
                event_id      = table.Column<Guid>(nullable: false),
                name          = table.Column<string>(maxLength: 200, nullable: false),
                logo_url      = table.Column<string>(maxLength: 500, nullable: false),
                website_url   = table.Column<string>(maxLength: 500, nullable: true),
                tagline       = table.Column<string>(maxLength: 200, nullable: true),
                tier          = table.Column<string>(nullable: false),
                placements    = table.Column<string>(type: "jsonb", nullable: false, defaultValue: "{}"),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_sponsors", x => x.id);
                table.ForeignKey(
                    name: "FK_sponsors_events_event_id",
                    column: x => x.event_id,
                    principalTable: "events",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        // ── STEP 11: HOLE CHALLENGES ──────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "hole_challenges",
            columns: table => new
            {
                id                = table.Column<Guid>(nullable: false),
                event_id          = table.Column<Guid>(nullable: false),
                sponsor_id        = table.Column<Guid>(nullable: true),
                hole_number       = table.Column<short>(nullable: true),
                challenge_type    = table.Column<string>(nullable: false),
                description       = table.Column<string>(maxLength: 500, nullable: false),
                prize_description = table.Column<string>(maxLength: 500, nullable: true),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_hole_challenges", x => x.id);
                table.ForeignKey("FK_hole_challenges_events_event_id", x => x.event_id,
                    "events", "id", onDelete: ReferentialAction.Cascade);
                table.ForeignKey("FK_hole_challenges_sponsors_sponsor_id", x => x.sponsor_id,
                    "sponsors", "id", onDelete: ReferentialAction.SetNull);
            });

        // ── STEP 12: CHALLENGE RESULTS ────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "challenge_results",
            columns: table => new
            {
                id            = table.Column<Guid>(nullable: false),
                challenge_id  = table.Column<Guid>(nullable: false),
                team_id       = table.Column<Guid>(nullable: false),
                player_id     = table.Column<Guid>(nullable: true),
                result_value  = table.Column<float>(nullable: true),
                result_notes  = table.Column<string>(maxLength: 500, nullable: true),
                recorded_at   = table.Column<DateTime>(nullable: false),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_challenge_results", x => x.id);
                table.ForeignKey("FK_challenge_results_hole_challenges_challenge_id",
                    x => x.challenge_id, "hole_challenges", "id", onDelete: ReferentialAction.Cascade);
                table.ForeignKey("FK_challenge_results_teams_team_id",
                    x => x.team_id, "teams", "id", onDelete: ReferentialAction.Restrict);
            });

        // ── STEP 13: DONATIONS ────────────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "donations",
            columns: table => new
            {
                id                      = table.Column<Guid>(nullable: false),
                event_id                = table.Column<Guid>(nullable: false),
                donor_name              = table.Column<string>(maxLength: 200, nullable: false),
                donor_email             = table.Column<string>(maxLength: 254, nullable: false),
                // Amount in cents — avoids floating-point currency errors
                amount_cents            = table.Column<int>(nullable: false),
                receipt_sent            = table.Column<bool>(nullable: false, defaultValue: false),
                // Phase 4: Stripe PaymentIntent ID — null until Phase 4 deployed
                stripe_payment_intent_id = table.Column<string>(maxLength: 100, nullable: true),
                created_at              = table.Column<DateTime>(nullable: false),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_donations", x => x.id);
                table.ForeignKey("FK_donations_events_event_id", x => x.event_id,
                    "events", "id", onDelete: ReferentialAction.Cascade);
            });

        // ── STEP 14: EMAIL TEMPLATES ──────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "email_templates",
            columns: table => new
            {
                id            = table.Column<Guid>(nullable: false),
                org_id        = table.Column<Guid>(nullable: false),
                trigger_type  = table.Column<string>(nullable: false),
                subject       = table.Column<string>(maxLength: 200, nullable: false),
                html_body     = table.Column<string>(nullable: false),
                is_active     = table.Column<bool>(nullable: false, defaultValue: true),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_email_templates", x => x.id);
                table.ForeignKey("FK_email_templates_organizations_org_id", x => x.org_id,
                    "organizations", "id", onDelete: ReferentialAction.Cascade);
            });

        // ── STEP 15: QR CODES ─────────────────────────────────────────────
        migrationBuilder.CreateTable(
            name: "qr_codes",
            columns: table => new
            {
                id         = table.Column<Guid>(nullable: false),
                event_id   = table.Column<Guid>(nullable: false),
                qr_type    = table.Column<string>(nullable: false),
                token      = table.Column<string>(maxLength: 128, nullable: false),
                svg_data   = table.Column<string>(nullable: false),
                created_at = table.Column<DateTime>(nullable: false),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_qr_codes", x => x.id);
                table.ForeignKey("FK_qr_codes_events_event_id", x => x.event_id,
                    "events", "id", onDelete: ReferentialAction.Cascade);
            });

        // ── STEP 16: SEED DATA ────────────────────────────────────────────
        // Seed the demo CLHS organization (same as ApplicationDbContext seed data)
        migrationBuilder.InsertData(
            table: "organizations",
            columns: new[] { "id", "name", "slug", "is_501c3", "created_at" },
            values: new object[]
            {
                Guid.Parse("00000000-0000-0000-0000-000000000001"),
                "Clear Lake High School Boosters",
                "clhs",
                true,
                new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Drop in reverse dependency order so FK constraints don't block drops.
        // Spec: "Never drop or rename existing columns — add new ones."
        // This Down() is provided for development rollback ONLY.
        // It should NEVER be run in production.

        migrationBuilder.DropTable("qr_codes");
        migrationBuilder.DropTable("email_templates");
        migrationBuilder.DropTable("donations");
        migrationBuilder.DropTable("challenge_results");
        migrationBuilder.DropTable("hole_challenges");
        migrationBuilder.DropTable("sponsors");
        migrationBuilder.DropTable("scores");
        migrationBuilder.DropTable("players");
        migrationBuilder.DropTable("teams");
        migrationBuilder.DropTable("events");
        migrationBuilder.DropTable("course_holes");
        migrationBuilder.DropTable("courses");
        migrationBuilder.DropTable("refresh_tokens");
        migrationBuilder.DropTable("organizations");
    }
}
