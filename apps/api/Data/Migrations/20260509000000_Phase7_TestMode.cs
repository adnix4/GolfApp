using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Phase7_TestMode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "is_test_mode",
                table: "events",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "is_test",
                table: "teams",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "is_test",
                table: "players",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "is_test",
                table: "scores",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "is_test",
                table: "donations",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "is_test",
                table: "challenge_results",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "is_test",
                table: "auction_items",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "is_test",
                table: "bids",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "is_test",
                table: "auction_winners",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "is_test_mode", table: "events");
            migrationBuilder.DropColumn(name: "is_test", table: "teams");
            migrationBuilder.DropColumn(name: "is_test", table: "players");
            migrationBuilder.DropColumn(name: "is_test", table: "scores");
            migrationBuilder.DropColumn(name: "is_test", table: "donations");
            migrationBuilder.DropColumn(name: "is_test", table: "challenge_results");
            migrationBuilder.DropColumn(name: "is_test", table: "auction_items");
            migrationBuilder.DropColumn(name: "is_test", table: "bids");
            migrationBuilder.DropColumn(name: "is_test", table: "auction_winners");
        }
    }
}
