using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <summary>
    /// Moves entry-fee tracking from the team to the individual golfer.
    /// The fee (config.entryFeeCents) is now priced per golfer, and each
    /// player row records what they actually paid:
    ///   • entry_fee_paid_cents — cents collected from this golfer (0 = unpaid).
    ///     Stored as an amount (not a bool) so fundraising totals survive later
    ///     fee changes by the organizer.
    ///   • entry_fee_paid_at — when payment was recorded (Stripe or mark-paid).
    /// teams.entry_fee_paid is retained for now but no longer read; the team's
    /// paid state is derived from its players.
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260706000000_Phase14_PlayerEntryFee")]
    public partial class Phase14_PlayerEntryFee : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "entry_fee_paid_cents",
                table: "players",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "entry_fee_paid_at",
                table: "players",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "entry_fee_paid_cents", table: "players");
            migrationBuilder.DropColumn(name: "entry_fee_paid_at", table: "players");
        }
    }
}
