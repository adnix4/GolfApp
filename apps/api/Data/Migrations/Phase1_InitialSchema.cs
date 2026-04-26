using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Phase1_InitialSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:postgis", ",,");

            migrationBuilder.CreateTable(
                name: "AspNetRoles",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    NormalizedName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    ConcurrencyStamp = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetRoles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "organizations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    slug = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    logo_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    theme = table.Column<string>(type: "jsonb", nullable: true),
                    mission_statement = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    is_501c3 = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_organizations", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "AspNetRoleClaims",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RoleId = table.Column<string>(type: "text", nullable: false),
                    ClaimType = table.Column<string>(type: "text", nullable: true),
                    ClaimValue = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetRoleClaims", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AspNetRoleClaims_AspNetRoles_RoleId",
                        column: x => x.RoleId,
                        principalTable: "AspNetRoles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AspNetUsers",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    OrgId = table.Column<Guid>(type: "uuid", nullable: true),
                    DisplayName = table.Column<string>(type: "text", nullable: false),
                    UserName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    NormalizedUserName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    Email = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    NormalizedEmail = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    EmailConfirmed = table.Column<bool>(type: "boolean", nullable: false),
                    PasswordHash = table.Column<string>(type: "text", nullable: true),
                    SecurityStamp = table.Column<string>(type: "text", nullable: true),
                    ConcurrencyStamp = table.Column<string>(type: "text", nullable: true),
                    PhoneNumber = table.Column<string>(type: "text", nullable: true),
                    PhoneNumberConfirmed = table.Column<bool>(type: "boolean", nullable: false),
                    TwoFactorEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    LockoutEnd = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LockoutEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    AccessFailedCount = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetUsers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AspNetUsers_organizations_OrgId",
                        column: x => x.OrgId,
                        principalTable: "organizations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "courses",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    org_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    address = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    city = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    state = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    zip = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    location = table.Column<Point>(type: "geography (point)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_courses", x => x.id);
                    table.ForeignKey(
                        name: "FK_courses_organizations_org_id",
                        column: x => x.org_id,
                        principalTable: "organizations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "email_templates",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    org_id = table.Column<Guid>(type: "uuid", nullable: false),
                    trigger_type = table.Column<string>(type: "text", nullable: false),
                    subject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    html_body = table.Column<string>(type: "text", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_email_templates", x => x.id);
                    table.ForeignKey(
                        name: "FK_email_templates_organizations_org_id",
                        column: x => x.org_id,
                        principalTable: "organizations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AspNetUserClaims",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    ClaimType = table.Column<string>(type: "text", nullable: true),
                    ClaimValue = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetUserClaims", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AspNetUserClaims_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AspNetUserLogins",
                columns: table => new
                {
                    LoginProvider = table.Column<string>(type: "text", nullable: false),
                    ProviderKey = table.Column<string>(type: "text", nullable: false),
                    ProviderDisplayName = table.Column<string>(type: "text", nullable: true),
                    UserId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetUserLogins", x => new { x.LoginProvider, x.ProviderKey });
                    table.ForeignKey(
                        name: "FK_AspNetUserLogins_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AspNetUserRoles",
                columns: table => new
                {
                    UserId = table.Column<string>(type: "text", nullable: false),
                    RoleId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetUserRoles", x => new { x.UserId, x.RoleId });
                    table.ForeignKey(
                        name: "FK_AspNetUserRoles_AspNetRoles_RoleId",
                        column: x => x.RoleId,
                        principalTable: "AspNetRoles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AspNetUserRoles_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AspNetUserTokens",
                columns: table => new
                {
                    UserId = table.Column<string>(type: "text", nullable: false),
                    LoginProvider = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Value = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AspNetUserTokens", x => new { x.UserId, x.LoginProvider, x.Name });
                    table.ForeignKey(
                        name: "FK_AspNetUserTokens_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "refresh_tokens",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    Token = table.Column<string>(type: "text", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsRevoked = table.Column<bool>(type: "boolean", nullable: false),
                    RevokedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_refresh_tokens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_refresh_tokens_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "course_holes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    course_id = table.Column<Guid>(type: "uuid", nullable: false),
                    hole_number = table.Column<short>(type: "smallint", nullable: false),
                    par = table.Column<short>(type: "smallint", nullable: false),
                    handicap_index = table.Column<short>(type: "smallint", nullable: false),
                    yardage_white = table.Column<int>(type: "integer", nullable: true),
                    yardage_blue = table.Column<int>(type: "integer", nullable: true),
                    yardage_red = table.Column<int>(type: "integer", nullable: true),
                    cup_location = table.Column<Point>(type: "geography (pointz)", nullable: true),
                    cup_elevation_m = table.Column<float>(type: "real", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_course_holes", x => x.id);
                    table.ForeignKey(
                        name: "FK_course_holes_courses_course_id",
                        column: x => x.course_id,
                        principalTable: "courses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "events",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    org_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    event_code = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    format = table.Column<string>(type: "text", nullable: false),
                    start_type = table.Column<string>(type: "text", nullable: false),
                    holes = table.Column<short>(type: "smallint", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    start_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    config = table.Column<string>(type: "jsonb", nullable: false),
                    course_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_events", x => x.id);
                    table.ForeignKey(
                        name: "FK_events_courses_course_id",
                        column: x => x.course_id,
                        principalTable: "courses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_events_organizations_org_id",
                        column: x => x.org_id,
                        principalTable: "organizations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "donations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    donor_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    donor_email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    amount_cents = table.Column<int>(type: "integer", nullable: false),
                    receipt_sent = table.Column<bool>(type: "boolean", nullable: false),
                    stripe_payment_intent_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_donations", x => x.id);
                    table.ForeignKey(
                        name: "FK_donations_events_event_id",
                        column: x => x.event_id,
                        principalTable: "events",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "qr_codes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    qr_type = table.Column<string>(type: "text", nullable: false),
                    token = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    svg_data = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_qr_codes", x => x.id);
                    table.ForeignKey(
                        name: "FK_qr_codes_events_event_id",
                        column: x => x.event_id,
                        principalTable: "events",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "sponsors",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    logo_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    website_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    tagline = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    tier = table.Column<string>(type: "text", nullable: false),
                    placements = table.Column<string>(type: "jsonb", nullable: false)
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

            migrationBuilder.CreateTable(
                name: "teams",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    captain_player_id = table.Column<Guid>(type: "uuid", nullable: true),
                    starting_hole = table.Column<short>(type: "smallint", nullable: true),
                    tee_time = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    entry_fee_paid = table.Column<bool>(type: "boolean", nullable: false),
                    invite_token = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    invite_expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    max_players = table.Column<short>(type: "smallint", nullable: false),
                    check_in_status = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_teams", x => x.id);
                    table.ForeignKey(
                        name: "FK_teams_events_event_id",
                        column: x => x.event_id,
                        principalTable: "events",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "hole_challenges",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    hole_number = table.Column<short>(type: "smallint", nullable: true),
                    challenge_type = table.Column<string>(type: "text", nullable: false),
                    description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    prize_description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    sponsor_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_hole_challenges", x => x.id);
                    table.ForeignKey(
                        name: "FK_hole_challenges_events_event_id",
                        column: x => x.event_id,
                        principalTable: "events",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_hole_challenges_sponsors_sponsor_id",
                        column: x => x.sponsor_id,
                        principalTable: "sponsors",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "players",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    team_id = table.Column<Guid>(type: "uuid", nullable: true),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    first_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    last_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    phone = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    handicap_index = table.Column<double>(type: "double precision", nullable: true),
                    registration_type = table.Column<string>(type: "text", nullable: false),
                    skill_level = table.Column<string>(type: "text", nullable: true),
                    age_group = table.Column<string>(type: "text", nullable: true),
                    pairing_note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    check_in_status = table.Column<string>(type: "text", nullable: false),
                    check_in_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    has_payment_method = table.Column<bool>(type: "boolean", nullable: false),
                    stripe_customer_id = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_players", x => x.id);
                    table.ForeignKey(
                        name: "FK_players_events_event_id",
                        column: x => x.event_id,
                        principalTable: "events",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_players_teams_team_id",
                        column: x => x.team_id,
                        principalTable: "teams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "scores",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    team_id = table.Column<Guid>(type: "uuid", nullable: false),
                    hole_number = table.Column<short>(type: "smallint", nullable: false),
                    gross_score = table.Column<short>(type: "smallint", nullable: false),
                    putts = table.Column<short>(type: "smallint", nullable: true),
                    player_shots = table.Column<string>(type: "jsonb", nullable: true),
                    device_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    submitted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    synced_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    source = table.Column<string>(type: "text", nullable: false),
                    is_conflicted = table.Column<bool>(type: "boolean", nullable: false),
                    drive_location = table.Column<Point>(type: "geography (point)", nullable: true),
                    ball_location = table.Column<Point>(type: "geography (point)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_scores", x => x.id);
                    table.ForeignKey(
                        name: "FK_scores_events_event_id",
                        column: x => x.event_id,
                        principalTable: "events",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_scores_teams_team_id",
                        column: x => x.team_id,
                        principalTable: "teams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "challenge_results",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    challenge_id = table.Column<Guid>(type: "uuid", nullable: false),
                    team_id = table.Column<Guid>(type: "uuid", nullable: false),
                    player_id = table.Column<Guid>(type: "uuid", nullable: true),
                    result_value = table.Column<float>(type: "real", nullable: true),
                    result_notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    recorded_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_challenge_results", x => x.id);
                    table.ForeignKey(
                        name: "FK_challenge_results_hole_challenges_challenge_id",
                        column: x => x.challenge_id,
                        principalTable: "hole_challenges",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_challenge_results_teams_team_id",
                        column: x => x.team_id,
                        principalTable: "teams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "organizations",
                columns: new[] { "id", "created_at", "is_501c3", "logo_url", "mission_statement", "name", "slug", "theme" },
                values: new object[] { new Guid("00000000-0000-0000-0000-000000000001"), new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), true, null, "Supporting excellence in Clear Lake High School extracurricular programs.", "Clear Lake High School Boosters", "clhs", null });

            migrationBuilder.CreateIndex(
                name: "IX_AspNetRoleClaims_RoleId",
                table: "AspNetRoleClaims",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "RoleNameIndex",
                table: "AspNetRoles",
                column: "NormalizedName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUserClaims_UserId",
                table: "AspNetUserClaims",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUserLogins_UserId",
                table: "AspNetUserLogins",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUserRoles_RoleId",
                table: "AspNetUserRoles",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "EmailIndex",
                table: "AspNetUsers",
                column: "NormalizedEmail");

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUsers_OrgId",
                table: "AspNetUsers",
                column: "OrgId");

            migrationBuilder.CreateIndex(
                name: "UserNameIndex",
                table: "AspNetUsers",
                column: "NormalizedUserName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_challenge_results_challenge_id",
                table: "challenge_results",
                column: "challenge_id");

            migrationBuilder.CreateIndex(
                name: "IX_challenge_results_team_id",
                table: "challenge_results",
                column: "team_id");

            migrationBuilder.CreateIndex(
                name: "IX_course_holes_course_id",
                table: "course_holes",
                column: "course_id");

            migrationBuilder.CreateIndex(
                name: "IX_courses_org_id",
                table: "courses",
                column: "org_id");

            migrationBuilder.CreateIndex(
                name: "IX_donations_event_id",
                table: "donations",
                column: "event_id");

            migrationBuilder.CreateIndex(
                name: "IX_email_templates_org_id",
                table: "email_templates",
                column: "org_id");

            migrationBuilder.CreateIndex(
                name: "IX_events_course_id",
                table: "events",
                column: "course_id");

            migrationBuilder.CreateIndex(
                name: "IX_events_event_code",
                table: "events",
                column: "event_code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_events_org_id",
                table: "events",
                column: "org_id");

            migrationBuilder.CreateIndex(
                name: "IX_hole_challenges_event_id",
                table: "hole_challenges",
                column: "event_id");

            migrationBuilder.CreateIndex(
                name: "IX_hole_challenges_sponsor_id",
                table: "hole_challenges",
                column: "sponsor_id");

            migrationBuilder.CreateIndex(
                name: "IX_organizations_slug",
                table: "organizations",
                column: "slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_players_event_id_email_unique",
                table: "players",
                columns: new[] { "event_id", "email" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_players_team_id",
                table: "players",
                column: "team_id");

            migrationBuilder.CreateIndex(
                name: "IX_qr_codes_event_id",
                table: "qr_codes",
                column: "event_id");

            migrationBuilder.CreateIndex(
                name: "IX_refresh_tokens_token",
                table: "refresh_tokens",
                column: "Token");

            migrationBuilder.CreateIndex(
                name: "IX_refresh_tokens_user_id",
                table: "refresh_tokens",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_scores_event_id",
                table: "scores",
                column: "event_id");

            migrationBuilder.CreateIndex(
                name: "IX_scores_team_id_hole_number",
                table: "scores",
                columns: new[] { "team_id", "hole_number" });

            migrationBuilder.CreateIndex(
                name: "IX_sponsors_event_id",
                table: "sponsors",
                column: "event_id");

            migrationBuilder.CreateIndex(
                name: "IX_teams_event_id",
                table: "teams",
                column: "event_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AspNetRoleClaims");

            migrationBuilder.DropTable(
                name: "AspNetUserClaims");

            migrationBuilder.DropTable(
                name: "AspNetUserLogins");

            migrationBuilder.DropTable(
                name: "AspNetUserRoles");

            migrationBuilder.DropTable(
                name: "AspNetUserTokens");

            migrationBuilder.DropTable(
                name: "challenge_results");

            migrationBuilder.DropTable(
                name: "course_holes");

            migrationBuilder.DropTable(
                name: "donations");

            migrationBuilder.DropTable(
                name: "email_templates");

            migrationBuilder.DropTable(
                name: "players");

            migrationBuilder.DropTable(
                name: "qr_codes");

            migrationBuilder.DropTable(
                name: "refresh_tokens");

            migrationBuilder.DropTable(
                name: "scores");

            migrationBuilder.DropTable(
                name: "AspNetRoles");

            migrationBuilder.DropTable(
                name: "hole_challenges");

            migrationBuilder.DropTable(
                name: "AspNetUsers");

            migrationBuilder.DropTable(
                name: "teams");

            migrationBuilder.DropTable(
                name: "sponsors");

            migrationBuilder.DropTable(
                name: "events");

            migrationBuilder.DropTable(
                name: "courses");

            migrationBuilder.DropTable(
                name: "organizations");

            migrationBuilder.AlterDatabase()
                .OldAnnotation("Npgsql:PostgresExtension:postgis", ",,");
        }
    }
}
