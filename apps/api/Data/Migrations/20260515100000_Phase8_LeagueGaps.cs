using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Phase8_LeagueGaps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ── COURSES: add USGA rating columns ──────────────────────────────
            migrationBuilder.AddColumn<double>(
                name: "course_rating",
                table: "courses",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "slope_rating",
                table: "courses",
                type: "integer",
                nullable: true);

            // ── SEASONS: add handicap sync toggle ─────────────────────────────
            migrationBuilder.AddColumn<bool>(
                name: "sync_handicap_to_player",
                table: "seasons",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // ── STANDINGS: add match play result columns ───────────────────────
            migrationBuilder.AddColumn<int>(
                name: "match_wins",
                table: "standings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "match_losses",
                table: "standings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "match_halves",
                table: "standings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // ── ROUND ABSENCES: new table ─────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "round_absences",
                columns: table => new
                {
                    id            = table.Column<Guid>(type: "uuid", nullable: false),
                    round_id      = table.Column<Guid>(type: "uuid", nullable: false),
                    member_id     = table.Column<Guid>(type: "uuid", nullable: false),
                    sub_member_id = table.Column<Guid>(type: "uuid", nullable: true),
                    reported_at   = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_round_absences", x => x.id);
                    table.ForeignKey(
                        name: "FK_round_absences_league_rounds_round_id",
                        column: x => x.round_id,
                        principalTable: "league_rounds",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_round_absences_league_members_member_id",
                        column: x => x.member_id,
                        principalTable: "league_members",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_round_absences_league_members_sub_member_id",
                        column: x => x.sub_member_id,
                        principalTable: "league_members",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_round_absences_round_member_unique",
                table: "round_absences",
                columns: new[] { "round_id", "member_id" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "round_absences");

            migrationBuilder.DropColumn(name: "match_halves",             table: "standings");
            migrationBuilder.DropColumn(name: "match_losses",             table: "standings");
            migrationBuilder.DropColumn(name: "match_wins",               table: "standings");
            migrationBuilder.DropColumn(name: "sync_handicap_to_player",  table: "seasons");
            migrationBuilder.DropColumn(name: "slope_rating",             table: "courses");
            migrationBuilder.DropColumn(name: "course_rating",            table: "courses");
        }
    }
}
