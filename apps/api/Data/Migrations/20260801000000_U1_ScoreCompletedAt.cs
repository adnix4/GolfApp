using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <summary>
    /// Adds scores.completed_at so a hole can be marked finished independently
    /// of whether it happens to hold a score.
    ///
    /// Why the distinction matters (U1): the admin transcribes paper cards after
    /// the round, entering each golfer's strokes in turn, and the card auto-saves
    /// as it goes. A hole therefore carries a partial gross score for as long as
    /// it takes to type the rest of the foursome. Deriving "complete" from "has a
    /// score" would flip the hole to done on the first golfer entered.
    ///
    /// Existing rows get a backfill rather than a null: every score already on
    /// the server arrived either from an admin who finished entering it or from
    /// a phone (which only syncs holes the golfer marked complete — see
    /// pending_scores.completed_at). Treating them as complete matches what the
    /// leaderboard has been showing all along; leaving them null would make
    /// finished rounds look unfinished.
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260801000000_U1_ScoreCompletedAt")]
    public partial class U1_ScoreCompletedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "completed_at",
                table: "scores",
                type: "timestamp with time zone",
                nullable: true);

            // Backfill: pre-existing scores are complete (see summary above).
            // submitted_at is used rather than now() so the timestamp stays
            // truthful about when the hole was actually finished.
            migrationBuilder.Sql(
                "UPDATE scores SET completed_at = submitted_at WHERE completed_at IS NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "completed_at", table: "scores");
        }
    }
}
