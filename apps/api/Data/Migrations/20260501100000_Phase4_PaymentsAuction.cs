using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GolfFundraiserPro.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Phase4_PaymentsAuction : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ── stripe_customers ──────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "stripe_customers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    player_id = table.Column<Guid>(type: "uuid", nullable: false),
                    stripe_customer_id = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    stripe_payment_method_id = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    card_brand = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    card_last4 = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stripe_customers", x => x.id);
                    table.ForeignKey(
                        name: "FK_stripe_customers_players_player_id",
                        column: x => x.player_id,
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_stripe_customers_player_id_unique",
                table: "stripe_customers",
                column: "player_id",
                unique: true);

            // ── auction_items ─────────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "auction_items",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    photo_urls = table.Column<string>(type: "jsonb", nullable: false),
                    auction_type = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    starting_bid_cents = table.Column<int>(type: "integer", nullable: false),
                    bid_increment_cents = table.Column<int>(type: "integer", nullable: false, defaultValue: 500),
                    buy_now_price_cents = table.Column<int>(type: "integer", nullable: true),
                    current_high_bid_cents = table.Column<int>(type: "integer", nullable: false),
                    closes_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    original_closes_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    max_extension_min = table.Column<int>(type: "integer", nullable: false, defaultValue: 10),
                    display_order = table.Column<int>(type: "integer", nullable: false),
                    donation_denominations = table.Column<string>(type: "jsonb", nullable: true),
                    minimum_bid_cents = table.Column<int>(type: "integer", nullable: true),
                    fair_market_value_cents = table.Column<int>(type: "integer", nullable: false),
                    goal_cents = table.Column<int>(type: "integer", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auction_items", x => x.id);
                    table.ForeignKey(
                        name: "FK_auction_items_events_event_id",
                        column: x => x.event_id,
                        principalTable: "events",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_auction_items_event_id",
                table: "auction_items",
                column: "event_id");

            // ── bids ──────────────────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "bids",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    auction_item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    player_id = table.Column<Guid>(type: "uuid", nullable: false),
                    amount_cents = table.Column<int>(type: "integer", nullable: false),
                    placed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bids", x => x.id);
                    table.ForeignKey(
                        name: "FK_bids_auction_items_auction_item_id",
                        column: x => x.auction_item_id,
                        principalTable: "auction_items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_bids_players_player_id",
                        column: x => x.player_id,
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_bids_auction_item_id",
                table: "bids",
                column: "auction_item_id");

            // ── auction_winners ───────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "auction_winners",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    auction_item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    player_id = table.Column<Guid>(type: "uuid", nullable: false),
                    amount_cents = table.Column<int>(type: "integer", nullable: false),
                    charge_status = table.Column<string>(type: "text", nullable: false),
                    stripe_payment_intent_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    receipt_sent = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auction_winners", x => x.id);
                    table.ForeignKey(
                        name: "FK_auction_winners_auction_items_auction_item_id",
                        column: x => x.auction_item_id,
                        principalTable: "auction_items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_auction_winners_players_player_id",
                        column: x => x.player_id,
                        principalTable: "players",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_auction_winners_auction_item_id",
                table: "auction_winners",
                column: "auction_item_id");

            // ── auction_sessions ──────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "auction_sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    current_item_id = table.Column<Guid>(type: "uuid", nullable: true),
                    current_called_amount_cents = table.Column<int>(type: "integer", nullable: false),
                    started_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ended_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auction_sessions", x => x.id);
                    table.ForeignKey(
                        name: "FK_auction_sessions_events_event_id",
                        column: x => x.event_id,
                        principalTable: "events",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_auction_sessions_auction_items_current_item_id",
                        column: x => x.current_item_id,
                        principalTable: "auction_items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_auction_sessions_event_id",
                table: "auction_sessions",
                column: "event_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "auction_sessions");
            migrationBuilder.DropTable(name: "auction_winners");
            migrationBuilder.DropTable(name: "bids");
            migrationBuilder.DropTable(name: "auction_items");
            migrationBuilder.DropTable(name: "stripe_customers");
        }
    }
}
