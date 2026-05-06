using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Phase5_LeaguePlay : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ── leagues ───────────────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "leagues",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    org_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    format = table.Column<string>(type: "text", nullable: false),
                    handicap_system = table.Column<string>(type: "text", nullable: false),
                    handicap_formula = table.Column<string>(type: "jsonb", nullable: false, defaultValue: "{\"type\":\"BestNofM\",\"n\":5,\"m\":10}"),
                    handicap_cap = table.Column<double>(type: "double precision", nullable: false, defaultValue: 36.0),
                    max_flights = table.Column<short>(type: "smallint", nullable: false, defaultValue: (short)1),
                    dues_cents = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_leagues", x => x.id);
                    table.ForeignKey(
                        name: "FK_leagues_organizations_org_id",
                        column: x => x.org_id,
                        principalTable: "organizations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_leagues_org_id",
                table: "leagues",
                column: "org_id");

            // ── seasons ───────────────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "seasons",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    league_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    total_rounds = table.Column<short>(type: "smallint", nullable: false),
                    start_date = table.Column<DateOnly>(type: "date", nullable: false),
                    end_date = table.Column<DateOnly>(type: "date", nullable: false),
                    status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "Draft"),
                    rounds_counted = table.Column<short>(type: "smallint", nullable: false, defaultValue: (short)0),
                    standing_method = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "TotalNet"),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_seasons", x => x.id);
                    table.ForeignKey(
                        name: "FK_seasons_leagues_league_id",
                        column: x => x.league_id,
                        principalTable: "leagues",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_seasons_league_id",
                table: "seasons",
                column: "league_id");

            // ── flights ───────────────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "flights",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    season_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    min_handicap = table.Column<double>(type: "double precision", nullable: true),
                    max_handicap = table.Column<double>(type: "double precision", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_flights", x => x.id);
                    table.ForeignKey(
                        name: "FK_flights_seasons_season_id",
                        column: x => x.season_id,
                        principalTable: "seasons",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_flights_season_id",
                table: "flights",
                column: "season_id");

            // ── league_rounds ─────────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "league_rounds",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    season_id = table.Column<Guid>(type: "uuid", nullable: false),
                    course_id = table.Column<Guid>(type: "uuid", nullable: true),
                    round_date = table.Column<DateOnly>(type: "date", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_league_rounds", x => x.id);
                    table.ForeignKey(
                        name: "FK_league_rounds_seasons_season_id",
                        column: x => x.season_id,
                        principalTable: "seasons",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_league_rounds_courses_course_id",
                        column: x => x.course_id,
                        principalTable: "courses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_league_rounds_season_id",
                table: "league_rounds",
                column: "season_id");

            // ── league_members ────────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "league_members",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    season_id = table.Column<Guid>(type: "uuid", nullable: false),
                    player_id = table.Column<Guid>(type: "uuid", nullable: true),
                    flight_id = table.Column<Guid>(type: "uuid", nullable: true),
                    first_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    last_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    handicap_index = table.Column<double>(type: "double precision", nullable: false),
                    dues_paid = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    rounds_played = table.Column<short>(type: "smallint", nullable: false, defaultValue: (short)0),
                    absences = table.Column<short>(type: "smallint", nullable: false, defaultValue: (short)0),
                    status = table.Column<string>(type: "text", nullable: false),
                    joined_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_league_members", x => x.id);
                    table.ForeignKey(
                        name: "FK_league_members_seasons_season_id",
                        column: x => x.season_id,
                        principalTable: "seasons",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_league_members_flights_flight_id",
                        column: x => x.flight_id,
                        principalTable: "flights",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_league_members_season_id_email_unique",
                table: "league_members",
                columns: new[] { "season_id", "email" },
                unique: true);

            // ── league_pairings ───────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "league_pairings",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    round_id = table.Column<Guid>(type: "uuid", nullable: false),
                    group_number = table.Column<short>(type: "smallint", nullable: false),
                    member_ids = table.Column<string>(type: "jsonb", nullable: false, defaultValue: "[]"),
                    tee_time = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    starting_hole = table.Column<short>(type: "smallint", nullable: true),
                    is_locked = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_league_pairings", x => x.id);
                    table.ForeignKey(
                        name: "FK_league_pairings_league_rounds_round_id",
                        column: x => x.round_id,
                        principalTable: "league_rounds",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_league_pairings_round_id",
                table: "league_pairings",
                column: "round_id");

            // ── league_scores ─────────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "league_scores",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    round_id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    hole_number = table.Column<short>(type: "smallint", nullable: false),
                    gross_score = table.Column<short>(type: "smallint", nullable: false),
                    net_score = table.Column<short>(type: "smallint", nullable: false),
                    stableford_points = table.Column<short>(type: "smallint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_league_scores", x => x.id);
                    table.ForeignKey(
                        name: "FK_league_scores_league_rounds_round_id",
                        column: x => x.round_id,
                        principalTable: "league_rounds",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_league_scores_league_members_member_id",
                        column: x => x.member_id,
                        principalTable: "league_members",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_league_scores_round_member",
                table: "league_scores",
                columns: new[] { "round_id", "member_id" });

            // ── handicap_history ──────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "handicap_history",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    round_id = table.Column<Guid>(type: "uuid", nullable: true),
                    old_index = table.Column<double>(type: "double precision", nullable: false),
                    new_index = table.Column<double>(type: "double precision", nullable: false),
                    differential = table.Column<double>(type: "double precision", nullable: false),
                    admin_override = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_handicap_history", x => x.id);
                    table.ForeignKey(
                        name: "FK_handicap_history_league_members_member_id",
                        column: x => x.member_id,
                        principalTable: "league_members",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_handicap_history_league_rounds_round_id",
                        column: x => x.round_id,
                        principalTable: "league_rounds",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_handicap_history_member_id",
                table: "handicap_history",
                column: "member_id");

            // ── standings ─────────────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "standings",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    season_id = table.Column<Guid>(type: "uuid", nullable: false),
                    flight_id = table.Column<Guid>(type: "uuid", nullable: true),
                    member_id = table.Column<Guid>(type: "uuid", nullable: false),
                    total_points = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    net_strokes = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    season_avg_net = table.Column<double>(type: "double precision", nullable: false, defaultValue: 0.0),
                    rounds_played = table.Column<short>(type: "smallint", nullable: false, defaultValue: (short)0),
                    rank = table.Column<short>(type: "smallint", nullable: false, defaultValue: (short)0),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_standings", x => x.id);
                    table.ForeignKey(
                        name: "FK_standings_seasons_season_id",
                        column: x => x.season_id,
                        principalTable: "seasons",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_standings_league_members_member_id",
                        column: x => x.member_id,
                        principalTable: "league_members",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_standings_flights_flight_id",
                        column: x => x.flight_id,
                        principalTable: "flights",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_standings_season_member_unique",
                table: "standings",
                columns: new[] { "season_id", "member_id" },
                unique: true);

            // ── skins ─────────────────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "skins",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    round_id = table.Column<Guid>(type: "uuid", nullable: false),
                    hole_number = table.Column<short>(type: "smallint", nullable: false),
                    winner_member_id = table.Column<Guid>(type: "uuid", nullable: true),
                    pot_cents = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    carried_over_from_hole = table.Column<short>(type: "smallint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_skins", x => x.id);
                    table.ForeignKey(
                        name: "FK_skins_league_rounds_round_id",
                        column: x => x.round_id,
                        principalTable: "league_rounds",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_skins_league_members_winner_member_id",
                        column: x => x.winner_member_id,
                        principalTable: "league_members",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_skins_round_id",
                table: "skins",
                column: "round_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "skins");
            migrationBuilder.DropTable(name: "standings");
            migrationBuilder.DropTable(name: "handicap_history");
            migrationBuilder.DropTable(name: "league_scores");
            migrationBuilder.DropTable(name: "league_pairings");
            migrationBuilder.DropTable(name: "league_members");
            migrationBuilder.DropTable(name: "league_rounds");
            migrationBuilder.DropTable(name: "flights");
            migrationBuilder.DropTable(name: "seasons");
            migrationBuilder.DropTable(name: "leagues");
        }
    }
}
