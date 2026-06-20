using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <summary>
    /// Adds scores.proposed_score — the golfer-proposed value that disagrees with
    /// the authoritative (admin-kept) gross score on a conflicted hole. Set
    /// alongside is_conflicted so the admin can approve the change; cleared on
    /// resolution. Lets corrections/conflicts flow back to the mobile scorecard.
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260520000000_Phase9_ScoreProposedScore")]
    public partial class Phase9_ScoreProposedScore : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<short>(
                name: "proposed_score",
                table: "scores",
                type: "smallint",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "proposed_score", table: "scores");
        }
    }
}
