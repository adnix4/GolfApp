using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <summary>
    /// Adds donations.paid_at so online (Stripe) donations can be held as
    /// pending until the payment actually succeeds.
    ///
    /// Counting rule after this migration:
    ///   • stripe_payment_intent_id IS NULL              → offline/manual donation, always counted
    ///   • stripe_payment_intent_id IS NOT NULL AND
    ///     paid_at IS NOT NULL                           → online donation, collected, counted
    ///   • stripe_payment_intent_id IS NOT NULL AND
    ///     paid_at IS NULL                               → payment pending/abandoned, NOT counted
    ///
    /// Existing rows all have a null intent id (the widget was pledge-only), so
    /// they keep counting exactly as before and no backfill is required.
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260731000000_Phase15_DonationPaidAt")]
    public partial class Phase15_DonationPaidAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "paid_at",
                table: "donations",
                type: "timestamp with time zone",
                nullable: true);

            // The webhook and the client confirm endpoint both look a donation up
            // by its PaymentIntent id, and the confirm path is anonymous — keep it
            // an index lookup rather than a scan.
            migrationBuilder.CreateIndex(
                name: "IX_donations_stripe_payment_intent_id",
                table: "donations",
                column: "stripe_payment_intent_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_donations_stripe_payment_intent_id",
                table: "donations");

            migrationBuilder.DropColumn(name: "paid_at", table: "donations");
        }
    }
}
