using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Phase10_ReconcileModelDrift : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
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
        }
    }
}
