using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <summary>
    /// Reconciles model drift the snapshot had silently accumulated: adds the
    /// FK indexes EF's model implies for the league tables (never created by the
    /// hand-written Phase5/Phase8 migrations) and drops the migration-time column
    /// defaults on standings/seasons that the model does not declare.
    /// </summary>
    public partial class Phase10_ReconcileModelDrift : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "match_wins",
                table: "standings",
                type: "integer",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer",
                oldDefaultValue: 0);

            migrationBuilder.AlterColumn<int>(
                name: "match_losses",
                table: "standings",
                type: "integer",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer",
                oldDefaultValue: 0);

            migrationBuilder.AlterColumn<int>(
                name: "match_halves",
                table: "standings",
                type: "integer",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer",
                oldDefaultValue: 0);

            migrationBuilder.AlterColumn<bool>(
                name: "sync_handicap_to_player",
                table: "seasons",
                type: "boolean",
                nullable: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldDefaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_standings_flight_id",
                table: "standings",
                column: "flight_id");

            migrationBuilder.CreateIndex(
                name: "IX_standings_member_id",
                table: "standings",
                column: "member_id");

            migrationBuilder.CreateIndex(
                name: "IX_skins_winner_member_id",
                table: "skins",
                column: "winner_member_id");

            migrationBuilder.CreateIndex(
                name: "IX_round_absences_member_id",
                table: "round_absences",
                column: "member_id");

            migrationBuilder.CreateIndex(
                name: "IX_round_absences_sub_member_id",
                table: "round_absences",
                column: "sub_member_id");

            migrationBuilder.CreateIndex(
                name: "IX_league_scores_member_id",
                table: "league_scores",
                column: "member_id");

            migrationBuilder.CreateIndex(
                name: "IX_league_rounds_course_id",
                table: "league_rounds",
                column: "course_id");

            migrationBuilder.CreateIndex(
                name: "IX_league_members_flight_id",
                table: "league_members",
                column: "flight_id");

            migrationBuilder.CreateIndex(
                name: "IX_handicap_history_round_id",
                table: "handicap_history",
                column: "round_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_standings_flight_id",
                table: "standings");

            migrationBuilder.DropIndex(
                name: "IX_standings_member_id",
                table: "standings");

            migrationBuilder.DropIndex(
                name: "IX_skins_winner_member_id",
                table: "skins");

            migrationBuilder.DropIndex(
                name: "IX_round_absences_member_id",
                table: "round_absences");

            migrationBuilder.DropIndex(
                name: "IX_round_absences_sub_member_id",
                table: "round_absences");

            migrationBuilder.DropIndex(
                name: "IX_league_scores_member_id",
                table: "league_scores");

            migrationBuilder.DropIndex(
                name: "IX_league_rounds_course_id",
                table: "league_rounds");

            migrationBuilder.DropIndex(
                name: "IX_league_members_flight_id",
                table: "league_members");

            migrationBuilder.DropIndex(
                name: "IX_handicap_history_round_id",
                table: "handicap_history");

            migrationBuilder.AlterColumn<int>(
                name: "match_wins",
                table: "standings",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AlterColumn<int>(
                name: "match_losses",
                table: "standings",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AlterColumn<int>(
                name: "match_halves",
                table: "standings",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AlterColumn<bool>(
                name: "sync_handicap_to_player",
                table: "seasons",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean");
        }
    }
}
