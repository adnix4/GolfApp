using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <summary>
    /// Adds bids.client_request_id — an id the mobile app generates per bid or
    /// pledge, unique when present.
    ///
    /// WHY: the app now queues bids placed with no connection and resends them
    /// when it reconnects. A resend after a lost response would otherwise place
    /// the bid twice, and for a Fund-a-Need pledge that doubles the donation.
    /// The server returns the original bid for a repeated id instead.
    ///
    /// Nullable: existing rows and older clients have no id. The unique index is
    /// filtered to non-null values so they don't collide.
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20261028000000_Phase19_BidClientRequestId")]
    public partial class Phase19_BidClientRequestId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "client_request_id",
                table: "bids",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_bids_client_request_id",
                table: "bids",
                column: "client_request_id",
                unique: true,
                filter: "client_request_id IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(name: "IX_bids_client_request_id", table: "bids");
            migrationBuilder.DropColumn(name: "client_request_id", table: "bids");
        }
    }
}
