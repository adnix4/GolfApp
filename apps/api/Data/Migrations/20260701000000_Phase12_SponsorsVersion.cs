using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <summary>
    /// Adds events.sponsors_version — a monotonic counter bumped whenever an
    /// event's sponsor set changes. Clients (web scoreboard, mobile scorer)
    /// compare it against their cached value to detect a stale sponsor list
    /// cheaply, then refetch only when it actually changed. Paired with the
    /// SignalR SponsorsChanged broadcast so a sponsor added mid-event reaches
    /// already-connected devices without a rejoin.
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260701000000_Phase12_SponsorsVersion")]
    public partial class Phase12_SponsorsVersion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "sponsors_version",
                table: "events",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "sponsors_version", table: "events");
        }
    }
}
