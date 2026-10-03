using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <summary>
    /// Adds auction_winners.check_number — the number of the check a winner (or
    /// Fund-a-Need pledger) paid with at the checkout desk.
    ///
    /// WHY: the desk already records that a line was settled by check, but not
    /// which check. When a check bounces or the treasurer reconciles the deposit,
    /// "paid by check" is not enough to match it to a person. The desk now asks
    /// for the number when recording a check, and shows "Paid · check #1234".
    ///
    /// Nullable and optional: existing rows (including ones already settled by
    /// check) get null, and a desk without the number can still take payment.
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20261003000000_Phase17_AuctionCheckNumber")]
    public partial class Phase17_AuctionCheckNumber : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "check_number",
                table: "auction_winners",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "check_number", table: "auction_winners");
        }
    }
}
