using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <summary>
    /// Adds a partial index on auction_items(closes_at) covering only the two
    /// statuses that can still expire.
    ///
    /// WHY: the auction-close Hangfire job runs every 10 seconds, forever, and
    /// asks the same question each time —
    ///     status IN ('Open','Extended') AND closes_at IS NOT NULL AND closes_at &lt;= now()
    /// The only index on the table was event_id, so EXPLAIN showed a Seq Scan
    /// six times a minute across every lot the platform has ever listed. That is
    /// invisible today and grows linearly with the product.
    ///
    /// WHY PARTIAL: closed/awarded lots are the overwhelming majority of the
    /// table over time and can never match, so indexing them would pay storage
    /// and write cost for rows the query provably skips. The filter keeps the
    /// index roughly the size of the live auction.
    ///
    /// NOTE ON THE PREDICATE: AuctionItem.Status is persisted as text
    /// (HasConversion&lt;string&gt;() in ApplicationDbContext), so the filter compares
    /// string literals rather than enum ordinals. It must stay in step with the
    /// AuctionItemStatus names — if a third "still biddable" status is ever
    /// added, this filter and ProcessExpiredItemsAsync change together.
    ///
    /// Deliberately NOT created CONCURRENTLY: EF runs migrations inside a
    /// transaction, and CREATE INDEX CONCURRENTLY cannot. The table is small
    /// enough that the brief lock is not worth splitting the deployment over.
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260920000000_Perf1_AuctionItemsClosesAtIndex")]
    public partial class Perf1_AuctionItemsClosesAtIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_auction_items_closes_at",
                table: "auction_items",
                column: "closes_at",
                filter: "status IN ('Open','Extended')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_auction_items_closes_at",
                table: "auction_items");
        }
    }
}
