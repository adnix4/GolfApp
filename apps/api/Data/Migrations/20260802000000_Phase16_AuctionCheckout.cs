using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <summary>
    /// Adds the auction checkout desk: winners are no longer charged the instant
    /// a lot closes, they settle up when they collect the item.
    ///
    /// Closing used to fire an off-session Stripe charge immediately, which meant
    /// a golfer could be billed for an item they never picked up, a winner with
    /// no saved card was guaranteed to land in the failed-charge queue, and any
    /// 3DS challenge died as a failure because nobody was there to answer it.
    /// Settling at a desk with the winner present fixes all three.
    ///
    /// Payment and handover are tracked as separate timestamps on purpose: a
    /// guest can pay now and collect later, or walk off with the item and settle
    /// on the way out. Collapsing them into one "checked out" flag would lose the
    /// distinction the desk actually needs.
    ///
    /// settlement_method is nullable because it only becomes true at checkout;
    /// every existing winner row predates the desk and keeps a null.
    ///
    /// No data backfill: auction_items.status gains an 'Unsold' value (statuses
    /// are stored as strings, so this needs no schema change at all), but old
    /// no-bid lots are deliberately left as 'Closed'. Rewriting settled history
    /// to a status that did not exist when those auctions ran would be a lie, and
    /// nothing reads the distinction retroactively.
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260802000000_Phase16_AuctionCheckout")]
    public partial class Phase16_AuctionCheckout : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "settlement_method",
                table: "auction_winners",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "checked_out_at",
                table: "auction_winners",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "picked_up_at",
                table: "auction_winners",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "settled_by_user_id",
                table: "auction_winners",
                type: "uuid",
                nullable: true);

            // No index added: the desk queries winners by player, and player_id
            // is already indexed by EF convention off the Player foreign key.
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "settled_by_user_id", table: "auction_winners");
            migrationBuilder.DropColumn(name: "picked_up_at",       table: "auction_winners");
            migrationBuilder.DropColumn(name: "checked_out_at",     table: "auction_winners");
            migrationBuilder.DropColumn(name: "settlement_method",  table: "auction_winners");
        }
    }
}
