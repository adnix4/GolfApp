using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SponsorChallengeDonationAmounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "donation_amount_cents",
                table: "sponsors",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "donation_amount_cents",
                table: "hole_challenges",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "donation_amount_cents", table: "sponsors");
            migrationBuilder.DropColumn(name: "donation_amount_cents", table: "hole_challenges");
        }
    }
}
