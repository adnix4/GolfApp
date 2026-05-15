using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Phase7b_AuctionBidderCount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "current_bidder_count",
                table: "auction_sessions",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "current_bidder_count",
                table: "auction_sessions");
        }
    }
}
